# DOC-007: 调试指南

## 7.1 常用命令

| 命令 | 用途 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run lint` | 检查代码风格 |
| `npm run fix` | 自动修复代码风格问题 |
| `npm run compile` | 编译TypeScript到dist |
| `npm run build` | 编译+打包生成.eext |

## 7.2 编译输出

| 输出 | 路径 |
|------|------|
| 编译产物 | `dist/index.js` |
| 打包文件 | `build/dist/<name>_v<version>.eext` |

## 7.3 调试技巧

### 7.3.1 日志输出

```typescript
// 开启调试日志
eda.sys_Log.log('Debug info', eda.eSYS_LogType.Info);

// 打印变量值
eda.sys_Log.log(`Angle: ${angle}`, eda.eSYS_LogType.Info);
eda.sys_Log.log(`Pad position: ${JSON.stringify(pad.position)}`, eda.eSYS_LogType.Info);

// 打印对象结构
eda.sys_Log.log(`Config: ${JSON.stringify(g_config)}`, eda.eSYS_LogType.Info);
```

### 7.3.2 查看选中图元

```typescript
function onMouseClick(e: unknown): void {
	const primitives = eda.pcb_SelectControl.getSelectedPrimitives();
	eda.sys_Log.log(`Selected count: ${primitives.length}`, eda.eSYS_LogType.Info);

	primitives.forEach((p, i) => {
		eda.sys_Log.log(`Primitive[${i}] type: ${p.type}`, eda.eSYS_LogType.Info);
	});
}
```

### 7.3.3 事件参数检查

```typescript
function onMouseMove(e: unknown): void {
	eda.sys_Log.log(`Mouse event: ${JSON.stringify(e)}`, eda.eSYS_LogType.Info);
}
```

### 7.3.4 状态检查

```typescript
function padFanout(): void {
	eda.sys_Log.log(`isActive before: ${g_config.isActive}`, eda.eSYS_LogType.Info);

	g_config.isActive = true;

	eda.sys_Log.log(`isActive after: ${g_config.isActive}`, eda.eSYS_LogType.Info);
	eda.sys_Log.log(`selectedPad: ${g_config.selectedPad}`, eda.eSYS_LogType.Info);
	eda.sys_Log.log(`previewVias count: ${g_config.previewVias.length}`, eda.eSYS_LogType.Info);
}
```

## 7.4 常见问题排查

### 问题1: 菜单点击无反应

**可能原因:**
- `registerFn` 配置错误
- 函数未正确导出

**排查步骤:**
1. 检查 `extension.json` 中 `registerFn` 是否与导出的函数名一致
2. 检查控制台是否有错误日志
3. 检查插件是否正确加载

**解决方案:**
```json
// extension.json
{
	"headerMenus": {
		"pcb": [{
			"menuItems": [{
				"registerFn": "padFanout" // 必须与 export function 名称一致
			}]
		}]
	}
}
```

### 问题2: 弹窗不显示

**可能原因:**
- iframe未正确配置
- `eda.sys_IFrame.show()` 调用失败

**排查步骤:**
1. 检查浏览器控制台错误
2. 检查 `iframe/index.html` 是否存在
3. 检查事件是否正确注册

**解决方案:**
```typescript
// 确保在调用 show 之前检查
export function padFanout(): void {
	eda.sys_Log.log('Attempting to show dialog...', eda.eSYS_LogType.Info);

	try {
		eda.sys_IFrame.show('fanout-dialog');
		eda.sys_Log.log('Dialog shown successfully', eda.eSYS_LogType.Info);
	}
	catch (error) {
		eda.sys_Log.log(`Failed to show dialog: ${error}`, eda.eSYS_LogType.Error);
	}
}
```

### 问题3: 预览不跟随鼠标

**可能原因:**
- 鼠标移动事件未注册
- 坐标计算错误
- 预览过孔未正确创建

**排查步骤:**
1. 检查 `eda.pcb_Event.onMouseMove` 是否正确调用
2. 检查 `calculateAngle` 函数计算是否正确
3. 检查 `createPreviewVia` 是否返回有效对象

**排查代码:**
```typescript
function onMouseMove(e: unknown): void {
	eda.sys_Log.log('MouseMove triggered', eda.eSYS_LogType.Info);

	if (!g_config.selectedPad) {
		eda.sys_Log.log('No pad selected, skipping preview', eda.eSYS_LogType.Info);
		return;
	}

	// 逐步检查
	eda.sys_Log.log(`Pad position: ${JSON.stringify(g_config.selectedPad.position)}`, eda.eSYS_LogType.Info);

	const angle = calculateAngle(g_config.selectedPad.position, e.position);
	eda.sys_Log.log(`Calculated angle: ${angle}`, eda.eSYS_LogType.Info);

	// ...
}
```

### 问题4: DRC检查不生效

**可能原因:**
- `eda.pcb_Drc.check()` 参数错误
- 检查规则配置不正确

**排查步骤:**
1. 检查 `checkDrc` 函数调用参数
2. 检查返回结果处理逻辑
3. 手动测试过孔创建是否成功

**排查代码:**
```typescript
function checkDrc(via: unknown): boolean {
	const doc = eda.pcb_Document.getActive();

	eda.sys_Log.log('Running DRC check...', eda.eSYS_LogType.Info);

	const result = eda.pcb_Drc.check(doc, {
		primitives: [via],
		rules: ['minViaToViaClearance', 'minTraceWidth']
	});

	eda.sys_Log.log(`DRC result: ${JSON.stringify(result)}`, eda.eSYS_LogType.Info);

	return result.passed;
}
```

### 问题5: 过孔创建后位置偏移

**可能原因:**
- 扇出距离计算问题
- 坐标系问题

**排查步骤:**
1. 检查 `DEFAULT_FANOUT_DISTANCE` 值
2. 检查 `Math.cos` / `Math.sin` 使用是否正确
3. 检查单位是否正确（mm vs mil）

**解决方案:**
```typescript
function calculateViaPosition(padPos: Point, angle: number): Point {
	const distance = DEFAULT_FANOUT_DISTANCE; // 2.54mm

	eda.sys_Log.log(`Distance: ${distance}`, eda.eSYS_LogType.Info);
	eda.sys_Log.log(`Angle (rad): ${angle}`, eda.eSYS_LogType.Info);
	eda.sys_Log.log(`Angle (deg): ${angle * 180 / Math.PI}`, eda.eSYS_LogType.Info);

	return {
		x: padPos.x + Math.cos(angle) * distance,
		y: padPos.y + Math.sin(angle) * distance
	};
}
```

## 7.5 断点调试

### 7.5.1 使用console.log

```typescript
function onMouseClick(e: unknown): void {
	console.log('=== onMouseClick START ===');
	console.log('Event:', e);
	console.log('Config:', g_config);

	// 业务逻辑...

	console.log('=== onMouseClick END ===');
}
```

### 7.5.2 条件断点

```typescript
function onMouseClick(e: unknown): void {
	// 当特定条件满足时输出日志
	if (g_config.selectedPad && e.button === 'left') {
		console.log('Confirm fanout with selected pad');
	}

	// ...
}
```

## 7.6 日志级别使用

| 级别 | 使用场景 | 输出方式 |
|------|----------|----------|
| Info | 正常流程节点 | `eda.sys_Log.log()` |
| Warning | 非致命问题 | `eda.sys_Log.log(..., Warning)` |
| Error | 错误/异常 | `eda.sys_Log.log(..., Error)` |

## 7.7 调试检查清单

```
□ 函数入口有日志
□ 关键变量值已打印
□ 条件分支有日志
□ 异常被捕获并记录
□ 操作结果有反馈
□ 状态变化有记录
```
