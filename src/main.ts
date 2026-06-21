import "./styles.css";
import { icon, type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faChevronLeft,
  faChevronRight,
  faMoon,
  faSun
} from "@fortawesome/free-solid-svg-icons";
import { chapterCatalog, defaultChapterId, loadChapter } from "./chapters";
import type { Chapter, ChapterCatalogItem } from "./chapters/types";
import { createSourceEditor, setSourceEditorTheme, type SourceEditor } from "./monaco";
import { getCurrentTheme, initTheme, toggleTheme } from "./theme";
import {
  createInitialBootResourceProgress,
  loadBootResources,
  type BootResourceProgress
} from "./tinymist/boot-resources";
import { TinymistTutorialRuntime } from "./tinymist/runtime";

type AppState = {
  chapterId: string;
  chapter: Chapter | null;
  stepIndex: number;
  error: Error | null;
  requestId: number;
};

type Route = {
  chapterId: string;
  stepIndex: number;
};

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root element");
}

const app: HTMLDivElement = appRoot;

const state: AppState = {
  chapterId: defaultChapterId,
  chapter: null,
  stepIndex: 0,
  error: null,
  requestId: 0
};

let sourceEditor: SourceEditor | null = null;
let isReplacingEditorSource = false;
let tinymistRuntime: TinymistTutorialRuntime | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [chapterId, rawStepIndex] = hash.split("/");
  const parsedStep = Number.parseInt(rawStepIndex ?? "", 10);

  return {
    chapterId: chapterId || defaultChapterId,
    stepIndex: Number.isFinite(parsedStep) ? parsedStep : 0
  };
}

function updateHash() {
  const nextHash = `#/${state.chapterId}/${state.stepIndex}`;

  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  }
}

async function openChapter(chapterId: string, stepIndex = 0) {
  const requestId = state.requestId + 1;

  state.requestId = requestId;
  state.error = null;
  state.chapterId = chapterId;
  state.chapter = null;
  state.stepIndex = stepIndex;
  render();

  try {
    const chapter = await loadChapter(chapterId);

    if (state.requestId !== requestId) {
      return;
    }

    const maxStepIndex = chapter.steps.length - 1;

    state.chapter = chapter;
    state.stepIndex = Math.min(Math.max(stepIndex, 0), maxStepIndex);
    document.title = `${formatChapterLabel(chapter)} · Typst 交互式教程`;
    updateHash();
  } catch (error) {
    if (state.requestId !== requestId) {
      return;
    }

    state.error = error instanceof Error ? error : new Error(String(error));
  }

  render();
}

function setStep(stepIndex: number) {
  if (!state.chapter) {
    return;
  }

  const maxStepIndex = state.chapter.steps.length - 1;

  state.stepIndex = Math.min(Math.max(stepIndex, 0), maxStepIndex);
  updateHash();
  renderStep();
}

function formatChapterLabel(chapter: Pick<Chapter, "number" | "title">): string {
  return `第${formatChineseNumber(chapter.number)}章 ${chapter.title}`;
}

function formatChineseNumber(value: string): string {
  const number = Number.parseInt(value, 10);

  if (!Number.isFinite(number) || number <= 0) {
    return value;
  }

  if (number <= 99) {
    return formatChineseNumberBelow100(number);
  }

  return String(number);
}

function formatChineseNumberBelow100(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

  if (value < 10) {
    return digits[value];
  }

  const tens = Math.floor(value / 10);
  const ones = value % 10;

  if (value === 10) {
    return "十";
  }

  if (value < 20) {
    return `十${digits[ones]}`;
  }

  return `${digits[tens]}十${ones === 0 ? "" : digits[ones]}`;
}

function renderFontAwesome(iconDefinition: IconDefinition, className: string) {
  return icon(iconDefinition, {
    classes: [className]
  }).html.join("");
}

