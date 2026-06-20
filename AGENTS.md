# AGENTS.md

## Content Principles

- 每一章分为多个步骤，每个步骤的内容尽量不要超过一页。
- 章节内容放在 `content/interactive-guide/chapterXX/` 中，目录名作为章节 id，例如 `chapter01`。
- 每章必须有固定格式的 `index.typ`，只写按阅读顺序排列的 `#include "title.typ"` 行。
- 每章的 `book.typ` 必须声明 `#let chapter-info = (kind: "interactive-chapter", title: "章节标题")`，并由 `chapter()` 宏输出 `<interactive-chapter>` metadata。
- 页面文件必须用标题或语义 slug 命名，不能使用 `p1.typ`、`p2.typ` 这类序号占位文件名。
- 每个页面文件用 `#show: chapter("页面标题")` 声明可 query 的页面 metadata，并通过 `#import "book.typ"` 使用章节宏。
- 新增章节时只新增匹配的章节目录和 `index.typ`，前端通过 Vite `import.meta.glob` 自动收集并按章节号排序。
