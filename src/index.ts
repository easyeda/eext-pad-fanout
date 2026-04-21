/**
 * 单焊盘扇出过孔插件
 *
 * 功能：选中单个焊盘，根据鼠标方向进行扇出过孔
 * 操作：点击焊盘选择 → 点击目标位置创建过孔和走线
 */
import * as extensionConfig from '../extension.json';
/// <reference types="@jlceda/pro-api-types" />

function mmToMil(mm: number): number {
	return eda.sys_Unit.mmToMil(mm);
}

function milToMm(mil: number): number {
	return eda.sys_Unit.milToMm(mil);
}

function formatPos(x: number, y: number): string {
	return `(${milToMm(x).toFixed(4)} mm, ${milToMm(y).toFixed(4)} mm)`;
}

const DEFAULT_VIA_TYPE = EPCB_PrimitiveViaType.VIA;

// 兜底默认值（PCB 规则读取失败时使用）
const FALLBACK_VIA_DIAMETER_MIL = 23.622; // 0.6 mm
const FALLBACK_HOLE_DIAMETER_MIL = 11.811; // 0.3 mm
const FALLBACK_LINE_WIDTH_MIL = 10; // 0.254 mm
const FALLBACK_LINE_LENGTH_MIL = 100;

interface FanoutParams {
	viaDiameterMil: number;
	holeDiameterMil: number;
	lineWidthMil: number;
	lineLengthMil: number;
}

type WorkState = 'IDLE' | 'PAD_SELECTED';

interface SelectedPadInfo {
	position: { x: number; y: number };
	net: string | null;
	shape: string | null;
	rotation: number | null;
}

interface FanoutState {
	isEnabled: boolean;
	selectedPadPosition: { x: number; y: number } | null;
	selectedPadNet: string | null;
	selectedPadShape: string | null;
	selectedPadRotation: number | null;
	workState: WorkState;
	ignoreNextEmptyClick: boolean;
	selectedPads: SelectedPadInfo[];
	selectionMode: 'SINGLE' | 'MULTI' | null;
	params: FanoutParams;
}

const fanoutState: FanoutState = {
	isEnabled: false,
	selectedPadPosition: null,
	selectedPadNet: null,
	selectedPadShape: null,
	selectedPadRotation: null,
	workState: 'IDLE',
	ignoreNextEmptyClick: false,
	selectedPads: [],
	selectionMode: null,
	params: {
		viaDiameterMil: FALLBACK_VIA_DIAMETER_MIL,
		holeDiameterMil: FALLBACK_HOLE_DIAMETER_MIL,
		lineWidthMil: FALLBACK_LINE_WIDTH_MIL,
		lineLengthMil: FALLBACK_LINE_LENGTH_MIL,
	},
};

const listenerId = 'pad-fanout-listener';
const MESSAGE_TOPIC = 'pad-fanout-action';

export function activate(_status?: 'onStartupFinished', _arg?: string): void {
	console.warn(`[PadFanout] ========== 插件加载 ==========`);
	console.warn(`[PadFanout] v${extensionConfig.version} activate() 被调用`);
	console.warn(`[PadFanout] =================================`);
}

export function deactivate(): void {
	console.warn(`[PadFanout] ========== 插件卸载 ==========`);
	console.warn(`[PadFanout] deactivate() 被调用`);
	stopPlugin();
	console.warn(`[PadFanout] =================================`);
}

export async function padFanout(): Promise<void> {
	console.warn('[PadFanout] ========== 启动工具 ==========');
	console.warn('[PadFanout] padFanout() 被调用');

	resetState();
	await loadPCBRuleDefaults();
	registerEventHandlers();
	subscribeMessage();

	console.warn('[PadFanout] 打开 iframe...');
	eda.sys_IFrame.openIFrame('./iframe/index.html', 200, 340, 'pad-fanout-dialog', {
		buttonCallbackFn: (button) => {
			console.warn('[PadFanout] iframe 按钮被点击:', button);
			if (button === 'close') {
				handleIframeClose();
			}
		},
	});

	// iframe 加载完成后推送初始参数
	setTimeout(() => publishInitParams(), 500);

	console.warn('[PadFanout] ============================');
}

