import {
  createTypstRenderer,
  rendererBuildInfo,
  type RenderSession
} from "@myriaddreamin/typst.ts/dist/esm/renderer.mjs";
import renderModule from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";
import { buffer, debounceTime, fromEvent, Observable, Subject, type Subscription, tap } from "rxjs";
import type { BrowserMessageReader, BrowserMessageWriter, Disposable } from "vscode-jsonrpc/browser";
import { TypstPreviewDocument as TypstDocument } from "typst-dom/index.preview.mts";
import {
  PreviewMode,
  type TypstDomHookedElement,
  type TypstDomWindowElement
} from "typst-dom/typst-doc.mts";

type PreviewMessageContent =
  | {
      format: "text";
      data: string;
    }
  | {
      format: "binary";
      data: string;
    };

type PreviewMessage = {
  method?: string;
  params?: {
    content?: PreviewMessageContent;
  };
};

type TypstPosition = {
  page: number;
  x: number;
  y: number;
  distance: number;
};

type PreviewElements = {
  windowElem: TypstDomWindowElement;
  outerElem: HTMLElement;
  hookedElem: TypstDomHookedElement;
};

const NOT_AVAILABLE = "current not available";
const COMMA = new TextEncoder().encode(",");

export class TinymistPreview {
  private readonly subscriptions: Subscription[] = [];
  private readerDisposable: Disposable | null = null;
  private svgDoc: TypstDocument | null = null;
  private rootElem: SVGElement | null = null;
  private disposed = false;
  private disposeInner: (() => void) | null = null;

  constructor(
    private readonly reader: BrowserMessageReader,
    private readonly writer: BrowserMessageWriter,
    private readonly elements: PreviewElements
  ) {}

  async init() {
    const plugin = createTypstRenderer();
    await plugin.init({ getModule: () => renderModule });
    this.setupDrag();

    this.disposeInner = await new Promise<() => void>((resolveDispose) => {
      void plugin.runWithSession((kModule) => {
        const initializePlugin = async () => {
          console.debug("typst renderer initialized", await rendererBuildInfo());
          this.createSvgDocument(kModule);
          const disposeSocket = this.setupSocket();

          return new Promise<void>((resolveKernel) => {
            resolveDispose(() => {
              disposeSocket();
              resolveKernel();
            });
          });
        };

        return initializePlugin();
      });
    });
  }

  dispose() {
    this.disposed = true;
    this.disposeInner?.();
    this.disposeInner = null;
    this.svgDoc?.dispose();
    this.svgDoc = null;
    this.readerDisposable?.dispose();
    this.readerDisposable = null;

    for (const subscription of this.subscriptions.splice(0, this.subscriptions.length)) {
      subscription.unsubscribe();
    }
  }

  private createSvgDocument(kModule: RenderSession) {
    const { windowElem, outerElem, hookedElem } = this.elements;

    if (hookedElem.firstElementChild?.tagName !== "svg") {
      hookedElem.innerHTML = "";
    }

    windowElem.documents = [];
    windowElem.initTypstSvg = (docRoot) => {
      this.rootElem = docRoot;
      this.initPseudoLinks(docRoot);
    };
    windowElem.currentPosition = (elem) => this.currentPosition(elem);
    windowElem.handleTypstLocation = (elem, page, x, y) =>
      this.handleTypstLocation(elem, page, x, y);
    windowElem.typstWebsocket = {
      send: (data) => sendPreviewMessage(this.writer, data)
    };

    this.svgDoc = new TypstDocument({
      windowElem,
      hookedElem,
      kModule,
      previewMode: PreviewMode.Doc,
      retrieveDOMState() {
        return {
          width: outerElem.clientWidth,
          height: outerElem.clientHeight,
          boundingRect: outerElem.getBoundingClientRect()
        };
      }
    });

    windowElem.documents.push(this.svgDoc);
    hookedElem.document = this.svgDoc;

    this.subscriptions.push(
      createResizeObservable(windowElem).subscribe(() => this.svgDoc?.addViewportChange())
    );
    this.subscriptions.push(
      fromEvent(outerElem, "scroll")
        .pipe(debounceTime(500))
        .subscribe(() => this.svgDoc?.addViewportChange())
    );
  }

