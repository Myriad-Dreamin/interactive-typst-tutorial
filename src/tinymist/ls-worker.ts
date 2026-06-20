import init, { TinymistLanguageServer } from "tinymist";
import tinymistWasmUrl from "tinymist/tinymist_bg.wasm?url";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
  type MessageConnection
} from "vscode-jsonrpc/browser";
import { PACKAGE_ROOT } from "./source";

type WorkerMessage = {
  method?: string;
  params?: {
    type?: string;
    content?: unknown;
  };
};

type TinymistBridge = InstanceType<typeof TinymistLanguageServer>;

function sendWorkerMessage(type: string, content: unknown) {
  self.postMessage({
    method: "worker",
    params: {
      type,
      content
    }
  });
}

class TinymistServer {
  private bridge: TinymistBridge | null = null;
  private readonly events: number[] = [];
  private connection: MessageConnection | null = null;
  private fonts: Uint8Array[] = [];

  constructor() {
    self.addEventListener("message", (event) => {
      void this.handleWorkerMessage(event.data as WorkerMessage);
    });
  }

  private async handleWorkerMessage(message: WorkerMessage) {
    if (message.method !== "worker") {
      return;
    }

    const { type, content } = message.params ?? {};

    if (type === "loadFonts") {
      this.fonts = (content as { fonts?: Uint8Array[] } | null)?.fonts ?? [];
      sendWorkerMessage("fontsLoaded", null);
      return;
    }

    if (type === "loadWASM") {
      await this.loadWasm((content as { wasm?: Uint8Array } | null)?.wasm);
      return;
    }

    if (type === "start") {
      this.start();
      return;
    }

    if (type === "scheduleAsync") {
      this.bridge?.schedule_async();
    }
  }

  private async loadWasm(wasmBytes?: Uint8Array) {
    try {
      await init({ module_or_path: wasmBytes ?? tinymistWasmUrl });
      sendWorkerMessage("WASMLoaded", TinymistLanguageServer.version());
    } catch (error) {
      sendWorkerMessage("WASMLoadFailed", String(error));
      throw error;
    }
  }

  private start() {
    this.setupConnection();
    this.initializeBridge();
    this.setupConnectionHandlers();

    sendWorkerMessage("serverWorkerReady", null);
    this.connection?.listen();
  }

  private setupConnection() {
    const reader = new BrowserMessageReader(self);
    const writer = new BrowserMessageWriter(self);
    this.connection = createMessageConnection(reader, writer);
  }

  private initializeBridge() {
    if (!this.connection) {
      throw new Error("Tinymist connection is not ready");
    }

    this.bridge = new TinymistLanguageServer({
      sendEvent: (event: number) => {
        this.events.push(event);
        queueMicrotask(() => {
          this.flushEvents(null);
          this.bridge?.schedule_async();
        });
      },
      sendRequest: ({ id, method, params }: { id: number; method: string; params: unknown }) => {
        this.connection
          ?.sendRequest(method, params)
          .then((result) => this.bridge?.on_response({ id, result }))
          .catch((error: unknown) => {
            this.bridge?.on_response({
              id,
              error: { code: -32603, message: String(error) }
            });
          });
      },
      sendNotification: ({ method, params }: { method: string; params: unknown }) => {
        this.connection?.sendNotification(method, params);
      },
      resolveFn: (spec: { namespace: string; name: string; version: string }) => {
        const packageRoot = `${PACKAGE_ROOT}/${spec.namespace}/${spec.name}/${spec.version}`;
        const url = `https://packages.typst.org/${spec.namespace}/${spec.name}-${spec.version}.tar.gz`;

        sendWorkerMessage("resolvePackage", { url, packageRoot });
        return packageRoot;
      },
      extraFonts: this.fonts
    });
  }

  private setupConnectionHandlers() {
    if (!this.connection) {
      throw new Error("Tinymist connection is not ready");
    }

    this.connection.onRequest("initialize", (params) =>
      this.flushEvents(this.bridge?.on_request("initialize", params))
    );

    this.connection.onRequest((method, params) =>
      this.flushEvents(this.bridge?.on_request(method, params))
    );

    this.connection.onNotification((method, params) => {
      if (method === "worker") {
        return undefined;
      }

      return this.flushEvents(this.bridge?.on_notification(method, params));
    });
  }

  private flushEvents<T>(result: T) {
    while (this.events.length > 0) {
      const event = this.events.shift();

      if (event !== undefined) {
        this.bridge?.on_event(event);
      }
    }

    return result;
  }
}

new TinymistServer();
sendWorkerMessage("serverWorkerInited", null);
