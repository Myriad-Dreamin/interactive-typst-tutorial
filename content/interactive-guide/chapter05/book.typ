#let chapter-info = (kind: "interactive-chapter", title: "排版Ⅰ")

#let chapter(title) = body => [
  #metadata(chapter-info) <interactive-chapter>
  #metadata((kind: "interactive-page", title: title)) <interactive-page>
  = #title
  #body
]

#let pro-tip(body) = block(
  width: 100%,
  inset: 12pt,
  body,
)

#let muted(body) = text(fill: gray, body)
