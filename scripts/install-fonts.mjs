import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { getAllFonts, getFontSourceUrl } from "./font-manifest.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(root, "public/assets/fonts");
const downloadConcurrency = 3;

await mkdir(outputDir, { recursive: true });

const installed = await runWithConcurrency(getAllFonts(), downloadConcurrency, downloadFont);
const totalBytes = installed.reduce((sum, item) => sum + item.bytes, 0);

console.log(
  `Installed ${installed.length} fonts to public/assets/fonts (${formatBytes(totalBytes)}).`
);

async function downloadFont(font) {
  const url = getFontSourceUrl(font);
  const outputPath = join(outputDir, font.fileName);
  const existing = await getFileSize(outputPath);

  if (existing > 0) {
    console.log(`exists ${font.fileName} ${formatBytes(existing)}`);
    return { fileName: font.fileName, bytes: existing };
  }

  console.log(`fetch ${font.fileName}`);
  const response = await fetchWithRetry(url, font.fileName);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${font.fileName}: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath, { flags: "wx" }));
  } catch (error) {
    await unlink(outputPath).catch(() => undefined);
    throw error;
  }

  const bytes = await getFileSize(outputPath);
  console.log(`done ${font.fileName} ${formatBytes(bytes)}`);
  return { fileName: font.fileName, bytes };
}

async function fetchWithRetry(url, fileName) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);

      if (!response.ok || !response.body) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      console.warn(`retry ${fileName} attempt ${attempt}/3 failed: ${String(error)}`);

      if (attempt < 3) {
        await delay(800 * attempt);
      }
    }
  }

  throw new Error(`Failed to download ${fileName}: ${String(lastError)}`);
}

async function runWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getFileSize(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
