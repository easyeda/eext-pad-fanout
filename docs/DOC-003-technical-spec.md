# DOC-003: 技术规格说明书

## 3.1 文件结构

```
pro-api-sdk/
├── src/
│   └── index.ts           # 插件入口及核心逻辑
├── iframe/
│   └── index.html         # 弹窗UI
├── locales/
│   ├── en.json           # 英文翻译
│   └── zh-Hans.json      # 简体中文翻译
├── extension.json         # 扩展配置
├── docs/                  # Harness Engineering文档
│   ├── README.md
│   ├── DOC-001-*.md
│   ├── DOC-002-*.md
│   └── ...
└── AGENTS.md            # AI上下文文档
```

## 3.2 修改文件清单

| 文件 | 操作 | 修改内容 |
|------|------|----------|
| `src/index.ts` | 新增/修改 | 扇出核心逻辑 |
| `iframe/index.html` | 新增/修改 | 弹窗UI |
| `extension.json` | 修改 | 菜单配置、i18n配置 |
| `locales/en.json` | 修改 | 英文翻译 |
| `locales/zh-Hans.json` | 修改 | 中文翻译 |

## 3.3 EDA API使用清单

### 3.3.1 系统API (eda.sys_*)

| API | 用途 | 使用场景 |
|-----|------|----------|
| `eda.sys_IFrame.show(id)` | 显示弹窗 | 启用扇出模式时 |
| `eda.sys_IFrame.hide(id)` | 隐藏弹窗 | 取消/完成时 |
| `eda.sys_Message.showToast(msg, type)` | 显示提示 | DRC失败、操作完成 |

### 3.3.2 PCB文档API (eda.pcb_*)

| API | 用途 | 使用场景 |
|-----|------|----------|
| `eda.pcb_Document.getActive()` | 获取当前PCB | 全局使用 |
| `eda.pcb_SelectControl.getSelectedPrimitives()` | 获取选中图元 | 选中焊盘 |
| `eda.pcb_SelectControl.deselectAll()` | 取消选中 | 取消操作 |
| `eda.pcb_PrimitiveVia.create(options)` | 创建过孔 | 扇出确认 |
| `eda.pcb_PrimitiveLine.create(options)` | 创建走线 | 扇出确认 |
| `eda.pcb_Drc.check(doc, options)` | DRC检查 | 创建前验证 |

### 3.3.3 PCB事件API (eda.pcb_Event)

| API | 用途 | 使用场景 |
|-----|------|----------|
| `eda.pcb_Event.onMouseClick(callback)` | 鼠标点击 | 选择焊盘/确认扇出 |
| `eda.pcb_Event.onMouseMove(callback)` | 鼠标移动 | 实时预览 |
| `eda.pcb_Event.onKeyDown(callback)` | 键盘按键 | ESC取消 |

### 3.3.4 枚举 (eda.e*)

| 枚举 | 用途 |
|------|------|
| `eda.ePCB_PrimitiveType.Pad` | 焊盘类型判断 |
| `eda.ePCB_PrimitiveViaType.THROUGH` | 通孔类型 |
| `eda.ePCB_PrimitiveViaType.BLIND_BURIED` | 盲埋孔类型 |
| `eda.eSYS_ToastMessageType.Warning` | 警告消息 |
| `eda.eSYS_ToastMessageType.Error` | 错误消息 |
| `eda.eSYS_LogType.Info` | 信息日志 |
| `eda.eSYS_LogType.Error` | 错误日志 |

## 3.4 数据结构

### 3.4.1 FanoutConfig 配置对象

```typescript
interface IFanoutConfig {
	viaType: IViaType; // 过孔类型
	previewVias: string[]; // 预览过孔ID列表
	selectedPad: IPCB_PrimitivePad | null; // 选中的焊盘
	isActive: boolean; // 是否处于扇出模式
}
```

### 3.4.2 ViaType 过孔类型

```typescript
interface IViaType {
	type: 'through' | 'blind_1_2' | 'blind_1_3';
	startLayer: string; // 起始层（盲埋孔使用）
	endLayer: string; // 结束层（盲埋孔使用）
}
```

### 3.4.3 ViaType 配置映射

| type值 | startLayer | endLayer | 说明 |
|--------|------------|----------|------|
| through | - | - | 通孔自动计算 |
| blind_1_2 | 顶层 | 第2层 | 盲孔1-2 |
| blind_1_3 | 顶层 | 第3层 | 盲孔1-3 |

## 3.5 状态机

```
                    ┌─────────────┐
                    │   IDLE      │ ← 初始状态
                    └──────┬──────┘
                           │ 菜单点击 padFanout()
                           ↓
                    ┌─────────────┐
                    │ PAD_SELECTED│ ← 焊盘已选中
                    └──────┬──────┘
                           │ 点击目标位置
                           ↓
                    ┌─────────────┐
                    │ 创建扇出过孔 │
                    │   和走线    │
                    └──────┬──────┘
                           │
                           ↓
                    ┌─────────────┐
                    │   IDLE      │
                    └─────────────┘
```

### 状态说明

| 状态 | 说明 | 进入条件 | 退出条件 |
|------|------|----------|----------|
| IDLE | 初始状态 | 插件加载/操作完成 | 点击菜单 |
| PAD_SELECTED | 焊盘已选中 | 点击焊盘 | 点击目标位置创建扇出 |

## 3.6 事件流

### 3.6.1 启用扇出模式

```
用户点击菜单
    ↓
padFanout()
    ↓
g_config.isActive = true
    ↓
registerEventHandlers()  // 注册鼠标/键盘事件
    ↓
eda.sys_IFrame.show('fanout-dialog')
```

### 3.6.2 选中焊盘

```
用户点击PCB
    ↓
onMouseClick(event)
    ↓
检查 workState == 'IDLE'
    ↓
eda.pcb_SelectControl.getSelectedPrimitives()
    ↓
过滤 Pad 类型图元
    ↓
selectedPad = pad
    ↓
workState = 'PAD_SELECTED'
```

### 3.6.3 创建扇出

```
用户点击目标位置
    ↓
onMouseClick(event)
    ↓
检查 workState == 'PAD_SELECTED'
    ↓
getCurrentMousePosition() 获取目标位置
    ↓
calculateViaPosition(padPos, targetPos) 计算过孔位置
    ↓
createVia(net, x, y, ...) 创建过孔
    ↓
createLine(net, layer, ...) 创建走线
    ↓
showToast('扇出成功')
    ↓
resetState()
    ↓
IDLE
```

## 3.7 常量定义

| 常量名 | 值 | 单位 | 说明 |
|--------|-----|------|------|
| DEFAULT_FANOUT_DISTANCE | 2.54 | mm | 默认扇出距离 |
| DEFAULT_VIA_DIAMETER | 0.6 | mm | 默认过孔直径 |
| DEFAULT_HOLE_DIAMETER | 0.3 | mm | 默认孔径 |

## 3.8 错误码

| 错误码 | 含义 | 处理方式 |
|--------|------|----------|
| E001 | 未检测到活动PCB | 提示用户打开PCB文件 |
| E002 | 未选中焊盘 | 提示用户选择焊盘 |
| E003 | DRC检查失败 | 提示规则冲突，不创建 |
| E004 | 创建过孔失败 | 记录日志，取消操作 |
| E005 | 创建走线失败 | 删除已用过孔，记录日志 |
