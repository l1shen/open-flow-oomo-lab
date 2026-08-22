# Workbench 与 Designer 前端注意事项

本文只记录容易重复出现、无法从组件类型直接判断的前端交互约束。修改 Select、popup、portal、focus
或 outside-click 行为时阅读对应小节；普通样式和布局修改不需要展开本文。

## Select 与原生 label

项目的共享 `Select` 基于 `react-select`，单选模式同时启用以下行为：

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

不要通过修改共享 Select 的 `closeMenuOnSelect`、`blurInputOnSelect` 或 `openMenuOnFocus` 掩盖这个问题；
这些行为被普通 Handle Editor 和其他现有调用依赖。

Select 菜单需要越过滚动容器时，优先保持现有 absolute menu 和 popup container 约定，并让必要祖先
`overflow: visible`。不要仅为修复层叠或裁剪问题把菜单改成全局 portal；portal 会改变 outside-click
边界、缩放和主题变量继承。
