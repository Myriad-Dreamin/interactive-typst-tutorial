import type { Chapter, ChapterCatalogItem, TypstSourceFile } from "./types";

type RawModuleLoader = () => Promise<string>;

type InternalChapterCatalogItem = ChapterCatalogItem & {
  sortIndex: number;
};

type ParsedChapterMetadata = {
  title: string;
};

const contentRoot = "../../content/interactive-guide/";

const chapterIndexModules = import.meta.glob<string>(
  "../../content/interactive-guide/chapter*/index.typ",
  {
    query: "?raw",
    import: "default"
  }
);

const chapterSourceModules = import.meta.glob<string>(
  "../../content/interactive-guide/chapter*/**/*.typ",
  {
    query: "?raw",
    import: "default"
  }
);

const chapterMetadataModules = import.meta.glob<string>(
  "../../content/interactive-guide/chapter*/book.typ",
  {
    query: "?raw",
    import: "default",
    eager: true
  }
);

const sharedSourceModules = import.meta.glob<string>(
  "../../content/interactive-guide/shared/**/*.typ",
  {
    query: "?raw",
    import: "default"
  }
);

const internalChapterCatalog = Object.entries(chapterIndexModules)
  .map(([path, loadIndex]) => createChapterCatalogItem(path, loadIndex))
  .sort(compareChapterCatalogItems);

if (internalChapterCatalog.length === 0) {
  throw new Error("No chapters matched content/interactive-guide/chapter*/index.typ");
}

export const chapterCatalog: ChapterCatalogItem[] = internalChapterCatalog;
export const defaultChapterId = chapterCatalog[0].id;

export async function loadChapter(chapterId = defaultChapterId): Promise<Chapter> {
  const item = chapterCatalog.find((chapter) => chapter.id === chapterId);

  if (!item) {
    throw new Error(`Unknown chapter: ${chapterId}`);
  }

  return item.loader();
}

function createChapterCatalogItem(
  path: string,
  loadIndex: RawModuleLoader
): InternalChapterCatalogItem {
  const id = getChapterIdFromIndexPath(path);
  const sortIndex = getChapterSortIndex(id);
  const number = getChapterNumber(id);
  const fallbackTitle = getFallbackChapterTitle(id, number);
  const metadataPath = `${getDirectoryPath(path)}/book.typ`;
  const metadataSource = chapterMetadataModules[metadataPath];

  return {
    id,
    number,
    title: metadataSource ? parseChapterMetadata(metadataSource, metadataPath).title : fallbackTitle,
    sortIndex,
    loader: async () => loadChapterFromIndex(await loadIndex(), path)
  };
}

async function loadChapterFromIndex(rawIndex: string, indexPath: string): Promise<Chapter> {
  const id = getChapterIdFromIndexPath(indexPath);
  const number = getChapterNumber(id);
  const chapterDirectory = getDirectoryPath(indexPath);
  const fallbackTitle = getFallbackChapterTitle(id, number);
  const metadata = await loadChapterMetadata(chapterDirectory, fallbackTitle);
  const includes = parseIndexIncludes(rawIndex, indexPath);
  const steps = await Promise.all(
    includes.map(async (includePath) => {
      const pagePath = `${chapterDirectory}/${includePath}`;
      const loadPage = chapterSourceModules[pagePath];

      if (!loadPage) {
        throw new Error(`Included page not found: ${pagePath}`);
      }

      return parsePage(await loadPage(), pagePath, includePath);
    })
  );

  if (steps.length === 0) {
    throw new Error(`Chapter ${indexPath} does not include any pages`);
  }

  return {
    id,
    number,
    title: metadata.title,
    deck: "",
    sourceFiles: await loadSourceFiles(chapterDirectory),
    steps
  };
}

async function loadChapterMetadata(
  chapterDirectory: string,
  fallbackTitle: string
): Promise<ParsedChapterMetadata> {
  const bookPath = `${chapterDirectory}/book.typ`;
  const loadBook = chapterSourceModules[bookPath];

  if (!loadBook) {
    return { title: fallbackTitle };
  }

  const metadataSource = await loadBook();
  return parseChapterMetadata(metadataSource, bookPath);
}

function parseChapterMetadata(rawBook: string, bookPath: string): ParsedChapterMetadata {
  const metadataDirective = rawBook.match(
    /^#let\s+chapter-info\s*=\s*\([^)]*\btitle:\s*("(?:[^"\\]|\\.)*")[^)]*\)\s*$/m
  );

  if (!metadataDirective) {
    throw new Error(`Chapter ${bookPath} must declare #let chapter-info = (..., title: "章节标题")`);
  }

  return {
    title: parseTypstString(metadataDirective[1], bookPath)
  };
}

