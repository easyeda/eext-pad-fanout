# DOC-009-Pad-Fanout-Alignment

## 概述

单焊盘扇出过孔插件的对齐策略方案B，用于确定过孔和走线的创建方向。

## 焊盘形状与方向规则

| 焊盘形状 | 枚举值 | 可用方向 | 坐标系 |
|---------|--------|---------|--------|
| 圆形 (ELLIPSE) | `"ELLIPSE"` | 8方向 | 与画布平行 |
| 矩形 (RECTANGLE) | `"RECT"` | 4方向 | 与焊盘自身平行 |
| 长圆形 (OBLONG) | `"OVAL"` | 4方向 | 与焊盘自身平行 |
| 正多边形 (REGULAR_POLYGON) | `"NGON"` | 4方向 | 与焊盘自身平行 |
| 复杂多边形 (POLYLINE_COMPLEX_POLYGON) | `"POLYGON"` | 4方向 | 与焊盘自身平行 |

## 方向判定算法

### 核心思路：象限 + 坐标比较

使用 `|dx| >= |dy|` 判断水平/垂直方向，无需 `atan2` 三角函数，代码简洁高效。

### 1. 基础方向判定函数（8方向）

```typescript
/**
 * 根据鼠标相对位置判定8个方向之一
 * @param dx - 鼠标X - 焊盘X
 * @param dy - 鼠标Y - 焊盘Y
 * @returns 方向单位向量 {x, y}
 */
function getDirection8(dx: number, dy: number): { x: number; y: number } {
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);

	if (absDx >= absDy) {
		// 水平方向: E (右) 或 W (左)
		return dx >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
	}
	else {
		// 垂直方向: N (上) 或 S (下)
		return dy >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
	}
}
```

**方向映射表：**

| 条件 | 方向 | 说明 |
|------|------|------|
| `dx >= 0, |dx| >= |dy|` | E | 右 |
| `dx < 0, |dx| >= |dy|` | W | 左 |
| `dy >= 0, |dy| > |dx|` | S | 下 |
| `dy < 0, |dy| > |dx|` | N | 上 |

### 2. 局部坐标系转换（4方向）

对于矩形、长圆形等有旋转角度的焊盘，需要将全局坐标转换到焊盘局部坐标系。

**前提：**
- 焊盘绕自身中心**逆时针**旋转 θ 度
- `dx = mouseX - padX`，`dy = mouseY - padY`（已做平移，以焊盘中心为原点）

**变换逻辑：**
由于焊盘自身逆时针旋转了 θ 度，画布上的"右"方向在焊盘局部坐标系中需要顺时针旋转 θ 度才能对齐。

```typescript
/**
 * 转换到焊盘局部坐标系
 * @param dx - 鼠标相对焊盘的向量 x（mouseX - padX）
 * @param dy - 鼠标相对焊盘的向量 y（mouseY - padY）
 * @param rotation - 焊盘逆时针旋转角度（度）
 * @returns 局部坐标系下的 {dxLocal, dyLocal}
 */
function toLocalCoordinates(dx: number, dy: number, rotation: number): { dxLocal: number; dyLocal: number } {
	// 焊盘逆时针旋转 θ → 变换到局部坐标系需要顺时针旋转 θ（即 -θ）
	const rad = -rotation * Math.PI / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);

	return {
		dxLocal: dx * cos - dy * sin,
		dyLocal: dx * sin + dy * cos,
	};
}
```

**几何理解：**
```
画布坐标系          焊盘局部坐标系
    ↑                    ↗ 焊盘"上"
    │                    │
    │        焊盘旋转     │
    │        ↺ θ 逆时针   │
    └──→                └──→ 焊盘"右"

画布"右"在局部 = 顺时针旋转 θ
```

### 3. 4方向判定函数

```typescript
/**
 * 根据鼠标相对位置判定4个方向之一（适用于有旋转的焊盘）
 * @param dx - 鼠标X - 焊盘X
 * @param dy - 鼠标Y - 焊盘Y
 * @param rotation - 焊盘旋转角度（度）
 * @returns 方向单位向量 {x, y}
 */
function getDirection4(dx: number, dy: number, rotation: number): { x: number; y: number } {
	const { dxLocal, dyLocal } = toLocalCoordinates(dx, dy, rotation);
	return getDirection8(dxLocal, dyLocal);
}
```

### 4. 完整方向判定函数