function handleIframeClose(): void {
	console.warn('[PadFanout] iframe 弹窗被关闭');
	cancelFanout();
}

function registerEventHandlers(): void {
	eda.pcb_Event.addMouseEventListener(listenerId, 'all', handleMouseEvent);
}

function unregisterEventHandlers(): void {
	console.warn('[PadFanout] 移除事件处理器...');
	eda.pcb_Event.removeEventListener(listenerId);
	console.warn('[PadFanout] 事件处理器已移除');
}

let messageBusTask: { cancel: () => void } | null = null;

function subscribeMessage(): void {
	console.warn('[PadFanout] 订阅 MessageBus 公共主题:', MESSAGE_TOPIC);
	messageBusTask = eda.sys_MessageBus.subscribePublic(MESSAGE_TOPIC, (message: any) => {
		console.warn('[PadFanout] 收到 MessageBus 消息:', message);
		if (message && message.action) {
			if (message.action === 'enable') {
				if (message.params) {
					fanoutState.params.viaDiameterMil = mmToMil(message.params.viaDiameter);
					fanoutState.params.holeDiameterMil = mmToMil(message.params.holeDiameter);
					fanoutState.params.lineWidthMil = mmToMil(message.params.lineWidth);
					fanoutState.params.lineLengthMil = mmToMil(message.params.lineLength);
					console.warn('[PadFanout] 参数已更新:', fanoutState.params);
				}
				enableFanout();
			}
			else if (message.action === 'cancel') {
				cancelFanout();
			}
		}
	});
	console.warn('[PadFanout] MessageBus 订阅成功');
}

async function loadPCBRuleDefaults(): Promise<void> {
	try {
		const config = await eda.pcb_Drc.getCurrentRuleConfiguration();
		const physics = (config as any)?.config?.Physics;
		if (!physics) {
			console.warn('[PadFanout] 未找到 Physics 规则，使用兜底默认值');
			return;
		}

		const viaForm = physics['Via Size']?.viaSize?.form;
		if (viaForm?.viaOuterdiameterDefault && viaForm?.viaInnerdiameterDefault) {
			fanoutState.params.viaDiameterMil = viaForm.viaOuterdiameterDefault;
			fanoutState.params.holeDiameterMil = viaForm.viaInnerdiameterDefault;
			console.warn(`[PadFanout] 过孔规则: 外径=${fanoutState.params.viaDiameterMil} mil, 孔径=${fanoutState.params.holeDiameterMil} mil`);
		}

		const trackRules = physics.Track;
		if (trackRules) {
			const defaultRule = Object.values(trackRules).find((r: any) => r.isSetDefault) as any;
			const defaultWidth = defaultRule?.form?.data?.['1']?.defaultValue;
			if (defaultWidth) {
				fanoutState.params.lineWidthMil = defaultWidth;
				console.warn(`[PadFanout] 走线规则: 线宽=${fanoutState.params.lineWidthMil} mil`);
			}
		}
	}
	catch (err) {
		console.warn('[PadFanout] 读取 PCB 规则失败，使用兜底默认值:', err);
	}
}

function publishInitParams(): void {
	eda.sys_MessageBus.publishPublic('pad-fanout-init', {
		viaDiameter: milToMm(fanoutState.params.viaDiameterMil),
		holeDiameter: milToMm(fanoutState.params.holeDiameterMil),
		lineWidth: milToMm(fanoutState.params.lineWidthMil),
		lineLength: milToMm(fanoutState.params.lineLengthMil),
	});
	console.warn('[PadFanout] 已推送初始参数到 iframe');
}

function unsubscribeMessage(): void {
	if (messageBusTask) {
		console.warn('[PadFanout] 取消 MessageBus 订阅');
		messageBusTask.cancel();
		messageBusTask = null;
	}
}