function parseIndexIncludes(rawIndex: string, indexPath: string): string[] {
  const includes: string[] = [];

  for (const [lineIndex, line] of rawIndex.split(/\r?\n/).entries()) {
    const lineNumber = lineIndex + 1;
    const includeDirective = line.match(/^#include\s+"([^"]+\.typ)"\s*$/);

    if (line.trim() === "") {
      continue;
    }

    if (!includeDirective) {
      throw new Error(
        `Invalid chapter index line in ${indexPath}:${lineNumber}. Expected #include "title.typ".`
      );
    }

    const includePath = includeDirective[1];

    if (includePath.includes("/") || includePath.includes("\\") || includePath.startsWith(".")) {
      throw new Error(`Chapter page include must be a local title file in ${indexPath}:${lineNumber}`);
    }

    if (includePath === "index.typ" || includePath === "book.typ") {
      throw new Error(`Chapter page include cannot target ${includePath} in ${indexPath}:${lineNumber}`);
    }

    includes.push(includePath);
  }

  return includes;
}

function parsePage(rawPage: string, pagePath: string, includePath: string): Chapter["steps"][number] {
  const source = trimBlankLines(rawPage.split(/\r?\n/));
  const title = parsePageTitle(source, pagePath);

  if (!source) {
    throw new Error(`Page ${pagePath} has no Typst source`);
  }

  return {
    id: includePath.replace(/\.typ$/u, ""),
    title,
    sourcePath: toContentSourcePath(pagePath),
    source
  };
}

async function loadSourceFiles(chapterDirectory: string): Promise<TypstSourceFile[]> {
  const sourceEntries = [
    ...Object.entries(sharedSourceModules),
    ...Object.entries(chapterSourceModules).filter(([path]) => path.startsWith(`${chapterDirectory}/`))
  ].sort(([left], [right]) => left.localeCompare(right));

  return Promise.all(
    sourceEntries.map(async ([path, loadSource]) => ({
      path: toContentSourcePath(path),
      source: await loadSource()
    }))
  );
}

function parsePageTitle(source: string, pagePath: string): string {
  let title: string | null = null;

  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    const lineNumber = lineIndex + 1;
    const showDirective = line.match(/^\s*#show:\s*chapter\(("(?:[^"\\]|\\.)*")\)\s*$/);

    if (showDirective) {
      if (title !== null) {
        throw new Error(`Page ${pagePath} defines multiple chapter metadata show rules`);
      }

      title = parseTypstString(showDirective[1], `${pagePath}:${lineNumber}`);
      continue;
    }

    if (line.match(/^\s*#show:\s*chapter\b/)) {
      throw new Error(`Malformed chapter metadata show rule in ${pagePath}:${lineNumber}`);
    }
  }

  if (title === null) {
    throw new Error(`Page ${pagePath} must declare metadata with #show: chapter("title")`);
  }

  return title;
}

function trimBlankLines(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end).join("\n");
}

function parseTypstString(value: string, location: string) {
  try {
    return JSON.parse(value) as string;
  } catch {
    throw new Error(`Invalid Typst string literal in ${location}`);
  }
}

function getDirectoryPath(path: string) {
  return path.slice(0, path.lastIndexOf("/"));
}

function toContentSourcePath(path: string) {
  if (!path.startsWith(contentRoot)) {
    throw new Error(`Unexpected content source path: ${path}`);
  }

  return path.slice(contentRoot.length);
}

function getChapterIdFromIndexPath(path: string) {
  return getDirectoryPath(path).split("/").pop() ?? path;
}

function getChapterSortIndex(id: string) {
  const match = id.match(/^chapter[-_]?(\d+)/u);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function getChapterNumber(id: string) {
  const sortIndex = getChapterSortIndex(id);
  return Number.isFinite(sortIndex) ? String(sortIndex).padStart(2, "0") : "00";
}

function getFallbackChapterTitle(id: string, number: string) {
  const title = id.replace(/^chapter[-_]?\d+[-_]?/u, "").replaceAll(/[-_]+/gu, " ");
  return title ? title.replace(/^\w/u, (value) => value.toUpperCase()) : `第 ${number} 章`;
}

function compareChapterCatalogItems(
  left: InternalChapterCatalogItem,
  right: InternalChapterCatalogItem
) {
  if (left.sortIndex !== right.sortIndex) {
    return left.sortIndex - right.sortIndex;
  }

  return left.id.localeCompare(right.id, undefined, { numeric: true });
}
