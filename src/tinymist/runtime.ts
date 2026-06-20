import type { TinymistBootResources } from "./boot-resources";
import { TinymistLspClient } from "./lsp-client";
import {
  buildBookSource,
  buildMainSource,
  measureTypstPage,
  type TutorialTheme,
  type TypstPageParams
} from "./source";
import { TinymistSvgPreview } from "./svg-preview";

type PreviewMount = {
  container: HTMLElement;
  resizeObserver: ResizeObserver;
  resizeTimer: number | null;
};

export class TinymistTutorialRuntime {
  private lspClient: TinymistLspClient | null = null;
  private lspPromise: Promise<TinymistLspClient> | null = null;
  private preview: TinymistSvgPreview | null = null;
  private mount: PreviewMount | null = null;
  private source = "";
  private theme: TutorialTheme = "dark";
  private page: TypstPageParams | null = null;
  private mountToken = 0;
  private renderToken = 0;
  private sourceUpdateTimer: number | null = null;

  constructor(private readonly resources: TinymistBootResources) {}

  async mountPreview(container: HTMLElement, source: string, theme: TutorialTheme) {
    const token = this.mountToken + 1;
    this.mountToken = token;
    this.source = source;
    this.theme = theme;
    this.disposePreview();
    this.renderPreviewShell(container, "正在启动 Tinymist Preview");
    this.preview = new TinymistSvgPreview(container);

    this.mount = {
      container,
      resizeObserver: new ResizeObserver(() => this.queuePageUpdate()),
      resizeTimer: null
    };
    this.mount.resizeObserver.observe(container);
    this.page = measureTypstPage(container);

    try {
      const client = await this.getLspClient();

      if (this.mountToken !== token) {
        return;
      }

      await this.syncBook(client);
      await this.syncMain(client);
      await this.renderCurrentPreview(token, client, { showStatus: true });
    } catch (error) {
      if (this.mountToken === token) {
        this.renderPreviewShell(
          container,
          error instanceof Error ? error.message : "Tinymist Preview 启动失败"
        );
      }
      throw error;
    }
  }

  updateSource(source: string) {
    this.source = source;

    if (this.sourceUpdateTimer !== null) {
      window.clearTimeout(this.sourceUpdateTimer);
    }

    this.sourceUpdateTimer = window.setTimeout(() => {
      this.sourceUpdateTimer = null;
      void this.syncAndRender();
    }, 120);
  }

  replaceSource(source: string) {
    this.source = source;

    if (this.sourceUpdateTimer !== null) {
      window.clearTimeout(this.sourceUpdateTimer);
      this.sourceUpdateTimer = null;
    }

    void this.syncAndRender();
  }

  updateTheme(theme: TutorialTheme) {
    this.theme = theme;
    void this.syncAndRender();
  }

  disposePreview() {
    if (this.sourceUpdateTimer !== null) {
      window.clearTimeout(this.sourceUpdateTimer);
      this.sourceUpdateTimer = null;
    }

    this.preview?.dispose();
    this.preview = null;

    if (this.mount) {
      this.mount.resizeObserver.disconnect();

      if (this.mount.resizeTimer !== null) {
        window.clearTimeout(this.mount.resizeTimer);
      }
    }

    this.mount = null;
  }

  dispose() {
    this.disposePreview();
    this.lspClient?.dispose();
    this.lspClient = null;
    this.lspPromise = null;
  }

  private async getLspClient() {
    if (this.lspClient) {
      return this.lspClient;
    }

    if (!this.lspPromise) {
      this.lspPromise = this.createLspClient();
    }

    this.lspClient = await this.lspPromise;
    return this.lspClient;
  }

  private async createLspClient() {
    const client = new TinymistLspClient(this.resources.fonts, this.resources.compilerWasm);
    await client.start();
    return client;
  }

  private async syncBook(client = this.lspClient) {
    if (!client) {
      return;
    }

    await client.openOrUpdateBook(buildBookSource(this.theme));
  }

  private async syncMain(client = this.lspClient) {
    if (!client || !this.page) {
      return;
    }

    await client.openOrUpdateMain(buildMainSource(this.source, this.page, this.theme));
  }

  private async syncAndRender() {
    const token = this.mountToken;
    const client = await this.getLspClient();

    if (this.mountToken !== token) {
      return;
    }

    await this.syncBook(client);
    await this.syncMain(client);
    await this.renderCurrentPreview(token, client);
  }

  private async renderCurrentPreview(
    mountToken: number,
    client = this.lspClient,
    options: { showStatus?: boolean } = {}
  ) {
    if (!client || !this.preview || !this.mount || this.mountToken !== mountToken) {
      return;
    }

    const renderToken = this.renderToken + 1;
    this.renderToken = renderToken;

    if (options.showStatus || !this.preview.hasPages()) {
      this.preview.renderStatus("正在渲染 Tinymist Preview");
    }

    try {
      const svgPages = await client.exportSvg();

      if (this.mountToken !== mountToken || this.renderToken !== renderToken || !this.preview) {
        return;
      }

      this.preview.renderPages(svgPages);
    } catch (error) {
      if (this.mountToken !== mountToken || this.renderToken !== renderToken || !this.preview) {
        return;
      }

      this.preview.renderError(error instanceof Error ? error.message : "Tinymist Preview 渲染失败", {
        preservePages: this.preview.hasPages()
      });
    }
  }

  private queuePageUpdate() {
    if (!this.mount) {
      return;
    }

    if (this.mount.resizeTimer !== null) {
      window.clearTimeout(this.mount.resizeTimer);
    }

    this.mount.resizeTimer = window.setTimeout(() => {
      if (!this.mount) {
        return;
      }

      this.mount.resizeTimer = null;
      const nextPage = measureTypstPage(this.mount.container);

      if (isSamePage(this.page, nextPage)) {
        return;
      }

      this.page = nextPage;
      void this.syncAndRender();
    }, 80);
  }

  private renderPreviewShell(container: HTMLElement, status: string | null = null) {
    container.innerHTML = `
      <div class="tinymist-preview" id="typst-container" data-tinymist-window>
        <div id="typst-container-top" aria-hidden="true"></div>
        <div id="typst-container-main" data-tinymist-outer>
          <div id="typst-app" data-tinymist-hooked></div>
          ${status ? `<div class="tinymist-preview-status">${escapeHtml(status)}</div>` : ""}
        </div>
      </div>
    `;
  }
}

function isSamePage(left: TypstPageParams | null, right: TypstPageParams) {
  return (
    !!left &&
    left.width === right.width &&
    left.height === right.height &&
    left.marginX === right.marginX &&
    left.marginY === right.marginY
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