function renderChapterSelector(chapter: Chapter): string {
  return `
    <span class="breadcrumb-menu">
      <button
        class="breadcrumb-item breadcrumb-chapter breadcrumb-menu-button"
        type="button"
        data-action="toggle-chapter-menu"
        aria-haspopup="menu"
        aria-expanded="false"
        title="切换章节"
      >
        <span class="breadcrumb-separator breadcrumb-menu-separator" aria-hidden="true">
          ${renderFontAwesome(faChevronRight, "breadcrumb-separator-icon")}
        </span>
        <span class="breadcrumb-menu-label">${escapeHtml(formatChapterLabel(chapter))}</span>
      </button>
      <span class="chapter-menu" role="menu" hidden>
        ${chapterCatalog
          .map((item) => {
            const selected = item.id === chapter.id;

            return `
              <button
                class="chapter-menu-item ${selected ? "is-current" : ""}"
                type="button"
                role="menuitemradio"
                data-action="select-chapter"
                data-chapter-id="${escapeHtml(item.id)}"
                aria-checked="${selected}"
              >
                <span class="chapter-menu-number">${escapeHtml(`第${formatChineseNumber(item.number)}章`)}</span>
                <span class="chapter-menu-title">${escapeHtml(item.title)}</span>
              </button>
            `;
          })
          .join("")}
      </span>
    </span>
  `;
}

function renderBreadcrumb(): string {
  const chapter = state.chapter;
  const step = chapter?.steps[state.stepIndex];
  const separator = `<span class="breadcrumb-separator" aria-hidden="true">${renderFontAwesome(faChevronRight, "breadcrumb-separator-icon")}</span>`;

  return `
    <nav class="breadcrumb" aria-label="当前位置">
      <span class="breadcrumb-item breadcrumb-root">Typst 交互式教程</span>
      ${
        chapter
          ? renderChapterSelector(chapter)
          : ""
      }
      ${step ? `${separator}<span class="breadcrumb-item breadcrumb-step">${escapeHtml(step.title)}</span>` : ""}
    </nav>
  `;
}

function renderThemeToggle(): string {
  const currentTheme = getCurrentTheme();
  const nextTheme = currentTheme === "dark" ? "亮色" : "暗色";
  const themeIcon = currentTheme === "dark" ? faMoon : faSun;

  return `
    <button
      class="theme-toggle"
      type="button"
      data-action="toggle-theme"
      aria-label="切换到${nextTheme}主题"
      title="切换到${nextTheme}主题"
      aria-pressed="${currentTheme === "dark"}"
    >
      <span class="theme-toggle-icon-only" aria-hidden="true" data-theme-mode="${currentTheme}">
        ${renderFontAwesome(themeIcon, "theme-toggle-fa")}
      </span>
    </button>
  `;
}

function renderStepNavButton(direction: "prev" | "next", disabled: boolean): string {
  const label = direction === "prev" ? "上一节" : "下一节";
  const iconDefinition = direction === "prev" ? faChevronLeft : faChevronRight;

  return `
    <button
      class="nav-icon-button"
      type="button"
      data-action="${direction}"
      aria-label="${label}"
      title="${label}"
      ${disabled ? "disabled" : ""}
    >
      ${renderFontAwesome(iconDefinition, "nav-icon-button-fa")}
    </button>
  `;
}

function refreshThemeToggle() {
  const currentToggle = app.querySelector<HTMLElement>("[data-action='toggle-theme']");

  if (currentToggle) {
    currentToggle.outerHTML = renderThemeToggle();
  }
}

function closeChapterMenu() {
  const menu = app.querySelector<HTMLElement>(".chapter-menu");
  const button = app.querySelector<HTMLButtonElement>("[data-action='toggle-chapter-menu']");

  if (menu) {
    menu.hidden = true;
  }

  if (button) {
    button.setAttribute("aria-expanded", "false");
  }
}

function toggleChapterMenu() {
  const menu = app.querySelector<HTMLElement>(".chapter-menu");
  const button = app.querySelector<HTMLButtonElement>("[data-action='toggle-chapter-menu']");

  if (!menu || !button) {
    return;
  }

  const shouldOpen = menu.hidden;

  menu.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));

  if (shouldOpen) {
    const currentItem = menu.querySelector<HTMLElement>(".chapter-menu-item.is-current");
    currentItem?.scrollIntoView({ block: "nearest" });
  }
}

function selectChapter(item: ChapterCatalogItem) {
  closeChapterMenu();

  if (item.id === state.chapterId) {
    setStep(0);
    return;
  }

  void openChapter(item.id, 0);
}

function disposeSourceEditor() {
  sourceEditor?.dispose();
  sourceEditor = null;
}

