import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

const TOKYO_NIGHT_THEME = "tokyo-night";
const LIGHT_THEME = "typst-tutorial-light";
let monacoConfigured = false;

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment: {
    getWorker: () => Worker;
  };
};

monacoGlobal.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  }
};

export type SourceEditor = monaco.editor.IStandaloneCodeEditor;

export function createSourceEditor(container: HTMLElement, source: string): SourceEditor {
  configureMonaco();

  return monaco.editor.create(container, {
    value: source,
    language: "typst",
    theme: getSourceEditorTheme(),
    automaticLayout: true,
    readOnly: false,
    fontFamily:
      "'BlexMono Nerd Font Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    fontSize: 14,
    lineHeight: 24,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    renderLineHighlight: "line",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    wrappingIndent: "same",
    fixedOverflowWidgets: true,
    contextmenu: true,
    cursorBlinking: "solid",
    cursorStyle: "line-thin",
    padding: { top: 18, bottom: 18 },
    scrollbar: {
      vertical: "auto",
      horizontal: "auto",
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      alwaysConsumeMouseWheel: false
    }
  });
}

export function setSourceEditorTheme() {
  configureMonaco();
  monaco.editor.setTheme(getSourceEditorTheme());
}

function getSourceEditorTheme() {
  return document.documentElement.dataset.theme === "light" ? LIGHT_THEME : TOKYO_NIGHT_THEME;
}

function configureMonaco() {
  if (monacoConfigured) {
    return;
  }

  registerTypstLanguage();
  defineTokyoNightTheme();
  defineLightTheme();
  monacoConfigured = true;
}