  private setupSocket() {
    const batchMessageChannel = new Subject<ArrayBuffer>();

    this.readerDisposable = this.reader.listen((message) => {
      if (!isTypstPreviewMessage(message as PreviewMessage)) {
        return;
      }

      const content = (message as PreviewMessage).params?.content;

      if (!content) {
        return;
      }

      const data =
        content.format === "binary"
          ? base64ToArrayBuffer(content.data)
          : new TextEncoder().encode(content.data).buffer;

      batchMessageChannel.next(data);
    });

    void sendPreviewMessage(this.writer, "current");

    this.subscriptions.push(
      batchMessageChannel
        .pipe(buffer(batchMessageChannel.pipe(debounceTime(0))))
        .pipe(tap((messages) => console.debug(`tinymist preview batch ${messages.length}`)))
        .subscribe((messages) => {
          messages.forEach((message) => this.processMessage(message));
        })
    );

    return () => {
      this.readerDisposable?.dispose();
      this.readerDisposable = null;
      batchMessageChannel.complete();
    };
  }

  private processMessage(data: ArrayBuffer) {
    if (this.disposed || !this.svgDoc) {
      return;
    }

    if (!(data instanceof ArrayBuffer)) {
      if (data === NOT_AVAILABLE) {
        return;
      }

      console.error("Tinymist preview data is not an ArrayBuffer", data);
      return;
    }

    const messageData = new Uint8Array(data);
    const messageIndex = messageData.indexOf(COMMA[0]);

    if (messageIndex < 0) {
      return;
    }

    const message = [
      new TextDecoder().decode(messageData.slice(0, messageIndex).buffer),
      messageData.slice(messageIndex + 1)
    ] as [string, Uint8Array];

    if (message[0] === "jump" || message[0] === "viewport") {
      this.handleViewportMessage(message[1]);
      return;
    }

    if (message[0] === "cursor") {
      const [page, x, y] = new TextDecoder().decode(message[1]).split(" ").map(Number);
      this.svgDoc.setCursor(page, x, y);
      this.svgDoc.addViewportChange();
      return;
    }

    if (message[0] === "cursor-paths") {
      const paths = JSON.parse(new TextDecoder().decode(message[1]));
      this.svgDoc.impl.setCursorPaths(paths);
      return;
    }

    if (message[0] === "partial-rendering") {
      this.svgDoc.setPartialRendering(true);
      return;
    }

    if (message[0] === "outline" || message[0] === "invert-colors") {
      return;
    }

    this.svgDoc.addChangement(message as never);
  }

  private handleViewportMessage(data: Uint8Array) {
    const currentPageNumber = this.currentPosition(this.rootElem ?? this.elements.hookedElem)?.page ?? 1;
    const positions = new TextDecoder()
      .decode(data)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const [page, x, y] = positions.reduce(
      (acc, current) => {
        const [nextPage, nextX, nextY] = current.split(" ").map(Number);

        if (Math.abs(nextPage - currentPageNumber) <= Math.abs(acc[0] - currentPageNumber)) {
          return [nextPage, nextX, nextY];
        }

        return acc;
      },
      [Number.MAX_SAFE_INTEGER, 0, 0]
    );

    if (page !== Number.MAX_SAFE_INTEGER && this.rootElem) {
      this.handleTypstLocation(this.rootElem, page, x, y);
    }
  }

  private currentPosition(elem: Element | null): TypstPosition | undefined {
    const root = this.rootElem ?? elem;

    if (!root) {
      return undefined;
    }

    let result: TypstPosition | undefined;
    const hostRect = this.elements.windowElem.getBoundingClientRect();
    const centerX = hostRect.left + hostRect.width * 0.5;
    const centerY = hostRect.top + hostRect.height * 0.5;
    let page = 0;

    for (const child of Array.from(root.children)) {
      if (child.tagName !== "g") {
        continue;
      }

      page += 1;
      const rect = child.getBoundingClientRect();

      if (rect.bottom === 0 && rect.top === 0) {
        continue;
      }

      const distance = Math.hypot(rect.left - centerX, rect.top - centerY);

      if (!result || distance < result.distance) {
        result = {
          page,
          x: rect.left,
          y: rect.top,
          distance
        };
      }
    }

    return result;
  }

