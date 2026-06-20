#import "book.typ": chapter, pro-tip, muted

#show: chapter("编译流程")

#muted[来源：`../tutorial/src/tutorial/scripting-main.typ`]

本节对应原教程《编译流程》，在 interactive guide 中作为「排版Ⅰ」章的一步。先把下面的小节顺序当作路线图，再回到源码面板逐段验证。

小节顺序：

- #text("Typst的主函数")
- #text("「`eval`阶段」与「`typeset`阶段」")
- #text("延迟执行")
- #text("模拟Typst的执行")


#pro-tip[
  整理重点：

  - #text("确认当前位置：排版Ⅰ -> 编译流程。")
  - #text("按小节顺序记录新语法、函数、类型或排版概念。")
  - #text("遇到代码示例时，优先改动最小参数并观察预览变化。")

]
