# Workbench 与 Designer 前端注意事项

本文只记录容易重复出现、无法从组件类型直接判断的前端交互约束。修改 Select、popup、portal、focus
或 outside-click 行为时阅读对应小节；普通样式和布局修改不需要展开本文。

## Select 与原生 label

项目的共享 `Select` 基于 shadcn/Base UI `Combobox`，单选模式同时启用以下行为：

- 选择后关闭菜单；
- 选择后 blur 内部 input；
- 内部 input 获得 focus 时打开菜单。

不要用原生 `<label>` 包住整个 `Select`。如果下拉 option 也是该 label 的后代，选择 option 后浏览器会
执行 label 的默认激活行为，再次聚焦内部 input。菜单因此在关闭后立即重开，视觉上表现为“选择后无法
自动关闭”。

只需要布局和可见标题时，使用非 label 容器：

```tsx
<div className="field">
  <span>Trigger</span>
  <Select options={options} />
</div>
```

需要表单标签语义时，让 label 和 Select 成为兄弟，通过 `htmlFor` 与 `inputId` 关联。这样点击标签仍会
聚焦 Select，但 option 不在 label 内，不会在选择完成后再次触发聚焦：

```tsx
<div className="field">
  <label htmlFor="trigger-select">Trigger</label>
  <Select inputId="trigger-select" options={options} />
</div>
```

不要通过关闭 Combobox 的选中后收起、输入 focus 后打开或 keyboard navigation 行为来掩盖这个问题；这些行为被普通 Handle Editor
和其他现有调用依赖。

Select 菜单需要越过滚动容器时，优先保持现有局部 popup container 与必要祖先 `overflow: visible` 约定。不要仅为修复层叠或裁剪问题把菜单改成全局 portal；portal 会改变 outside-click
边界、缩放和主题变量继承。

## Designer 节点控件密度

Designer 节点内部的字段网格、Handle 行和卡片高度共同依赖 `styles/root.scss` 对所有 `button`、`input`、`select` 和 `textarea` 的紧凑归一化，包括
`--widget-height`、宽度、padding 和基础边框。共享 shadcn/Base UI primitive 也会出现在这些节点内部；它们带有 `data-slot`，但仍必须继续接受这套
Designer 归一化，才能与既有节点布局保持一致。

不要在 `styles/root.scss` 用 `:not([data-slot])` 或类似 selector 把所有 shadcn primitive 排除出这套规则。这样会让 Input、Select 和 Button 回到各自的默认
高度，同时节点父级仍按紧凑行高布局，导致字段溢出、列错位和节点尺寸失控。唯一允许的例外是 `[data-canvas-control-scope]` 内的 Button 和 Toggle；
Canvas overlay 不参与节点的紧凑字段网格，必须保留 shadcn 自己的尺寸、圆角和 pressed state。

需要调整节点内某个控件时，应在该控件或节点的局部布局中明确处理，并同时验证对应 Handle 行和节点尺寸；不要通过修改根级控件 selector 隔离整个
primitive 家族。页面级和 Canvas overlay 的 shadcn 组件可以采用自己的原生尺寸，但不能借此改变节点内部的密度合同。
