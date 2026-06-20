import { TarFileType, TarReader } from "@gera2ld/tarjs";
import pako from "pako";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  type Disposable
} from "vscode-jsonrpc/browser";
import TinymistWorker from "./ls-worker?worker";
import {
  BOOK_PATH,
  BOOK_URI,
  MAIN_PATH,
  MAIN_URI,
  WORKSPACE_PATH,
  WORKSPACE_URI
} from "./source";

type JsonRpcId = number | string | null;

type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type WorkerMessage = JsonRpcMessage & {
  method?: string;
  params?: {
    type?: string;
    content?: unknown;
  };
};

type FileResult = {
  type: "ok" | "err";
  content?: string;
  error?: string;
};

type FileChange = {
  uri: string;
  content: FileResult;
};

type OpenFile = {
  path: string;
  uri: string;
  text: string;
  version: number;
  opened: boolean;
  languageId: string;
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

type ExportSvgSingleResponse = {
  path?: string | null;
  data?: string | null;
};

type ExportSvgPagedResponse = {
  totalPages?: number;
  total_pages?: number;
  items?: Array<{
    page?: number;
    path?: string | null;
    data?: string | null;
  }>;
};

export class TinymistLspClient {
  readonly worker: Worker;
  readonly reader: BrowserMessageReader;
  readonly writer: BrowserMessageWriter;

  private readonly files = new Map<string, OpenFile>();
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly textEncoder = new TextEncoder();
  private requestId = 1;
  private readyPromise: Promise<void> | null = null;
  private readerDisposable: Disposable | null = null;
  private packagePromiseCache = new Map<string, Promise<void>>();

  constructor(
    private readonly fonts: Uint8Array[],
    private readonly compilerWasm: Uint8Array
  ) {
    this.worker = new TinymistWorker({
      name: "Tinymist Preview Language Server"
    });
    this.reader = new BrowserMessageReader(this.worker);
    this.writer = new BrowserMessageWriter(this.worker);
  }

  async start() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.startInner();
    return this.readyPromise;
  }

  async openOrUpdateMain(text: string) {
    await this.start();
    await this.openOrChangeFile(MAIN_PATH, MAIN_URI, text, "typst");
  }

  async openOrUpdateBook(text: string) {
    await this.start();
    await this.openOrChangeFile(BOOK_PATH, BOOK_URI, text, "typst");
  }

  async startPreview() {
    await this.start();
    await this.sendRequest("workspace/executeCommand", {
      command: "tinymist.doStartPreview",
      arguments: [[MAIN_PATH]]
    });
  }

  async scrollPreview(line: number, character: number) {
    await this.start();
    await this.sendRequest("workspace/executeCommand", {
      command: "tinymist.scrollPreview",
      arguments: [
        "default_preview",
        {
          event: "panelScrollTo",
          filepath: MAIN_PATH,
          line,
          character
        }
      ]
    });
  }

  async exportSvg() {
    await this.start();
    const result = await this.sendRequest("workspace/executeCommand", {
      command: "tinymist.exportSvg",
      arguments: [
        MAIN_PATH,
        {},
        {
          write: false,
          open: false
        }
      ]
    });

    return parseSvgExport(result);
  }

  dispose() {
    this.readerDisposable?.dispose();
    this.readerDisposable = null;
    this.worker.terminate();
    this.pending.forEach(({ reject }) => reject(new Error("Tinymist worker disposed")));
    this.pending.clear();
  }

  private async startInner() {
    await this.waitWorkerMessage("serverWorkerInited", 60_000);
    this.sendWorkerMessage("loadFonts", { fonts: this.fonts });
    await this.waitWorkerMessage("fontsLoaded", 60_000);
    this.sendWorkerMessage("loadWASM", { wasm: this.compilerWasm });
    await this.waitWorkerMessage("WASMLoaded", 180_000);

    this.readerDisposable = this.reader.listen((message) => {
      void this.handleMessage(message as WorkerMessage);
    });

    this.sendWorkerMessage("start", null);
    await this.waitWorkerMessage("serverWorkerReady", 60_000);
    await this.initialize();
  }

  private async initialize() {
    await this.sendRequest("initialize", {
      processId: null,
      clientInfo: {
        name: "interactive-typst-tutorial",
        version: "0.1.0"
      },
      locale: "zh-CN",
      rootPath: WORKSPACE_PATH,
      rootUri: WORKSPACE_URI,
      workspaceFolders: [
        {
          uri: WORKSPACE_URI,
          name: "workspace"
        }
      ],
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true,
          didChangeWatchedFiles: {
            dynamicRegistration: true
          },
          executeCommand: {
            dynamicRegistration: false
          }
        },
        textDocument: {
          synchronization: {
            didSave: true,
            dynamicRegistration: false
          },
          publishDiagnostics: {
            relatedInformation: true
          }
        }
      },
      initializationOptions: {}
    });
    await this.sendNotification("initialized", {});
  }

  private async openOrChangeFile(path: string, uri: string, text: string, languageId: string) {
    const existing = this.files.get(path);

    if (!existing) {
      const file: OpenFile = {
        path,
        uri,
        text,
        version: 1,
        opened: true,
        languageId
      };

      this.files.set(path, file);
      this.files.set(uri, file);
      await this.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId,
          version: file.version,
          text
        }
      });
      return;
    }

    if (existing.text === text && existing.opened) {
      return;
    }

    existing.text = text;
    existing.version += 1;

    if (!existing.opened) {
      existing.opened = true;
      await this.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId,
          version: existing.version,
          text
        }
      });
      return;
    }

    await this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri,
        version: existing.version
      },
      contentChanges: [{ text }]
    });
  }

  private async handleMessage(message: WorkerMessage) {
    if (message.method === "worker") {
      await this.handleWorkerEvent(message);
      return;
    }

    if (isResponse(message)) {
      this.handleResponse(message);
      return;
    }

    if (isRequest(message)) {
      await this.handleRequest(message);
    }
  }

  private async handleWorkerEvent(message: WorkerMessage) {
    const { type, content } = message.params ?? {};

    if (type === "resolvePackage") {
      const request = content as { url: string; packageRoot: string };
      await this.resolvePackage(request.url, request.packageRoot);
    }
  }

  private handleResponse(message: JsonRpcMessage) {
    const id = message.id;

    if (id === undefined) {
      return;
    }

    const pending = this.pending.get(id);

    if (!pending) {
      return;
    }

    this.pending.delete(id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private async handleRequest(message: JsonRpcMessage) {
    const id = message.id;
    const method = message.method;

    if (id === undefined || !method) {
      return;
    }

    try {
      const result = await this.resolveClientRequest(method, message.params);
      await this.writeMessage({
        jsonrpc: "2.0",
        id,
        result
      });
    } catch (error) {
      await this.writeMessage({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private async resolveClientRequest(method: string, params: unknown) {
    if (method === "workspace/configuration") {
      const items = (params as { items?: unknown[] } | null)?.items ?? [];
      return items.map(() => null);
    }

    if (method === "workspace/workspaceFolders") {
      return [{ uri: WORKSPACE_URI, name: "workspace" }];
    }

    if (method === "client/registerCapability" || method === "window/showMessageRequest") {
      return null;
    }

    if (method === "workspace/applyEdit") {
      return { applied: false };
    }

    if (method === "tinymist/fs/watch") {
      await this.handleFsWatch(params as { inserts?: string[]; removes?: string[] });
      return null;
    }

    return null;
  }

  private async handleFsWatch(params: { inserts?: string[]; removes?: string[] }) {
    const inserts: FileChange[] = (params.inserts ?? []).map((uri) => ({
      uri,
      content: this.readFile(uri)
    }));

    await this.sendRequest("tinymist/fsChange", {
      inserts,
      removes: params.removes ?? [],
      isSync: false
    });
  }

  private readFile(uriOrPath: string): FileResult {
    const file = this.files.get(uriOrPath) ?? this.files.get(uriToPath(uriOrPath));

    if (!file) {
      return {
        type: "err",
        error: `File not found: ${uriOrPath}`
      };
    }

    return {
      type: "ok",
      content: bytesToBase64(this.textEncoder.encode(file.text))
    };
  }

  private async resolvePackage(url: string, packageRoot: string) {
    const existingPromise = this.packagePromiseCache.get(packageRoot);

    if (existingPromise) {
      return existingPromise;
    }

    const promise = this.resolvePackageInner(url, packageRoot);
    this.packagePromiseCache.set(packageRoot, promise);
    return promise;
  }

  private async resolvePackageInner(url: string, packageRoot: string) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download Typst package: ${response.status}`);
    }

    const decompressed = pako.ungzip(new Uint8Array(await response.arrayBuffer()));
    const tarReader = await TarReader.load(decompressed.buffer);
    const inserts: FileChange[] = [];

    for (const fileInfo of tarReader.fileInfos) {
      if (fileInfo.type === TarFileType.Dir) {
        continue;
      }

      const path = `${packageRoot}/${fileInfo.name}`;
      const fileContent = new Uint8Array(await tarReader.getFileBlob(fileInfo.name).arrayBuffer());
      const file: OpenFile = {
        path,
        uri: pathToUri(path),
        text: new TextDecoder().decode(fileContent),
        version: 1,
        opened: false,
        languageId: "typst"
      };

      this.files.set(path, file);
      this.files.set(file.uri, file);
      inserts.push({
        uri: path,
        content: {
          type: "ok",
          content: bytesToBase64(fileContent)
        }
      });
    }

    if (inserts.length > 0) {
      await this.sendRequest("tinymist/fsChange", {
        inserts,
        removes: [],
        isSync: false
      });
    }
  }

  private sendRequest(method: string, params: unknown) {
    const id = this.requestId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      void this.writeMessage({
        jsonrpc: "2.0",
        id,
        method,
        params
      });
    });
  }

  private sendNotification(method: string, params: unknown) {
    return this.writeMessage({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  private writeMessage(message: JsonRpcMessage) {
    return this.writer.write(message as Parameters<BrowserMessageWriter["write"]>[0]);
  }

  private sendWorkerMessage(type: string, content: unknown) {
    this.worker.postMessage({
      method: "worker",
      params: {
        type,
        content
      }
    });
  }

  private waitWorkerMessage(type: string, timeout: number) {
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.worker.removeEventListener("message", onMessage);
        reject(new Error(`Waiting for worker message ${type} timed out`));
      }, timeout);

      const onMessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.method !== "worker" || event.data.params?.type !== type) {
          return;
        }

        window.clearTimeout(timer);
        this.worker.removeEventListener("message", onMessage);
        resolve();
      };

      this.worker.addEventListener("message", onMessage);
    });
  }
}

function isResponse(message: JsonRpcMessage) {
  return message.id !== undefined && (Object.hasOwn(message, "result") || !!message.error);
}

function isRequest(message: JsonRpcMessage) {
  return message.id !== undefined && typeof message.method === "string";
}

function uriToPath(uriOrPath: string) {
  if (!uriOrPath.startsWith("file://")) {
    return uriOrPath;
  }

  return decodeURIComponent(new URL(uriOrPath).pathname);
}

function pathToUri(path: string) {
  return `file://${path}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function parseSvgExport(result: unknown) {
  if (!result) {
    throw new Error("Tinymist SVG export returned no data");
  }

  if (isJsonRpcErrorLike(result)) {
    throw new Error(result.message);
  }

  if (isExportSvgSingleResponse(result)) {
    return [base64ToText(result.data)];
  }

  if (isExportSvgPagedResponse(result)) {
    const pages = (result.items ?? [])
      .slice()
      .sort((left, right) => (left.page ?? 0) - (right.page ?? 0))
      .map((item) => item.data)
      .filter((data): data is string => typeof data === "string")
      .map(base64ToText);

    if (pages.length > 0) {
      return pages;
    }
  }

  throw new Error("Tinymist SVG export returned an unexpected response");
}

function isExportSvgSingleResponse(
  result: unknown
): result is ExportSvgSingleResponse & { data: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "data" in result &&
    typeof (result as ExportSvgSingleResponse).data === "string"
  );
}

function isExportSvgPagedResponse(result: unknown): result is ExportSvgPagedResponse {
  return (
    typeof result === "object" &&
    result !== null &&
    "items" in result &&
    Array.isArray((result as ExportSvgPagedResponse).items)
  );
}

function isJsonRpcErrorLike(result: unknown): result is { code: number; message: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    typeof (result as { code?: unknown }).code === "number" &&
    typeof (result as { message?: unknown }).message === "string"
  );
}

function base64ToText(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}
