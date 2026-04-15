# DOC-005: 代码模板

## 5.1 extension.json 模板

```json
{
	"name": "pad-fanout",
	"uuid": "",
	"displayName": "Pad Fanout",
	"description": "单焊盘扇出过孔插件",
	"version": "1.0.0",
	"entry": "./dist/index",
	"i18n": {
		"en": {
			"pad_fanout": "Pad Fanout",
			"fanout_tools": "Fanout Tools",
			"single_pad_fanout": "Single Pad Fanout",
			"via_type": "Via Type",
			"through": "Through",
			"blind_1_2": "Blind 1-2",
			"blind_1_3": "Blind 1-3",
			"hints": "Left-click: Confirm | Right-click/ESC: Cancel",
			"left_click_confirm": "Left-click: Confirm",
			"right_click_cancel": "Right-click/ESC: Cancel"
		},
		"zh-Hans": {
			"pad_fanout": "单焊盘扇出",
			"fanout_tools": "扇出工具",
			"single_pad_fanout": "单焊盘扇出",
			"via_type": "过孔类型",
			"through": "通孔",
			"blind_1_2": "盲孔1-2",
			"blind_1_3": "盲孔1-3",
			"hints": "左键: 确认扇出 | 右键/ESC: 取消",
			"left_click_confirm": "左键: 确认扇出",
			"right_click_cancel": "右键/ESC: 取消"
		}
	},
	"headerMenus": {
		"pcb": [{
			"id": "Fanout",
			"title": "fanout_tools",
			"menuItems": [{
				"id": "pad-fanout",
				"title": "single_pad_fanout",
				"registerFn": "padFanout"
			}]
		}]
	}
}
```

## 5.2 src/index.ts 完整模板

```typescript
/**
 * 单焊盘扇出过孔插件
 *
 * 功能：选中单个焊盘，根据鼠标方向进行扇出过孔
 * 操作：左键确认扇出，右键/ESC取消
 */

import * as extensionConfig from '../extension.json';

// ============ 常量定义 ============
const DEFAULT_FANOUT_DISTANCE = 2.54; // 100mil
const DEFAULT_VIA_DIAMETER = 0.6;
const DEFAULT_HOLE_DIAMETER = 0.3;

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

interface IEventHandlers {
	onMouseClick: { remove: () => void } | null;
	onMouseMove: { remove: () => void } | null;
	onKeyDown: { remove: () => void } | null;
}

interface Point {
	x: number;
	y: number;
}

// ============ 全局状态 ============
const g_config: IFanoutConfig = {
	viaType: { type: 'through', startLayer: '', endLayer: '' },
	previewVias: [],
	selectedPad: null,
	isActive: false,
};

let g_eventHandlers: IEventHandlers = {
	onMouseClick: null,
	onMouseMove: null,
	onKeyDown: null,
};

// ============ 主入口函数 ============
export function activate(_status?: 'onStartupFinished', _arg?: string): void {
	eda.sys_Log.log(`Pad Fanout v${extensionConfig.version} 已加载`, eda.eSYS_LogType.Info);
}

export function padFanout(): void {
	eda.sys_Log.log('扇出模式已启用', eda.eSYS_LogType.Info);
	g_config.isActive = true;
	registerEventHandlers();
	eda.sys_IFrame.show('fanout-dialog');
}

export function deactivate(): void {
	cleanup();
}

// ============ 事件处理函数 ============
function registerEventHandlers(): void {
	g_eventHandlers.onMouseClick = eda.pcb_Event.onMouseClick(onMouseClick);
	g_eventHandlers.onMouseMove = eda.pcb_Event.onMouseMove(onMouseMove);
	g_eventHandlers.onKeyDown = eda.pcb_Event.onKeyDown(onKeyDown);
}

function unregisterEventHandlers(): void {
	g_eventHandlers.onMouseClick?.remove();
	g_eventHandlers.onMouseMove?.remove();
	g_eventHandlers.onKeyDown?.remove();
	g_eventHandlers = { onMouseClick: null, onMouseMove: null, onKeyDown: null };
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
function selectPad(pad: unknown): void {
	// TODO: 实现
}

function updatePreview(e: unknown): void {
	// TODO: 实现
}

function confirmFanout(e: unknown): void {
	// TODO: 实现
}

function cancelFanout(): void {
	// TODO: 实现
}

function calculateAngle(padPos: Point, cursorPos: Point): number {
	return Math.atan2(cursorPos.y - padPos.y, cursorPos.x - padPos.x);
}

function createPreviewVia(pad: unknown, angle: number): unknown {
	// TODO: 实现
}

function createRealVia(pad: unknown, angle: number): unknown {
	// TODO: 实现
}

function createFanoutWire(pad: unknown, via: unknown): void {
	// TODO: 实现
}

function checkDrc(via: unknown): boolean {
	// TODO: 实现
}

// ============ 辅助函数 ============
function removePreviewVias(): void {
	// TODO: 实现
}

function cleanup(): void {
	removePreviewVias();
	unregisterEventHandlers();
	eda.sys_IFrame.hide('fanout-dialog');
	g_config.isActive = false;
	g_config.selectedPad = null;
	eda.pcb_SelectControl.deselectAll();
}
```