```typescript
/**
 * 获取焊盘形状类型
 */
function getPadShape(padState: TPCB_PrimitivePadShape): string {
	if (Array.isArray(padState) && padState.length > 0) {
		return padState[0] as string;
	}
	return 'UNKNOWN';
}

/**
 * 完整方向判定
 * @param dx - 鼠标X - 焊盘X
 * @param dy - 鼠标Y - 焊盘Y
 * @param padShape - 焊盘形状类型
 * @param rotation - 焊盘旋转角度
 * @returns 方向单位向量 {x, y}
 */
function getFanoutDirection(
	dx: number,
	dy: number,
	padShape: string,
	rotation: number,
): { x: number; y: number } {
	// 圆形焊盘: 8方向（使用全局坐标系）
	if (padShape === 'ELLIPSE') {
		return getDirection8(dx, dy);
	}

	// 其他形状（矩形、长圆形、正多边形、复杂多边形）: 4方向（使用局部坐标系）
	return getDirection4(dx, dy, rotation);
}
```

## 扇出距离

采用固定的单位距离（1 mil），使过孔与焊盘对齐。

```
viaPos = padPos + direction * 1 (mil)
```

这样过孔会在焊盘旁边 10 mil 处创建，走线从焊盘中心直接引出到过孔。

## 过孔位置计算

```typescript
const FANOUT_UNIT_MIL = 10;

function calculateViaPosition(
	padPos: { x: number; y: number },
	direction: { x: number; y: number },
): { x: number; y: number } {
	return {
		x: padPos.x + direction.x * FANOUT_UNIT_MIL,
		y: padPos.y + direction.y * FANOUT_UNIT_MIL,
	};
}
```

## 所需官方 API

| API | 方法 | 用途 |
|-----|------|------|
| `IPCB_PrimitivePad.getState_Pad()` | `TPCB_PrimitivePadShape` | 获取焊盘形状信息 |
| `IPCB_PrimitivePad.getState_Rotation()` | `number` | 获取焊盘旋转角度 |
| `IPCB_PrimitivePad.getState_X()` | `number` | 获取焊盘X坐标 |
| `IPCB_PrimitivePad.getState_Y()` | `number` | 获取焊盘Y坐标 |

## 状态扩展

```typescript
interface FanoutState {
	// ... 现有字段
	selectedPadShape: string | null; // 焊盘形状类型
	selectedPadRotation: number | null; // 焊盘旋转角度
}
```

## 流程图

```
鼠标点击
    │
    ▼
┌─────────────────────┐
│  获取焊盘信息        │
│  - 位置 (x, y)      │
│  - 形状 (shape)     │
│  - 旋转角度 (rot)   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  计算向量           │
│  dx = mouseX - padX │
│  dy = mouseY - padY │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  形状判断           │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
  ELLIPSE   其他形状
    │           │
    ▼           ▼
┌───────────┐ ┌───────────────────┐
│ getDir8() │ │ toLocal(dx,dy,rot)│
│ (全局坐标) │ │ getDir8()         │
└─────┬─────┘ └─────────┬─────────┘
      │                   │
      └─────────┬─────────┘
                ▼
        ┌───────────────┐
        │ 返回方向向量    │
        │ {x: ±1, y: 0} │
        │ 或 {x: 0, y: ±1}│
        └───────┬───────┘
                ▼
        ┌───────────────┐
        │ 计算过孔位置   │
        │ via = pad +   │
        │   dir * dist  │
        └───────────────┘
```

## 边界情况处理

1. **鼠标恰好在焊盘中心**: `dx = 0, dy = 0`，此时 `absDx === absDy`，判定为水平方向（E）
2. **45度对角线**: `|dx| === |dy|`，判定为水平方向（E 或 W）
3. **旋转角度为0**: 局部坐标系等于全局坐标系，结果与圆形一致

## 实施清单

- [ ] 修改 `FanoutState` 接口，添加 `selectedPadShape` 和 `selectedPadRotation`
- [ ] 在选择焊盘时，获取并保存焊盘形状和旋转角度
- [ ] 实现 `getDirection8()` 函数（8方向判定）
- [ ] 实现 `toLocalCoordinates()` 函数（坐标转换）
- [ ] 实现 `getDirection4()` 函数（4方向判定）
- [ ] 实现 `getPadShape()` 函数（获取焊盘形状类型）
- [ ] 实现 `getFanoutDirection()` 函数（完整方向判定入口）
- [ ] 修改 `createFanout()` 使用新方向判定逻辑
- [ ] 移除 `calculateViaPosition()` 的距离参数，改为固定 1 mil
- [ ] 测试各种形状的焊盘（圆形、矩形、长圆形）
- [ ] 更新版本号和 CHANGELOG

## 版本历史

| 版本 | 日期 | 描述 |
|------|------|------|
| v1.0.0 | 2026-04-16 | 初始方案设计 |
| v1.3.0 | 2026-04-16 | 方案B实施，过孔与焊盘对齐 |