async function handleMouseEvent(
	eventType: EPCB_MouseEventType,
	props: Array<{
		primitiveId: string;
		primitiveType: EPCB_PrimitiveType;
		net?: string;
		designator?: string;
	}>,
): Promise<void> {
	console.warn(`[Fanout] 事件触发: ${eventType}, Props: ${props?.length}, isEnabled: ${fanoutState.isEnabled}`);

	if (!fanoutState.isEnabled) {
		return;
	}
	////
	try {
		// 先尝试将画布原点重置为 (0,0)
		await eda.pcb_Document.setCanvasOrigin(0, 0);
		console.warn('[Fanout] 已成功将画布原点重置为 (0, 0)');

		const canvasOrigin = await eda.pcb_Document.getCanvasOrigin();
		if (canvasOrigin) {
			console.warn(`[Fanout] 画布原点 (mil): (${canvasOrigin.offsetX}, ${canvasOrigin.offsetY})`);
			console.warn(`[Fanout] 画布原点 (mm): ${formatPos(canvasOrigin.offsetX, canvasOrigin.offsetY)}`);
		}
	}
	catch (err) {
		console.error('[Fanout] 获取画布原点失败:', err);
	}
	//////
	if (!props || props.length === 0) {
		console.warn('[Fanout] Props为空');
		if (fanoutState.workState === 'PAD_SELECTED') {
			if (fanoutState.ignoreNextEmptyClick) {
				fanoutState.ignoreNextEmptyClick = false;
				console.warn('[Fanout] 忽略空点击');
				return;
			}
			const mousePos = await eda.pcb_SelectControl.getCurrentMousePosition();
			if (mousePos) {
				console.warn(`[Fanout] 鼠标位置(mil): (${mousePos.x}, ${mousePos.y})`);
				if (fanoutState.selectionMode === 'MULTI' && fanoutState.selectedPads.length > 0) {
					console.warn('[Fanout] ========== 批量扇出 ==========');
					console.warn(`[Fanout] 焊盘数量: ${fanoutState.selectedPads.length}`);
					for (const padInfo of fanoutState.selectedPads) {
						fanoutState.selectedPadPosition = padInfo.position;
						fanoutState.selectedPadNet = padInfo.net;
						fanoutState.selectedPadShape = padInfo.shape;
						fanoutState.selectedPadRotation = padInfo.rotation;
						await createFanout(mousePos);
					}
					console.warn('[Fanout] ========== 批量扇出完成 ==========');
					fanoutState.selectionMode = null;
					fanoutState.selectedPads = [];
					fanoutState.workState = 'IDLE';
					fanoutState.selectedPadPosition = null;
					fanoutState.selectedPadNet = null;
					fanoutState.selectedPadShape = null;
					fanoutState.selectedPadRotation = null;
					fanoutState.ignoreNextEmptyClick = false;
				}
				else if (fanoutState.selectedPadPosition) {
					await createFanout(mousePos);
				}
			}
		}
		return;
	}

	const prim = props[0];
	console.warn('[Fanout] 图元类型:', prim.primitiveType, '图元ID:', prim.primitiveId);
	console.warn('[Fanout] EPCB_PrimitiveType.PAD:', EPCB_PrimitiveType.PAD);
	console.warn('[Fanout] 比较结果:', prim.primitiveType === EPCB_PrimitiveType.PAD);

	const isPad = prim.primitiveType === EPCB_PrimitiveType.PAD
		|| prim.primitiveType === EPCB_PrimitiveType.COMPONENT_PAD;

	console.warn('[Fanout] isPad:', isPad, 'workState:', fanoutState.workState);

	if (isPad && fanoutState.workState === 'IDLE') {
		console.warn('[Fanout] 进入选择焊盘逻辑');
		try {
			const primitives = await eda.pcb_SelectControl.getAllSelectedPrimitives();
			console.warn('[Fanout] 选中图元数量:', primitives?.length);

			if (!primitives || primitives.length === 0) {
				console.warn('[Fanout] 没有选中的图元');
				return;
			}

			const padInfos: SelectedPadInfo[] = [];

			for (const p of primitives) {
				const primitiveType = p.getState_PrimitiveType();
				console.warn('[Fanout] 图元类型检查:', primitiveType, '=== PAD:', primitiveType === EPCB_PrimitiveType.PAD);

				if (primitiveType === EPCB_PrimitiveType.PAD
					|| primitiveType === EPCB_PrimitiveType.COMPONENT_PAD) {
					const padPrim = p as unknown as {
						getState_X: () => number;
						getState_Y: () => number;
						getState_Net: () => string | undefined;
						getState_Pad: () => TPCB_PrimitivePadShape | undefined;
						getState_Rotation: () => number;
						getState_ParentComponentPrimitiveId?: () => string;
					};
					const x = padPrim.getState_X();
					const y = padPrim.getState_Y();
					const net = padPrim.getState_Net();
					const pad = padPrim.getState_Pad();
					const padRotation = padPrim.getState_Rotation() * Math.PI / 180;
					const shape = Array.isArray(pad) && pad.length > 0 ? String(pad[0]) : 'UNKNOWN';

					padInfos.push({
						position: { x, y },
						net: net || null,
						shape,
						rotation: padRotation,
					});
				}
			}

			if (padInfos.length === 0) {
				console.warn('[Fanout] 没有选中焊盘');
				return;
			}

			if (padInfos.length === 1) {
				console.warn('[Fanout] ========== 选中单个焊盘 ==========');
				console.warn(`[Fanout] 坐标 (mil): (${padInfos[0].position.x}, ${padInfos[0].position.y})`);
				console.warn(`[Fanout] 形状: ${padInfos[0].shape}`);
				console.warn(`[Fanout] 焊盘旋转: ${padInfos[0].rotation}°`);
				console.warn(`[Fanout] 网络: ${padInfos[0].net || '(无)'}`);
				console.warn('[Fanout] =============================');

				fanoutState.selectionMode = 'SINGLE';
				fanoutState.selectedPadRotation = padInfos[0].rotation;
				fanoutState.selectedPadPosition = padInfos[0].position;
				fanoutState.selectedPadNet = padInfos[0].net;
				fanoutState.selectedPadShape = padInfos[0].shape;
				fanoutState.workState = 'PAD_SELECTED';
				fanoutState.ignoreNextEmptyClick = true;
			}
			else {
				console.warn('[Fanout] ========== 选中多个焊盘 ==========');
				console.warn(`[Fanout] 焊盘数量: ${padInfos.length}`);
				console.warn('[Fanout] =============================');

				fanoutState.selectionMode = 'MULTI';
				fanoutState.selectedPads = padInfos;
				fanoutState.workState = 'PAD_SELECTED';
				fanoutState.ignoreNextEmptyClick = true;
			}
		}
		catch (err) {
			console.error('[Fanout] 获取选中图元失败:', err);
		}
	}
	else if (isPad && fanoutState.workState === 'PAD_SELECTED') {
		console.warn('[Fanout] 切换选中焊盘');
		try {
			const primitives = await eda.pcb_SelectControl.getAllSelectedPrimitives();
			if (!primitives || primitives.length === 0) {
				console.warn('[Fanout] 没有选中的图元');
				return;
			}

			for (const p of primitives) {
				const primitiveType = p.getState_PrimitiveType();
				if (primitiveType === EPCB_PrimitiveType.PAD
					|| primitiveType === EPCB_PrimitiveType.COMPONENT_PAD) {
					const padPrim = p as unknown as {
						getState_X: () => number;
						getState_Y: () => number;
						getState_Net: () => string | undefined;
						getState_Pad: () => TPCB_PrimitivePadShape | undefined;
						getState_Rotation: () => number;
					};
					const x = padPrim.getState_X();
					const y = padPrim.getState_Y();
					const net = padPrim.getState_Net();
					const pad = padPrim.getState_Pad();
					const padRotation = padPrim.getState_Rotation() * Math.PI / 180;
					const shape = Array.isArray(pad) && pad.length > 0 ? String(pad[0]) : 'UNKNOWN';

					console.warn('[Fanout] ========== 切换焊盘 ==========');
					console.warn(`[Fanout] 新焊盘坐标 (mil): (${x}, ${y})`);
					console.warn(`[Fanout] 新焊盘形状: ${shape}`);
					console.warn(`[Fanout] 新焊盘旋转: ${padRotation}°`);
					console.warn('[Fanout] =============================');

					fanoutState.selectedPadRotation = padRotation;
					fanoutState.selectedPadPosition = { x, y };
					fanoutState.selectedPadNet = net || null;
					fanoutState.selectedPadShape = shape;
					fanoutState.ignoreNextEmptyClick = true;
					break;
				}
			}
		}
		catch (err) {
			console.error('[Fanout] 获取选中图元失败:', err);
		}
	}
	else if (fanoutState.workState === 'PAD_SELECTED') {
		console.warn('[Fanout] 点击非焊盘图元，取消选中');
		fanoutState.workState = 'IDLE';
		fanoutState.selectedPadPosition = null;
		fanoutState.selectedPadNet = null;
		fanoutState.selectedPadShape = null;
		fanoutState.selectedPadRotation = null;
		fanoutState.ignoreNextEmptyClick = false;
	}
}

