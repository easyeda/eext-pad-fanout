# Pad Fanout - Harness Engineering 文档

## 目录

| 编号 | 文档名称 | 说明 |
|------|----------|------|
| [DOC-001](./docs/DOC-001-project-overview.md) | 项目概述 | 项目基本信息、约束条件 |
| [DOC-002](./docs/DOC-002-functional-spec.md) | 功能规格说明书 | 用户流程、功能列表、UI规格 |
| [DOC-003](./docs/DOC-003-technical-spec.md) | 技术规格说明书 | API清单、数据结构、状态机 |
| [DOC-004](./docs/DOC-004-development-guidelines.md) | 开发规范 | 代码风格、命名规范、模块组织 |
| [DOC-005](./docs/DOC-005-code-templates.md) | 代码模板 | 配置文件、代码骨架模板 |
| [DOC-006](./docs/DOC-006-test-plan.md) | 测试计划 | 测试用例、执行检查清单 |
| [DOC-007](./docs/DOC-007-debug-guide.md) | 调试指南 | 调试命令、常见问题排查 |
| [DOC-008](./docs/DOC-008-faq.md) | 常见问题FAQ | 常见问题解答 |

---

## 快速索引

### 文件修改清单

| 文件 | 操作 |
|------|------|
| `src/index.ts` | 新增/修改 |
| `iframe/index.html` | 新增/修改 |
| `extension.json` | 修改 |
| `locales/en.json` | 修改 |
| `locales/zh-Hans.json` | 修改 |
| `docs/*.md` | 新增 |

### API速查

#### 事件监听
- `eda.pcb_Event.onMouseClick(callback)` - 鼠标点击
- `eda.pcb_Event.onMouseMove(callback)` - 鼠标移动
- `eda.pcb_Event.onKeyDown(callback)` - 键盘按键

#### PCB操作
- `eda.pcb_Document.getActive()` - 获取当前PCB
- `eda.pcb_SelectControl.getSelectedPrimitives()` - 获取选中图元
- `eda.pcb_PrimitiveVia.create(options)` - 创建过孔
- `eda.pcb_PrimitiveLine.create(options)` - 创建走线
- `eda.pcb_Drc.check(doc, options)` - DRC检查

#### UI
- `eda.sys_IFrame.show(id)` - 显示弹窗
- `eda.sys_IFrame.hide(id)` - 隐藏弹窗
- `eda.sys_Message.showToast(msg, type)` - 提示消息

### 操作流程

```
菜单点击 → 启用扇出模式 → 点击焊盘选中 → 鼠标移动预览 → 左键确认 / 右键取消
```

### 版本信息

| 项目 | 版本 |
|------|------|
| 插件版本 | 1.0.0 |
| SDK版本 | >= 1.3.0 |
| EDA版本 | >= 3.0.0 |
