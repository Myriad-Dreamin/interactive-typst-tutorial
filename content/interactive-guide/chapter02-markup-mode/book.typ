#let chapter-info = (kind: "interactive-chapter", title: "标记模式")

#let chapter(title) = body => [
  #metadata(chapter-info) <interactive-chapter>
  #metadata((kind: "interactive-page", title: title)) <interactive-page>
  = #title
  #body
]