function getDirection8(dx: number, dy: number): { x: number; y: number } {
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);
	const threshold = 0.4142;

	if (absDx >= absDy) {
		if (absDx === 0)
			return { x: 0, y: 0 };
		const ratio = absDy / absDx;
		if (ratio < threshold) {
			return dx >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
		}
		else {
			return dx >= 0
				? (dy >= 0 ? { x: 1, y: 1 } : { x: 1, y: -1 })
				: (dy >= 0 ? { x: -1, y: 1 } : { x: -1, y: -1 });
		}
	}
	else {
		if (absDy === 0)
			return { x: 0, y: 0 };
		const ratio = absDx / absDy;
		if (ratio < threshold) {
			return dy >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
		}
		else {
			return dy >= 0
				? (dx >= 0 ? { x: 1, y: 1 } : { x: -1, y: 1 })
				: (dx >= 0 ? { x: 1, y: -1 } : { x: -1, y: -1 });
		}
	}
}

function toLocalCoordinates(dx: number, dy: number, rotation: number): { dxLocal: number; dyLocal: number } {
	const rad = rotation * Math.PI / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);

	const dxLocal = dx * cos + dy * sin;
	const dyLocal = -dx * sin + dy * cos;

	return { dxLocal, dyLocal };
}

function getDirection4(dx: number, dy: number): { x: number; y: number } {
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);

	// if (absDx >= absDy) {
	// 	return dx >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
	// }
	// else {
	// 	return dy >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
	// }
	if (dx >= 0 && dx >= absDy)
		return { x: 1, y: 0 };
	if (dx < 0 && -dx >= absDy)
		return { x: -1, y: 0 };
	if (dy >= 0 && dy > absDx)
		return { x: 0, y: 1 };
	if (dy < 0 && -dy > absDx)
		return { x: 0, y: -1 };
	return { x: 0, y: 0 };
}

