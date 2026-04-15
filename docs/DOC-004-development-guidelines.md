# DOC-004: 开发规范

## 4.1 代码风格

| 规范 | 要求 |
|------|------|
| 缩进 | **Tab** (不使用空格) |
| 引号 | 单引号 `'` |
| 分号 | 必须 |
| 行尾 | LF |

## 4.2 命名规范

### 4.2.1 类型/接口命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口 | `PascalCase`，以 `I` 开头 | `IFanoutConfig` |
| 类型别名 | `PascalCase`，以 `I` 开头 | `IViaType` |
| 枚举成员 | `PascalCase` | `ViaType.Through` |

### 4.2.2 函数/方法命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 导出函数 | `camelCase` | `padFanout()` |
| 内部函数 | `camelCase` | `calculateAngle()` |
| 事件处理 | `on` + 事件名 | `onMouseClick()` |
| 私有函数 | `_` 前缀 | `_cleanup()` |

### 4.2.3 变量命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 全局变量 | `g_` 前缀 | `g_config` |
| 局部变量 | `camelCase` | `selectedPad` |
| 常量 | `UPPER_SNAKE_CASE` | `DEFAULT_DISTANCE` |
| DOM元素 | `$` 后缀 | `dialogElement$` |

## 4.3 模块组织

```typescript
// ============ 常量定义 ============
const DEFAULT_FANOUT_DISTANCE = 2.54;
const DEFAULT_VIA_DIAMETER = 0.6;

// ============ 类型定义 ============
interface IFanoutConfig {
	viaType: IViaType;
	previewVias: string[];
	selectedPad: unknown | null;
	isActive: boolean;
}

interface IViaType {
	type: 'through' | 'blind_1_2' | 'blind_1_3';
	startLayer: string;
	endLayer: string;
}

// ============ 全局状态 ============
const g_config: IFanoutConfig = {
	viaType: { type: 'through', startLayer: '', endLayer: '' },
	previewVias: [],
	selectedPad: null,
	isActive: false,
};

const g_eventHandlers: unknown = null;

// ============ 主入口函数 ============
export function padFanout(): void {
	g_config.isActive = true;
	registerEventHandlers();
	eda.sys_IFrame.show('fanout-dialog');
}

function deactivate(): void {
	cleanup();
}

// ============ 事件处理函数 ============
function registerEventHandlers(): void {
	// TODO: 注册事件
}

function unregisterEventHandlers(): void {
	// TODO: 注销事件
}

function onMouseClick(e: unknown): void {
	// TODO: 实现
}

function onMouseMove(e: unknown): void {
	// TODO: 实现
}

function onKeyDown(e: unknown): void {
	// TODO: 实现
}

// ============ 核心业务函数 ============
function selectPad(pad: unknown): void { /* TODO */ }
function updatePreview(e: unknown): void { /* TODO */ }
function confirmFanout(e: unknown): void { /* TODO */ }
function cancelFanout(): void { /* TODO */ }
function calculateAngle(padPos: unknown, cursorPos: unknown): number { /* TODO */ }
function createPreviewVia(pad: unknown, angle: number): unknown { /* TODO */ }
function createRealVia(pad: unknown, angle: number): unknown { /* TODO */ }
function createFanoutWire(pad: unknown, via: unknown): void { /* TODO */ }
function checkDrc(via: unknown): boolean { /* TODO */ }

// ============ 辅助函数 ============
function removePreviewVias(): void { /* TODO */ }
function cleanup(): void { /* TODO */ }
```

## 4.4 注释规范

**禁止添加不必要的注释**。代码本身应自解释。

如需注释，只解释：
- **为什么** - 业务原因、设计决策
- **注意事项** - 重要的边界条件

不解释：
- **是什么** - 显而易见的操作
- **怎么做** - 代码本身已清晰表达

## 4.5 错误处理

```typescript
try {
	const doc = eda.pcb_Document.getActive();
	if (!doc) {
		eda.sys_Message.showToast('未检测到活动PCB文档', eda.eSYS_ToastMessageType.Error);
	}
	// 业务逻辑
}
catch (error) {
	eda.sys_Log.log(`扇出失败: ${error}`, eda.eSYS_LogType.Error);
	cleanup();
}
```

## 4.6 日志规范

| 级别 | 使用场景 |
|------|----------|
| Info | 操作开始/完成 |
| Warning | 非致命问题（如参数调整） |
| Error | 操作失败，需要排查 |

```typescript
eda.sys_Log.log('扇出模式已启用', eda.eSYS_LogType.Info);
eda.sys_Log.log(`扇出角度: ${angle}°`, eda.eSYS_LogType.Info);
eda.sys_Log.log(`DRC检查失败: ${result.message}`, eda.eSYS_LogType.Warning);
eda.sys_Log.log(`创建过孔失败: ${error}`, eda.eSYS_LogType.Error);
```

## 4.7 DRC检查规则

| 规则ID | 规则名称 | 检查内容 | 优先级 |
|--------|----------|----------|--------|
| DRC-001 | minViaToViaClearance | 最小过孔间距 | P1 |
| DRC-002 | minViaToTraceClearance | 过孔到走线间距 | P1 |
| DRC-003 | minTraceWidth | 最小走线宽度 | P1 |

## 4.8 事件注册/注销

```typescript
// 注册事件
function registerEventHandlers(): void {
	g_eventHandlers = {
		onMouseClick: eda.pcb_Event.onMouseClick(onMouseClick),
		onMouseMove: eda.pcb_Event.onMouseMove(onMouseMove),
		onKeyDown: eda.pcb_Event.onKeyDown(onKeyDown),
	};
}

// 注销事件
function unregisterEventHandlers(): void {
	if (g_eventHandlers) {
		g_eventHandlers.onMouseClick?.remove();
		g_eventHandlers.onMouseMove?.remove();
		g_eventHandlers.onKeyDown?.remove();
		g_eventHandlers = null;
	}
}
```

## 4.9 iframe通信

```typescript
// 主线程发送消息
window.parent.postMessage({ type: 'fanout-via-type', value: 'through' }, '*');

// 主线程接收消息
window.addEventListener('message', (e) => {
	if (e.data.type === 'show-dialog') {
		// 显示弹窗
	}
});
```
