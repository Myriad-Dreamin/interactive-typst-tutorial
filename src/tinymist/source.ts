export const WORKSPACE_PATH = "/workspace";
export const WORKSPACE_URI = "file:///workspace";
export const PACKAGE_ROOT = `${WORKSPACE_PATH}/.you-know-it-is-for-tinymist/packages`;

export type TutorialTheme = "light" | "dark";

export type TypstPageParams = {
  width: number;
  height: number;
  marginX: number;
  marginY: number;
};

export type TypstInputMap = Record<string, string>;

export type TypstInputContext = {
  chapterId: string;
  chapterTitle: string;
};

export function measureTypstPage(container: HTMLElement): TypstPageParams {
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  return {
    width,
    height,
    marginX: clamp(Math.round(width * 0.08), 36, 72),
    marginY: clamp(Math.round(height * 0.075), 28, 56),
  };
}

export function buildMainSource(source: string) {
  return source;
}

export function buildTypstInputs(
  page: TypstPageParams,
  theme: TutorialTheme,
  context: TypstInputContext
): TypstInputMap {
  return {
    "interactive-theme": theme,
    "interactive-chapter-id": context.chapterId,
    "interactive-chapter-title": context.chapterTitle,
    "interactive-page-width": String(page.width),
    "interactive-page-height": String(page.height),
    "interactive-page-margin-x": String(page.marginX),
    "interactive-page-margin-y": String(page.marginY)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
