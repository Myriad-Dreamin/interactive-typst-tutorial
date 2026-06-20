# Typst 交互式教程

本仓库是相邻 `../tutorial` 的交互式部分，使用 VanillaJS、TypeScript ESNext、Vite 和 Monaco Editor 构建。

## 开发

```bash
npm install
npm run assets:fonts
npm run dev
```

## 类型检查

```bash
npm run typecheck
```

## 构建

```bash
npm run assets:fonts
npm run build
```

## 字体

字体来源参考相邻 `../tutorial` 的字体仓库：

- `https://github.com/typst-doc-cn/fonts` 的 `tutorial-v0.1.0` 分支。
- 本项目不使用 submodule，也不提交字体二进制文件。
- 执行 `npm run assets:fonts` 会从 GitHub raw URL 下载本交互式教程实际使用的字体到 `public/assets/fonts/`。

## 内容结构

章节内容位于 `content/interactive-guide/chapterXX/`。每章的 `index.typ` 只写固定格式的 include 列表：

```typst
#include "what-is-typst.typ"
#include "why-learn-typst.typ"
```

每个页面文件使用 `#show: chapter("页面标题")` 声明可 query 的页面 metadata。前端通过 Vite glob 收集章节目录，并按 `index.typ` 顺序加载页面。

源码面板使用 Monaco Editor，可编辑当前步骤的 Typst 源码，默认使用 Tokyo Night 主题；右侧通过 Tinymist WASM 导出 SVG 预览。
