export class TinymistSvgPreview {
  private app: HTMLElement | null = null;
  private outer: HTMLElement | null = null;

  constructor(private readonly container: HTMLElement) {
    this.refreshElements();
  }

  hasPages() {
    this.refreshElements();
    return !!this.app?.querySelector(".tinymist-svg-pages");
  }

  renderStatus(message: string, options: { preservePages?: boolean } = {}) {
    this.refreshElements();

    if (this.outer) {
      this.outer.dataset.pageMode = "single";
    }

    if (this.app && !options.preservePages) {
      this.app.innerHTML = "";
    }

    this.removeStatus();
    this.container
      .querySelector("#typst-container-main")
      ?.insertAdjacentHTML(
        "beforeend",
        `<div class="tinymist-preview-status">${escapeHtml(message)}</div>`
      );
  }

  renderError(message: string, options: { preservePages?: boolean } = {}) {
    this.refreshElements();

    if (this.outer) {
      this.outer.dataset.pageMode = "single";
    }

    if (this.app && !options.preservePages) {
      this.app.innerHTML = "";
    }

    this.removeStatus();
    this.container
      .querySelector("#typst-container-main")
      ?.insertAdjacentHTML(
        "beforeend",
        `<div class="tinymist-preview-status tinymist-preview-status-error${options.preservePages ? " tinymist-preview-status-compact" : ""}">${escapeHtml(message)}</div>`
      );
  }

  renderPages(svgPages: string[]) {
    this.refreshElements();

    if (!this.app || !this.outer) {
      throw new Error("Tinymist SVG preview shell is incomplete");
    }

    const pages = svgPages.map((svg) => parseSvg(svg));

    if (pages.length === 0) {
      this.renderStatus("Tinymist Preview 暂无输出");
      return;
    }

    this.removeStatus();
    this.outer.dataset.pageMode = pages.length > 1 ? "multi" : "single";

    const pagesRoot = document.createElement("div");
    pagesRoot.className = "tinymist-svg-pages";
    pagesRoot.dataset.pageCount = String(pages.length);

    for (const svg of pages) {
      const page = document.createElement("div");
      page.className = "tinymist-svg-page";
      page.append(svg);
      pagesRoot.append(page);
    }

    this.app.replaceChildren(pagesRoot);
  }

  dispose() {
    this.app = null;
    this.outer = null;
  }

  private refreshElements() {
    this.app = this.container.querySelector<HTMLElement>("#typst-app");
    this.outer = this.container.querySelector<HTMLElement>("#typst-container-main");
  }

  private removeStatus() {
    this.container.querySelector(".tinymist-preview-status")?.remove();
  }
}

function parseSvg(svgSource: string) {
  const doc = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  const svg = doc.documentElement;

  if (parseError || svg.tagName.toLowerCase() !== "svg") {
    throw new Error("Tinymist SVG export is not valid SVG");
  }

  sanitizeSvg(svg);
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  return document.importNode(svg, true);
}

function sanitizeSvg(root: Element) {
  root.querySelectorAll("script, foreignObject").forEach((node) => node.remove());

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();

      if (name.startsWith("on") || value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