function disposePreviewLayout() {
  tinymistRuntime?.disposePreview();
}

function mountSourceEditor(source: string) {
  const container = app.querySelector<HTMLElement>("[data-source-editor]");

  if (!container) {
    return;
  }

  sourceEditor = createSourceEditor(container, source);
  sourceEditor.onDidChangeModelContent(() => {
    if (!sourceEditor || isReplacingEditorSource) {
      return;
    }

    tinymistRuntime?.updateSource(sourceEditor.getValue());
  });
}

function replaceSourceEditorValue(source: string) {
  if (!sourceEditor) {
    mountSourceEditor(source);
    return;
  }

  if (sourceEditor.getValue() === source) {
    return;
  }

  isReplacingEditorSource = true;

  try {
    sourceEditor.setValue(source);
    sourceEditor.setPosition({ lineNumber: 1, column: 1 });
    sourceEditor.revealLine(1);
  } finally {
    isReplacingEditorSource = false;
  }
}

function mountPreviewLayout(chapter: Chapter, step: Chapter["steps"][number]) {
  const previewStage = app.querySelector<HTMLElement>("[data-preview-stage]");
  const runtime = tinymistRuntime;

  if (!previewStage || !runtime) {
    return;
  }

  void runtime
    .mountPreview(
      previewStage,
      step.source,
      step.sourcePath,
      chapter.sourceFiles,
      {
        chapterId: chapter.id,
        chapterTitle: chapter.title
      },
      getCurrentTheme()
    )
    .catch((error: unknown) => {
      console.error("Failed to mount Tinymist preview", error);
    });
}

function updateStepLayout() {
  if (!state.chapter) {
    return;
  }

  const step = state.chapter.steps[state.stepIndex];

  if (!step) {
    return;
  }

  const breadcrumb = app.querySelector<HTMLElement>(".breadcrumb");
  const prevButton = app.querySelector<HTMLButtonElement>("[data-action='prev']");
  const nextButton = app.querySelector<HTMLButtonElement>("[data-action='next']");

  if (breadcrumb) {
    breadcrumb.outerHTML = renderBreadcrumb();
  }

  if (prevButton) {
    prevButton.disabled = state.stepIndex === 0;
  }

  if (nextButton) {
    nextButton.disabled = state.stepIndex === state.chapter.steps.length - 1;
  }
}

function renderStep() {
  if (state.error || !state.chapter || !app.querySelector(".app-shell")) {
    render();
    return;
  }

  const step = state.chapter.steps[state.stepIndex];

  if (!step) {
    state.error = new Error(`Missing step ${state.stepIndex} in ${state.chapter.id}`);
    renderError(state.error);
    return;
  }

  updateStepLayout();
  replaceSourceEditorValue(step.source);
  tinymistRuntime?.replaceSource(step.source, step.sourcePath);
}

function renderBootLoading(progress: BootResourceProgress) {
  const denominator = Math.max(progress.totalBytes, progress.loadedBytes);
  const percent = denominator > 0 ? Math.min(100, (progress.loadedBytes / denominator) * 100) : 0;

  app.innerHTML = `
    <main class="loading-screen boot-screen">
      <div class="boot-panel">
        <p class="eyebrow">Typst 交互式教程</p>
        <h1>正在准备交互式环境</h1>
        <div class="boot-progress" aria-label="资源加载进度">
          <div class="boot-progress-bar">
            <span style="width: ${percent.toFixed(2)}%"></span>
          </div>
          <div class="boot-progress-meta">
            <span>${formatMegabytes(progress.loadedBytes)}</span>
            <span>${formatMegabytes(denominator)}</span>
          </div>
        </div>
        <ul class="boot-resource-list">
          ${progress.groups
            .map(
              (group) => `
                <li class="${group.complete ? "is-complete" : ""}">
                  <span class="boot-resource-dot" aria-hidden="true"></span>
                  <span class="boot-resource-label">${escapeHtml(group.label)}</span>
                  <span class="boot-resource-size">
                    ${formatMegabytes(group.loadedBytes)}
                    ${group.totalBytes > 0 ? ` / ${formatMegabytes(Math.max(group.totalBytes, group.loadedBytes))}` : ""}
                  </span>
                </li>
              `
            )
            .join("")}
        </ul>
      </div>
    </main>
  `;
}

