/**
 * 单焊盘扇出过孔插件
 *
 * 功能：选中单个焊盘，根据鼠标方向进行扇出过孔
 * 操作：点击焊盘选择 → 点击目标位置创建过孔和走线
 */
import * as extensionConfig from '../extension.json';

function mmToMil(mm: number): number {
	return eda.sys_Unit.mmToMil(mm);
}

const DEFAULT_FANOUT_DISTANCE_MM = 2.54;
const DEFAULT_VIA_DIAMETER_MM = 0.6;
const DEFAULT_HOLE_DIAMETER_MM = 0.3;
const DEFAULT_LINE_WIDTH_MM = 0.254;
const DEFAULT_VIA_TYPE = EPCB_PrimitiveViaType.VIA;

type WorkState = 'IDLE' | 'PAD_SELECTED';

interface FanoutState {
	isEnabled: boolean;
	selectedPadPosition: { x: number; y: number } | null;
	selectedPadNet: string | null;
	workState: WorkState;
	ignoreNextEmptyClick: boolean;
}

const fanoutState: FanoutState = {
	isEnabled: false,
	selectedPadPosition: null,
	selectedPadNet: null,
	workState: 'IDLE',
	ignoreNextEmptyClick: false,
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

export function padFanout(): void {
	console.warn('[PadFanout] ========== 启动工具 ==========');
	console.warn('[PadFanout] padFanout() 被调用');

	resetState();
	registerEventHandlers();
	subscribeMessage();

	console.warn('[PadFanout] 打开 iframe...');
	eda.sys_IFrame.openIFrame('./iframe/index.html', 200, 290, 'pad-fanout-dialog');

	console.warn('[PadFanout] ============================');
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
				enableFanout();
			}
			else if (message.action === 'cancel') {
				cancelFanout();
			}
		}
	});
	console.warn('[PadFanout] MessageBus 订阅成功');
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

	if (!props || props.length === 0) {
		if (fanoutState.workState === 'PAD_SELECTED') {
			if (fanoutState.ignoreNextEmptyClick) {
				fanoutState.ignoreNextEmptyClick = false;
				console.warn('[Fanout] 忽略空点击');
				return;
			}
			const mousePos = await eda.pcb_SelectControl.getCurrentMousePosition();
			if (mousePos) {
				console.warn(`[Fanout] 鼠标位置(mil): (${mousePos.x}, ${mousePos.y})`);
				if (fanoutState.selectedPadPosition) {
					await createFanout(mousePos);
				}
			}
		}
		return;
	}

	const prim = props[0];
	console.warn('[Fanout] 图元类型:', prim.primitiveType);

	const isPad = prim.primitiveType === EPCB_PrimitiveType.PAD
		|| prim.primitiveType === EPCB_PrimitiveType.COMPONENT_PAD;

	if (isPad && fanoutState.workState === 'IDLE') {
		try {
			const primitives = await eda.pcb_SelectControl.getAllSelectedPrimitives();
			console.warn('[Fanout] 选中图元数量:', primitives?.length);

			if (primitives && primitives.length > 0) {
				for (const p of primitives) {
					const primitiveType = p.getState_PrimitiveType();
					if (primitiveType === EPCB_PrimitiveType.PAD
						|| primitiveType === EPCB_PrimitiveType.COMPONENT_PAD) {
						const padPrim = p as unknown as {
							getState_X: () => number;
							getState_Y: () => number;
							getState_Net: () => string | undefined;
						};
						const x = padPrim.getState_X();
						const y = padPrim.getState_Y();
						const net = padPrim.getState_Net();

						console.warn(`[Fanout] 选中焊盘(mil): (${x}, ${y}) 网络: ${net}`);

						fanoutState.selectedPadPosition = { x, y };
						fanoutState.selectedPadNet = net || null;
						fanoutState.workState = 'PAD_SELECTED';
						fanoutState.ignoreNextEmptyClick = true;
						break;
					}
				}
			}
		}
		catch (err) {
			console.error('[Fanout] 获取选中图元失败:', err);
		}
	}
}

function calculateViaPosition(
	padPos: { x: number; y: number },
	targetPos: { x: number; y: number },
): { x: number; y: number } {
	const dx = targetPos.x - padPos.x;
	const dy = targetPos.y - padPos.y;
	const distance = Math.sqrt(dx * dx + dy * dy);

	if (distance < 0.001)
		return padPos;

	const nx = dx / distance;
	const ny = dy / distance;

	const distanceMil = mmToMil(DEFAULT_FANOUT_DISTANCE_MM);

	return {
		x: padPos.x + distanceMil * nx,
		y: padPos.y + distanceMil * ny,
	};
}

async function createFanout(targetPos: { x: number; y: number }): Promise<void> {
	if (!fanoutState.selectedPadPosition)
		return;

	const viaPos = calculateViaPosition(fanoutState.selectedPadPosition, targetPos);
	const net = fanoutState.selectedPadNet || '';

	console.warn(`[Fanout] 创建扇出 - 焊盘(mil): (${fanoutState.selectedPadPosition.x}, ${fanoutState.selectedPadPosition.y})`);
	console.warn(`[Fanout] 过孔(mil): (${viaPos.x}, ${viaPos.y})`);

	try {
		const viaResult = await eda.pcb_PrimitiveVia.create(
			net,
			viaPos.x,
			viaPos.y,
			mmToMil(DEFAULT_HOLE_DIAMETER_MM),
			mmToMil(DEFAULT_VIA_DIAMETER_MM),
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
			mmToMil(DEFAULT_LINE_WIDTH_MM),
			false,
		);

		console.warn('[Fanout] 走线创建结果:', lineResult);

		resetState();
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
	fanoutState.ignoreNextEmptyClick = false;
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
	fanoutState.ignoreNextEmptyClick = false;
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