## 5.3 iframe/index.html 模板

```html
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		.fanout-dialog {
			position: fixed;
			top: 10px;
			right: 10px;
			width: 180px;
			background: #ffffff;
			border: 1px solid #cccccc;
			border-radius: 4px;
			padding: 12px;
			font-size: 12px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
			z-index: 10000;
			display: none;
		}
		.fanout-dialog.active {
			display: block;
		}
		.fanout-dialog h4 {
			margin: 0 0 10px 0;
			font-size: 13px;
			font-weight: 600;
			color: #333;
		}
		.fanout-dialog label {
			display: block;
			margin-bottom: 6px;
			font-weight: 500;
			color: #555;
		}
		.fanout-dialog select {
			width: 100%;
			padding: 6px 8px;
			border: 1px solid #ddd;
			border-radius: 3px;
			font-size: 12px;
			background: #fff;
			cursor: pointer;
		}
		.fanout-dialog select:hover {
			border-color: #bbb;
		}
		.fanout-dialog select:focus {
			outline: none;
			border-color: #007bff;
		}
		.fanout-dialog .hints {
			margin-top: 10px;
			padding-top: 8px;
			border-top: 1px solid #eee;
			font-size: 10px;
			color: #888;
			line-height: 1.6;
		}
	</style>
</head>
<body>
	<div class="fanout-dialog" id="fanout-dialog">
		<h4 id="title">单焊盘扇出</h4>
		<label id="via-type-label">过孔类型</label>
		<select id="via-type">
			<option value="through" id="opt-through">通孔</option>
			<option value="blind_1_2" id="opt-blind-1-2">盲孔1-2</option>
			<option value="blind_1_3" id="opt-blind-1-3">盲孔1-3</option>
		</select>
		<div class="hints" id="hints">
			<div>左键: 确认扇出</div>
			<div>右键/ESC: 取消</div>
		</div>
	</div>

	<script>
		(function() {
			var viaTypeSelect = document.getElementById('via-type');
			var dialog = document.getElementById('fanout-dialog');

			viaTypeSelect.addEventListener('change', function(e) {
				window.parent.postMessage({
					type: 'fanout-via-type',
					value: e.target.value
				}, '*');
			});

			window.addEventListener('message', function(e) {
				if (!e.data || !e.data.type) return;

				switch (e.data.type) {
					case 'show-dialog':
						dialog.classList.add('active');
						break;
					case 'hide-dialog':
						dialog.classList.remove('active');
						break;
					case 'update-i18n':
						// TODO: 更新UI文本
						break;
				}
			});
		})();
	</script>
</body>
</html>
```

## 5.4 locales/en.json 模板

```json
{
	"pad_fanout": "Pad Fanout",
	"fanout_tools": "Fanout Tools",
	"single_pad_fanout": "Single Pad Fanout",
	"via_type": "Via Type",
	"through": "Through",
	"blind_1_2": "Blind 1-2",
	"blind_1_3": "Blind 1-3",
	"hints": "Left-click: Confirm | Right-click/ESC: Cancel",
	"left_click_confirm": "Left-click: Confirm",
	"right_click_cancel": "Right-click/ESC: Cancel"
}
```

## 5.5 locales/zh-Hans.json 模板

```json
{
	"pad_fanout": "单焊盘扇出",
	"fanout_tools": "扇出工具",
	"single_pad_fanout": "单焊盘扇出",
	"via_type": "过孔类型",
	"through": "通孔",
	"blind_1_2": "盲孔1-2",
	"blind_1_3": "盲孔1-3",
	"hints": "左键: 确认扇出 | 右键/ESC: 取消",
	"left_click_confirm": "左键: 确认扇出",
	"right_click_cancel": "右键/ESC: 取消"
}
```
