#import "book.typ": chapter, pro-tip, muted

#show: chapter("模块化（多文件）")

#muted[来源：`../tutorial/src/tutorial/doc-modulize.typ`]

本节对应原教程《模块化（多文件）》，在 interactive guide 中作为「脚本即文档」章的一步。先把下面的小节顺序当作路线图，再回到源码面板逐段验证。

小节顺序：

- #text("根目录")
- #text("绝对路径与相对路径")
- #text("「import」语法与「模块」")
- #text("「include」语法与「import」语法的关系")
- #text("控制变量导出的三种方式")
- #text("使用外部库")
- #text("下载外部库")
- #text("库文件夹")
- #text("构建和注册本地库")
- #text("发布库到官方源")
- #text("再谈「根目录」")
- #text("函数与闭包中的路径解析")
- #text("多文件文档")

子主题提示：

- #text("「命名空间」，#text(red, `@preview`)")
- #text("「库名」，#text(eastern, `fletcher`)")
- #text("「版本号」，#text(orange, `0.5.7`)")
- #text("元数据文件")
- #text("入口文件")
- #text("示例库的文件组织")
- #text("工作区内的模板与库")
- #text("主文件和主库文件")

#pro-tip[
  整理重点：

  - #text("确认当前位置：脚本即文档 -> 模块化（多文件）。")
  - #text("按小节顺序记录新语法、函数、类型或排版概念。")
  - #text("遇到代码示例时，优先改动最小参数并观察预览变化。")

]