function getFanoutDirection(
	dx: number,
	dy: number,
	padShape: string | null,
	rotation: number | null,
): { x: number; y: number } {
	if (padShape === 'ELLIPSE') {
		return getDirection8(dx, dy);
	}

	if (rotation !== null && rotation !== 0) {
		const { dxLocal, dyLocal } = toLocalCoordinates(dx, dy, rotation);
		return getDirection4(dxLocal, dyLocal);
	}

	return getDirection4(dx, dy);
}

function calculateViaPosition(
	padPos: { x: number; y: number },
	targetPos: { x: number; y: number },
): { x: number; y: number } {
	const dx = targetPos.x - padPos.x;
	const dy = targetPos.y - padPos.y;
	const rotation = fanoutState.selectedPadRotation;

	let dxLocal = dx;
	let dyLocal = dy;
	if (rotation !== null && rotation !== 0 && fanoutState.selectedPadShape !== 'ELLIPSE') {
		({ dxLocal, dyLocal } = toLocalCoordinates(dx, dy, rotation));
	}

	const direction = getFanoutDirection(
		dx,
		dy,
		fanoutState.selectedPadShape,
		rotation,
	);

	const angle = Math.atan2(dy, dx) * 180 / Math.PI;
	const directionName = getDirectionName(direction);

	console.warn('[Fanout] ========== 方向计算 ==========');
	console.warn(`[Fanout] 焊盘形状: ${fanoutState.selectedPadShape}`);
	console.warn(`[Fanout] 焊盘旋转: ${rotation !== null ? `${rotation.toFixed(2)}°` : 'N/A'}`);
	console.warn(`[Fanout] 鼠标向量 (mil): (${dx.toFixed(2)}, ${dy.toFixed(2)})`);
	if (rotation !== null && rotation !== 0 && fanoutState.selectedPadShape !== 'ELLIPSE') {
		console.warn(`[Fanout] 局部坐标 (mil): (${dxLocal.toFixed(2)}, ${dyLocal.toFixed(2)})`);
	}
	console.warn(`[Fanout] 鼠标角度: ${angle.toFixed(1)}°`);
	console.warn(`[Fanout] 判定方向: ${directionName}`);
	console.warn(`[Fanout] 方向向量: (${direction.x}, ${direction.y})`);
	console.warn(`[Fanout] 扇出距离: ${fanoutState.params.lineLengthMil} mil`);
	console.warn('[Fanout] =============================');

	const localDir = { x: direction.x * fanoutState.params.lineLengthMil, y: direction.y * fanoutState.params.lineLengthMil };
	const rad = (rotation ?? 0) * Math.PI / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const globalDir = { x: localDir.x * cos - localDir.y * sin, y: localDir.x * sin + localDir.y * cos };
	return {
		x: padPos.x + globalDir.x,
		y: padPos.y + globalDir.y,
	};
}