function renderLoading() {
  disposeSourceEditor();
  disposePreviewLayout();
  app.innerHTML = `
    <main class="loading-screen">
      <div>
        <p class="eyebrow">Typst 交互式教程</p>
        <h1>正在加载章节</h1>
      </div>
    </main>
  `;
}

function renderError(error: Error) {
  disposeSourceEditor();
  disposePreviewLayout();
  app.innerHTML = `
    <main class="loading-screen error-screen">
      <div>
        <p class="eyebrow">加载失败</p>
        <h1>${escapeHtml(error.message)}</h1>
        <button class="primary-button" type="button" data-action="retry">重试</button>
      </div>
    </main>
  `;
}

function render() {
  if (state.error) {
    renderError(state.error);
    return;
  }

  if (!state.chapter) {
    renderLoading();
    return;
  }

  const { chapter, stepIndex } = state;
  const step = chapter.steps[stepIndex];

  if (!step) {
    state.error = new Error(`Missing step ${stepIndex} in ${chapter.id}`);
    renderError(state.error);
    return;
  }

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === chapter.steps.length - 1;

  disposeSourceEditor();
  disposePreviewLayout();
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          ${renderBreadcrumb()}
        </div>
        <div class="topbar-actions">
          ${renderThemeToggle()}
          <div class="step-nav-group" aria-label="章节步骤导航">
            ${renderStepNavButton("prev", isFirstStep)}
            ${renderStepNavButton("next", isLastStep)}
          </div>
        </div>
      </header>

      <main class="workspace">
        <section class="source-pane" aria-label="书的源码部分">
          <div class="monaco-host" data-source-editor></div>
        </section>

        <section class="preview-pane" aria-label="书的预览部分">
          <div class="preview-stage" data-preview-stage></div>
        </section>
      </main>
    </div>
  `;
  mountSourceEditor(step.source);
  mountPreviewLayout(chapter, step);
}

app.addEventListener("click", (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-step], [data-action]")
      : null;

  if (!target) {
    return;
  }

  if ("step" in target.dataset) {
    setStep(Number.parseInt(target.dataset.step ?? "0", 10));
    return;
  }

  if (target.dataset.action === "prev") {
    closeChapterMenu();
    setStep(state.stepIndex - 1);
  }

  if (target.dataset.action === "next") {
    closeChapterMenu();
    setStep(state.stepIndex + 1);
  }

  if (target.dataset.action === "retry") {
    if (tinymistRuntime) {
      void openChapter(state.chapterId, state.stepIndex);
    } else {
      void bootstrap(parseHash());
    }
  }

  if (target.dataset.action === "toggle-theme") {
    const theme = toggleTheme();
    setSourceEditorTheme();
    tinymistRuntime?.updateTheme(theme);
    refreshThemeToggle();
  }

  if (target.dataset.action === "toggle-chapter-menu") {
    toggleChapterMenu();
  }

  if (target.dataset.action === "select-chapter") {
    const chapterId = target.dataset.chapterId;
    const item = chapterCatalog.find((chapter) => chapter.id === chapterId);

    if (item) {
      selectChapter(item);
    }
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;

  if (!target || app.contains(target.closest(".breadcrumb-menu"))) {
    return;
  }

  closeChapterMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeChapterMenu();
  }
});

window.addEventListener("hashchange", () => {
  const next = parseHash();

  if (next.chapterId !== state.chapterId || next.stepIndex !== state.stepIndex) {
    if (state.chapter && next.chapterId === state.chapterId) {
      setStep(next.stepIndex);
    } else {
      void openChapter(next.chapterId, next.stepIndex);
    }
  }
});

const initialRoute = parseHash();
initTheme(() => {
  setSourceEditorTheme();
  tinymistRuntime?.updateTheme(getCurrentTheme());
  refreshThemeToggle();
});

void bootstrap(initialRoute);

async function bootstrap(route: Route) {
  renderBootLoading(createInitialBootResourceProgress());

  try {
    const resources = await loadBootResources(renderBootLoading);
    tinymistRuntime = new TinymistTutorialRuntime(resources);
    await openChapter(route.chapterId, route.stepIndex);
  } catch (error) {
    renderError(error instanceof Error ? error : new Error(String(error)));
  }
}