  private handleTypstLocation(_elem: Element, pageNo: number, x: number, y: number) {
    if (!this.rootElem) {
      return;
    }

    const pageIndex = pageNo - 1;
    const pageInner = Array.from(this.rootElem.children).find(
      (child) =>
        child instanceof SVGElement &&
        child.classList.contains("typst-page-inner") &&
        child.getAttribute("data-page-number") === pageIndex.toString()
    ) as (SVGElement & { transform?: SVGAnimatedTransformList }) | undefined;

    if (!pageInner) {
      return;
    }

    const rootWidth = Number(this.rootElem.getAttribute("width") ?? 1);
    const rootHeight = Number(this.rootElem.getAttribute("height") ?? 1);
    const dataWidth = Number(this.rootElem.getAttribute("data-width") ?? rootWidth);
    const dataHeight = Number(this.rootElem.getAttribute("data-height") ?? rootHeight);
    const scaleX = rootWidth / dataWidth;
    const scaleY = rootHeight / dataHeight;
    const offsetY = pageInner.transform?.baseVal[0]?.matrix.f ?? 0;

    this.elements.outerElem.scrollTo({
      behavior: "smooth",
      left: Math.max(0, x * scaleX - 32),
      top: Math.max(0, (y + offsetY) * scaleY - 32)
    });
  }

  private initPseudoLinks(docRoot: SVGElement) {
    const links = docRoot.getElementsByClassName("pseudo-link");

    for (const link of Array.from(links)) {
      link.addEventListener("mousemove", () => link.classList.add("hover"));
      link.addEventListener("mouseleave", () => link.classList.remove("hover"));
    }
  }

  private setupDrag() {
    const container = this.elements.outerElem;
    let lastPos = { x: 0, y: 0 };
    let moved = false;

    const mouseMoveHandler = (event: MouseEvent) => {
      const dx = event.clientX - lastPos.x;
      const dy = event.clientY - lastPos.y;

      container.scrollBy(-dx, -dy);
      lastPos = {
        x: event.clientX,
        y: event.clientY
      };
      moved = true;
    };

    const mouseUpHandler = () => {
      container.removeEventListener("mousemove", mouseMoveHandler);
      container.removeEventListener("mouseup", mouseUpHandler);

      if (!moved) {
        document.getSelection()?.removeAllRanges();
      }

      container.style.cursor = "grab";
    };

    container.addEventListener("mousedown", (event) => {
      if ((event.target as HTMLElement | null)?.classList.contains("tsel")) {
        return;
      }

      event.preventDefault();
      lastPos = {
        x: event.clientX,
        y: event.clientY
      };
      moved = false;
      container.style.cursor = "grabbing";
      container.addEventListener("mousemove", mouseMoveHandler);
      container.addEventListener("mouseup", mouseUpHandler);
    });
  }
}

function isTypstPreviewMessage(message: PreviewMessage): message is Required<PreviewMessage> {
  return message.method === "typst-preview" && !!message.params?.content;
}

function sendPreviewMessage(writer: BrowserMessageWriter, data: string | ArrayBuffer) {
  const content: PreviewMessageContent =
    typeof data === "string"
      ? { format: "text", data }
      : { format: "binary", data: arrayBufferToBase64(data) };

  return writer.write({
    jsonrpc: "2.0",
    method: "typst-preview",
    params: {
      content
    }
  } as Parameters<BrowserMessageWriter["write"]>[0]);
}

function createResizeObservable(element: HTMLElement) {
  return new Observable<ResizeObserverEntry[]>((observer) => {
    const resizeObserver = new ResizeObserver((entries) => observer.next(entries));
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  });
}

function base64ToArrayBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function arrayBufferToBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