function getDirectionName(direction: { x: number; y: number }): string {
	if (direction.x === 1 && direction.y === 0)
		return 'E (右)';
	if (direction.x === -1 && direction.y === 0)
		return 'W (左)';
	if (direction.x === 0 && direction.y === -1)
		return 'S (下)';
	if (direction.x === 0 && direction.y === 1)
		return 'N (上)';
	if (direction.x === 1 && direction.y === -1)
		return 'SE (右下)';
	if (direction.x === -1 && direction.y === -1)
		return 'SW (左下)';
	if (direction.x === 1 && direction.y === 1)
		return 'NE (右上)';
	if (direction.x === -1 && direction.y === 1)
		return 'NW (左上)';
	return 'UNKNOWN';
}

async function createFanout(targetPos: { x: number; y: number }): Promise<void> {
	if (!fanoutState.selectedPadPosition)
		return;

	const viaPos = calculateViaPosition(fanoutState.selectedPadPosition, targetPos);
	const net = fanoutState.selectedPadNet || '';

	console.warn('[Fanout] ========== 创建扇出 ==========');
	console.warn(`[Fanout] 焊盘坐标 (mil): (${fanoutState.selectedPadPosition.x}, ${fanoutState.selectedPadPosition.y})`);
	console.warn(`[Fanout] 焊盘坐标 (mm): ${formatPos(fanoutState.selectedPadPosition.x, fanoutState.selectedPadPosition.y)}`);
	console.warn(`[Fanout] 过孔坐标 (mil): (${viaPos.x}, ${viaPos.y})`);
	console.warn(`[Fanout] 过孔坐标 (mm): ${formatPos(viaPos.x, viaPos.y)}`);
	console.warn(`[Fanout] 走线起点 (mil): (${fanoutState.selectedPadPosition.x}, ${fanoutState.selectedPadPosition.y})`);
	console.warn(`[Fanout] 走线终点 (mil): (${viaPos.x}, ${viaPos.y})`);
	console.warn('[Fanout] =============================');

	console.warn(`[Fanout] 过孔外径: ${fanoutState.params.viaDiameterMil} mil, 孔径: ${fanoutState.params.holeDiameterMil} mil`);
	console.warn(`[Fanout] 走线宽度: ${fanoutState.params.lineWidthMil} mil`);

	try {
		const viaResult = await eda.pcb_PrimitiveVia.create(
			net,
			viaPos.x,
			viaPos.y,
			fanoutState.params.holeDiameterMil,
			fanoutState.params.viaDiameterMil,
			DEFAULT_VIA_TYPE,
			undefined,
			undefined,
			false,
		);

		console.warn('[Fanout] 过孔创建结果:', viaResult);

		const lineResult = await eda.pcb_PrimitiveLine.create(
			net,
			EPCB_LayerId.TOP,
			fanoutState.selectedPadPosition.x,
			fanoutState.selectedPadPosition.y,
			viaPos.x,
			viaPos.y,
			fanoutState.params.lineWidthMil,
			false,
		);

		console.warn('[Fanout] 走线创建结果:', lineResult);
		console.warn('[Fanout] ========== 扇出完成 ==========');

		resetAfterFanout();
		eda.sys_Message.showToastMessage('扇出成功', ESYS_ToastMessageType.INFO);
	}
	catch (err) {
		console.error('[Fanout] 创建扇出过孔失败:', err);
		eda.sys_Message.showToastMessage('扇出失败', ESYS_ToastMessageType.ERROR);
	}
}

