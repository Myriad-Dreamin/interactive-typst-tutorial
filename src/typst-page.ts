export type TypstPageParams = {
  cssWidthPx: number;
  cssHeightPx: number;
  marginXPx: number;
  marginYPx: number;
  widthPt: number;
  heightPt: number;
  marginXPt: number;
  marginYPt: number;
};

const CSS_PX_TO_PT = 0.75;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toPt(px: number): number {
  return Number((px * CSS_PX_TO_PT).toFixed(2));
}

function formatPt(value: number): string {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}pt`;
}

export function measureTypstPage(host: HTMLElement): TypstPageParams {
  const rect = host.getBoundingClientRect();
  const cssWidthPx = Math.max(Math.floor(rect.width), 1);
  const cssHeightPx = Math.max(Math.floor(rect.height), 1);
  const marginXPx = Math.round(clamp(cssWidthPx * 0.095, 44, 96));
  const marginYPx = Math.round(clamp(cssHeightPx * 0.075, 32, 60));

  return {
    cssWidthPx,
    cssHeightPx,
    marginXPx,
    marginYPx,
    widthPt: toPt(cssWidthPx),
    heightPt: toPt(cssHeightPx),
    marginXPt: toPt(marginXPx),
    marginYPt: toPt(marginYPx)
  };
}

export function buildTypstPreviewSource(source: string, page: TypstPageParams): string {
  return `#set page(
  width: ${formatPt(page.widthPt)},
  height: ${formatPt(page.heightPt)},
  margin: (x: ${formatPt(page.marginXPt)}, y: ${formatPt(page.marginYPt)}),
)

${source}`;
}

export function applyTypstPageParams(host: HTMLElement, page: TypstPageParams) {
  host.style.setProperty("--typst-page-width", `${page.cssWidthPx}px`);
  host.style.setProperty("--typst-page-height", `${page.cssHeightPx}px`);
  host.style.setProperty("--typst-page-margin-x", `${page.marginXPx}px`);
  host.style.setProperty("--typst-page-margin-y", `${page.marginYPx}px`);
  host.dataset.typstPageWidth = formatPt(page.widthPt);
  host.dataset.typstPageHeight = formatPt(page.heightPt);
  host.dataset.typstPageMarginX = formatPt(page.marginXPt);
  host.dataset.typstPageMarginY = formatPt(page.marginYPt);
}

