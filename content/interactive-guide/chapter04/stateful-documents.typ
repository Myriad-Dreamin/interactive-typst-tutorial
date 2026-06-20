#import "book.typ": chapter, pro-tip, muted

#show: chapter("状态化")

#muted[来源：`../tutorial/src/tutorial/doc-stateful.typ`]

本节对应原教程《状态化》，在 interactive guide 中作为「脚本即文档」章的一步。先把下面的小节顺序当作路线图，再回到源码面板逐段验证。

小节顺序：

- #text("「`typeset`」阶段的迭代收敛")
- #text("时间维度 -- 控制流")
- #text("空间维度 -- 文档（内容）树")
- #text("任务描述")
- #text("「here」")
- #text("「query」")
- #text("通过查询内置状态制作页眉")
- #text("自定义「状态」（state）")
- #text("「state.update」也是「内容」")
- #text("查询特定时间点的「状态」")
- #text("通过自定义状态制作页眉")


#pro-tip[
  整理重点：

  - #text("确认当前位置：脚本即文档 -> 状态化。")
  - #text("按小节顺序记录新语法、函数、类型或排版概念。")
  - #text("遇到代码示例时，优先改动最小参数并观察预览变化。")

]