function resetState(): void {
	console.warn('[PadFanout] 重置状态');
	fanoutState.isEnabled = false;
	fanoutState.workState = 'IDLE';
	fanoutState.selectedPadPosition = null;
	fanoutState.selectedPadNet = null;
	fanoutState.selectedPadShape = null;
	fanoutState.selectedPadRotation = null;
	fanoutState.ignoreNextEmptyClick = false;
	fanoutState.selectedPads = [];
	fanoutState.selectionMode = null;
}

function resetAfterFanout(): void {
	console.warn('[PadFanout] 扇出完成后重置（保持启用状态）');
	fanoutState.workState = 'IDLE';
	fanoutState.selectedPadPosition = null;
	fanoutState.selectedPadNet = null;
	fanoutState.selectedPadShape = null;
	fanoutState.selectedPadRotation = null;
	fanoutState.ignoreNextEmptyClick = false;
	fanoutState.selectedPads = [];
	fanoutState.selectionMode = null;
}

function enableFanout(): void {
	console.warn('[PadFanout] ========== 启用扇出 ==========');
	fanoutState.isEnabled = true;
	fanoutState.workState = 'IDLE';
	console.warn('[PadFanout] ============================');
}

function cancelFanout(): void {
	console.warn('[PadFanout] ========== 取消扇出 ==========');
	fanoutState.isEnabled = false;
	fanoutState.workState = 'IDLE';
	fanoutState.selectedPadPosition = null;
	fanoutState.selectedPadNet = null;
	fanoutState.selectedPadShape = null;
	fanoutState.selectedPadRotation = null;
	fanoutState.ignoreNextEmptyClick = false;
	fanoutState.selectedPads = [];
	fanoutState.selectionMode = null;
	console.warn('[PadFanout] ==============================');
}

function stopPlugin(): void {
	console.warn('[PadFanout] ========== 停止插件 ==========');
	console.warn('[PadFanout] 1. 关闭 iframe...');
	eda.sys_IFrame.closeIFrame('pad-fanout-dialog');
	console.warn('[PadFanout] 2. 移除事件处理器...');
	unregisterEventHandlers();
	console.warn('[PadFanout] 3. 取消消息订阅...');
	unsubscribeMessage();
	console.warn('[PadFanout] 4. 重置状态...');
	resetState();
	console.warn('[PadFanout] ==============================');
}
