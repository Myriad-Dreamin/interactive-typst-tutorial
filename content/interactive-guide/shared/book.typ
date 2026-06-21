#let _input-int(name, default) = int(sys.inputs.at(name, default: str(default)))

#let _page = (
  width: _input-int("interactive-page-width", 960),
  height: _input-int("interactive-page-height", 720),
  margin-x: _input-int("interactive-page-margin-x", 72),
  margin-y: _input-int("interactive-page-margin-y", 48),
)

#let _theme-name = sys.inputs.at("interactive-theme", default: "dark")
#let _chapter-info = (
  kind: "interactive-chapter",
  title: sys.inputs.at("interactive-chapter-title", default: ""),
)

#let _themes = (
  dark: (
    page-fill: rgb("#1a1d26"),
    text-fill: rgb("#e8dfd2"),
    muted-fill: rgb("#aeb7c7"),
    tip-fill: rgb("#203a40"),
    tip-stroke: rgb("#7dcfff"),
    code-text: rgb("#ffb86c"),
  ),
  light: (
    page-fill: rgb("#fffdf8"),
    text-fill: rgb("#25221f"),
    muted-fill: rgb("#6e6860"),
    tip-fill: rgb("#e9f3f1"),
    tip-stroke: rgb("#1f6f68"),
    code-text: rgb("#7b341e"),
  ),
)
#let _theme = _themes.at(_theme-name, default: _themes.dark)

#let chapter(title) = body => [
  #set page(
    width: _page.width * 1pt,
    height: _page.height * 1pt,
    margin: (x: _page.margin-x * 1pt, y: _page.margin-y * 1pt),
    fill: _theme.page-fill,
  )
  #set text(
    font: ("Charter", "Source Han Serif SC"),
    size: 13pt,
    fill: _theme.text-fill,
    lang: "zh",
    region: "cn",
  )
  #set par(justify: false, leading: 0.72em)
  #show raw: set text(font: ("BlexMono Nerd Font Mono", "Source Han Serif SC"), fill: _theme.code-text)
  #show link: it => text(fill: _theme.tip-stroke, it)
  #metadata(_chapter-info) <interactive-chapter>
  #metadata((kind: "interactive-page", title: title)) <interactive-page>
  = #title
  #body
]

#let pro-tip(body) = block(
  width: 100%,
  inset: 12pt,
  fill: _theme.tip-fill,
  stroke: (left: 2pt + _theme.tip-stroke),
  body,
)

#let muted(body) = text(fill: _theme.muted-fill, body)
