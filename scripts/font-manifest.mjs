const GITHUB_RAW_ROOT = "https://raw.githubusercontent.com/typst-doc-cn/fonts";

export const fontManifest = {
  cjk: [
    {
      fileName: "SourceHanSerifSC-Regular.otf",
      branch: "tutorial-v0.1.0"
    },
    {
      fileName: "SourceHanSerifSC-Bold.otf",
      branch: "tutorial-v0.1.0"
    }
  ],
  latin: [
    {
      fileName: "Charter Regular.ttf",
      branch: "tutorial-v0.1.0"
    },
    {
      fileName: "Charter Bold.ttf",
      branch: "tutorial-v0.1.0"
    },
    {
      fileName: "Charter Italic.ttf",
      branch: "tutorial-v0.1.0"
    },
    {
      fileName: "Charter Bold Italic.ttf",
      branch: "tutorial-v0.1.0"
    },
    {
      fileName: "BlexMonoNerdFontMono-Regular.ttf",
      branch: "tutorial-v0.1.0"
    },
    {
      fileName: "BlexMonoNerdFontMono-Bold.ttf",
      branch: "tutorial-v0.1.0"
    },
    {
      fileName: "BlexMonoNerdFontMono-Italic.ttf",
      branch: "tutorial-v0.1.0"
    }
  ]
};

export function getFontSourceUrl(font) {
  return `${GITHUB_RAW_ROOT}/${font.branch}/${encodeURIComponent(font.fileName)}`;
}

export function getAllFonts() {
  return [...fontManifest.cjk, ...fontManifest.latin];
}