function registerTypstLanguage() {
  monaco.languages.register({
    id: "typst",
    aliases: ["Typst", "typst"],
    extensions: [".typ"],
    mimetypes: ["text/x-typst"]
  });

  monaco.languages.setLanguageConfiguration("typst", {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"]
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"]
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "`", close: "`" },
      { open: "$", close: "$" }
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "`", close: "`" },
      { open: "$", close: "$" }
    ]
  });

  monaco.languages.setMonarchTokensProvider("typst", {
    tokenPostfix: ".typ",
    brackets: [
      { open: "{", close: "}", token: "delimiter.curly" },
      { open: "[", close: "]", token: "delimiter.square" },
      { open: "(", close: ")", token: "delimiter.parenthesis" }
    ],
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/^=+\s.*$/, "type.identifier"],
        [/^[-+]\s+/, "keyword.list"],
        [/^\d+\.\s+/, "number"],
        [/\$[^$]*\$/, "string.math"],
        [/`[^`]*`/, "string.inline"],
        [/#(import|include|let|set|show|if|else|for|while|return|in)\b/, "keyword"],
        [
          /#([a-zA-Z_][\w-]*)(?=\()/,
          "support.function"
        ],
        [/\b(true|false|none|auto)\b/, "constant.language"],
        [/\b\d+(\.\d+)?(pt|em|rem|cm|mm|in|deg|rad|%)?\b/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string.quote", "@string"],
        [/[{}()[\]]/, "@brackets"],
        [/[,:;]/, "delimiter"],
        [/[+\-*/=<>!&|]+/, "operator"],
        [/[a-zA-Z_][\w-]*/, "identifier"]
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"]
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string.quote", "@pop"]
      ]
    }
  });
}

function defineTokyoNightTheme() {
  monaco.editor.defineTheme(TOKYO_NIGHT_THEME, {
    base: "vs-dark",
    inherit: true,
    colors: {
      "editor.background": "#1a1b26",
      "editor.foreground": "#a9b1d6",
      "editorCursor.foreground": "#c0caf5",
      "editor.lineHighlightBackground": "#1e202e",
      "editorLineNumber.foreground": "#363b54",
      "editorLineNumber.activeForeground": "#737aa2",
      "editor.selectionBackground": "#515c7e40",
      "editor.inactiveSelectionBackground": "#515c7e25",
      "editorIndentGuide.background1": "#1e202e",
      "editorIndentGuide.activeBackground1": "#363b54",
      "editorWhitespace.foreground": "#363b54",
      "editor.findMatchBackground": "#3d59a166",
      "editor.findMatchBorder": "#e0af68",
      "editor.findMatchHighlightBackground": "#3d59a166",
      "editorWidget.background": "#16161e",
      "editorWidget.border": "#101014",
      "scrollbarSlider.background": "#868bc415",
      "scrollbarSlider.hoverBackground": "#868bc410",
      "scrollbarSlider.activeBackground": "#868bc422"
    },
    rules: [
      { token: "", foreground: "a9b1d6" },
      { token: "comment", foreground: "444b6a", fontStyle: "italic" },
      { token: "type.identifier", foreground: "7aa2f7", fontStyle: "bold" },
      { token: "keyword", foreground: "bb9af7" },
      { token: "keyword.list", foreground: "9abdf5" },
      { token: "support.function", foreground: "7dcfff" },
      { token: "constant.language", foreground: "ff9e64" },
      { token: "number", foreground: "ff9e64" },
      { token: "string", foreground: "9ece6a" },
      { token: "string.inline", foreground: "bb9af7" },
      { token: "string.math", foreground: "73daca" },
      { token: "string.escape", foreground: "89ddff" },
      { token: "string.invalid", foreground: "f7768e" },
      { token: "operator", foreground: "89ddff" },
      { token: "delimiter", foreground: "9abdf5" },
      { token: "delimiter.curly", foreground: "9abdf5" },
      { token: "delimiter.square", foreground: "9abdf5" },
      { token: "delimiter.parenthesis", foreground: "9abdf5" },
      { token: "identifier", foreground: "c0caf5" }
    ]
  });
}

function defineLightTheme() {
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    colors: {
      "editor.background": "#fbfaf7",
      "editor.foreground": "#2f332f",
      "editorCursor.foreground": "#1f6f68",
      "editor.lineHighlightBackground": "#edf3f0",
      "editorLineNumber.foreground": "#9ba6a8",
      "editorLineNumber.activeForeground": "#43606a",
      "editor.selectionBackground": "#8ccfc455",
      "editor.inactiveSelectionBackground": "#8ccfc42f",
      "editorIndentGuide.background1": "#dfe7e5",
      "editorIndentGuide.activeBackground1": "#bacac7",
      "editorWhitespace.foreground": "#c6d0ce",
      "editor.findMatchBackground": "#e0af6866",
      "editor.findMatchBorder": "#b46d35",
      "editor.findMatchHighlightBackground": "#e0af6838",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#d8e0df",
      "scrollbarSlider.background": "#6d7b801c",
      "scrollbarSlider.hoverBackground": "#6d7b802c",
      "scrollbarSlider.activeBackground": "#6d7b8040"
    },
    rules: [
      { token: "", foreground: "2f332f" },
      { token: "comment", foreground: "7a8690", fontStyle: "italic" },
      { token: "type.identifier", foreground: "2f6fb7", fontStyle: "bold" },
      { token: "keyword", foreground: "7c56a5" },
      { token: "keyword.list", foreground: "3b7d8f" },
      { token: "support.function", foreground: "1b7484" },
      { token: "constant.language", foreground: "a85623" },
      { token: "number", foreground: "a85623" },
      { token: "string", foreground: "4f7a24" },
      { token: "string.inline", foreground: "7c56a5" },
      { token: "string.math", foreground: "1f6f68" },
      { token: "string.escape", foreground: "237ea1" },
      { token: "string.invalid", foreground: "b83242" },
      { token: "operator", foreground: "237ea1" },
      { token: "delimiter", foreground: "49636b" },
      { token: "delimiter.curly", foreground: "49636b" },
      { token: "delimiter.square", foreground: "49636b" },
      { token: "delimiter.parenthesis", foreground: "49636b" },
      { token: "identifier", foreground: "30363d" }
    ]
  });
}
