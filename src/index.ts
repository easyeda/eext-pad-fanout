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

// 兜底默认值（PCB 规则读取失败时使用）
const FALLBACK_VIA_DIAMETER_MIL = 23.622; // 0.6 mm
const FALLBACK_HOLE_DIAMETER_MIL = 11.811; // 0.3 mm
const FALLBACK_LINE_WIDTH_MIL = 10; // 0.254 mm
const FALLBACK_LINE_LENGTH_MIL = 100;

interface ViaTypeOption {
	label: string;
	viaType: EPCB_PrimitiveViaType;
	designRuleName: string | null;
}

const FALLBACK_VIA_TYPE_OPTIONS: ViaTypeOption[] = [
	{ label: '通孔', viaType: EPCB_PrimitiveViaType.VIA, designRuleName: null },
];

interface FanoutParams {
	viaDiameterMil: number;
	holeDiameterMil: number;
	lineWidthMil: number;
	lineLengthMil: number;
	staggerLengthMil: number;
	viaTypeOptions: ViaTypeOption[];
	selectedViaTypeIndex: number;
}

type WorkState = 'IDLE' | 'PAD_SELECTED';

interface SelectedPadInfo {
	position: { x: number; y: number };
	net: string | null;
	shape: string | null;
	rotation: number | null;
	componentCenter: { x: number; y: number } | null;
	padNumber: number;
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
	cursorFanoutEnabled: boolean;
	componentCenter: { x: number; y: number } | null;
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
		staggerLengthMil: 0,
		viaTypeOptions: [...FALLBACK_VIA_TYPE_OPTIONS],
		selectedViaTypeIndex: 0,
	},
	cursorFanoutEnabled: false,
	componentCenter: null,
};

const listenerId = 'pad-fanout-listener';
const MESSAGE_TOPIC = 'pad-fanout-action';
const MESSAGE_TOPIC_PARAMS_UPDATE = 'pad-fanout-params-update';
const MESSAGE_TOPIC_PAD_SELECTED = 'pad-fanout-pad-selected';
const MESSAGE_TOPIC_DIRECTION = 'pad-fanout-direction';
const MESSAGE_TOPIC_CURSOR_TOGGLE = 'pad-fanout-cursor-toggle';
const MESSAGE_TOPIC_REFRESH = 'pad-fanout-refresh';
const MESSAGE_TOPIC_RESET_UI = 'pad-fanout-reset-ui';

const IFRAME_WIDTH = 190;
const IFRAME_HEIGHT_EXPANDED = 400;

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
	fanoutState.isEnabled = true;

	console.warn('[PadFanout] 打开 iframe...');
	eda.sys_IFrame.openIFrame('./iframe/index.html', IFRAME_WIDTH, IFRAME_HEIGHT_EXPANDED, 'pad-fanout-dialog', {
		title: '焊盘扇出',
		minimizeButton: true,
		minimizeStyle: 'collapsed',
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
let paramsUpdateTask: { cancel: () => void } | null = null;

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
					fanoutState.params.selectedViaTypeIndex = message.params.viaTypeIndex ?? 0;
					console.warn('[PadFanout] 参数已更新:', fanoutState.params);
				}
				enableFanout();
			}
			else if (message.action === 'cancel') {
				cancelFanout();
			}
		}
	});

	// 订阅实时参数更新（启用后 UI 修改参数时触发）
	paramsUpdateTask = eda.sys_MessageBus.subscribePublic(MESSAGE_TOPIC_PARAMS_UPDATE, (message: any) => {
		if (!message)
			return;
		if (message.viaDiameter)
			fanoutState.params.viaDiameterMil = mmToMil(message.viaDiameter);
		if (message.holeDiameter)
			fanoutState.params.holeDiameterMil = mmToMil(message.holeDiameter);
		if (message.lineWidth)
			fanoutState.params.lineWidthMil = mmToMil(message.lineWidth);
		if (message.lineLength)
			fanoutState.params.lineLengthMil = mmToMil(message.lineLength);
		if (message.viaTypeIndex !== undefined)
			fanoutState.params.selectedViaTypeIndex = message.viaTypeIndex;
		if (message.staggerLength !== undefined)
			fanoutState.params.staggerLengthMil = mmToMil(message.staggerLength);
		console.warn('[PadFanout] 实时参数更新:', fanoutState.params);
	});

	// 订阅方向键消息（点击即执行）
	eda.sys_MessageBus.subscribePublic(MESSAGE_TOPIC_DIRECTION, async (message: any) => {
		if (!fanoutState.isEnabled || fanoutState.workState !== 'PAD_SELECTED')
			return;
		const { dx, dy } = message;
		const isDiag = dx !== 0 && dy !== 0;

		if (fanoutState.selectionMode === 'MULTI' && fanoutState.selectedPads.length > 0) {
			if (isDiag) {
				eda.sys_Message.showToastMessage('该方向不支持框选焊盘', ESYS_ToastMessageType.WARNING);
				return;
			}
			const baseLength = fanoutState.params.lineLengthMil;
			const stagger = fanoutState.params.staggerLengthMil;
			// 按焊盘编号排序，保证相邻焊盘参差严格交替
			const sortedPads = [...fanoutState.selectedPads].sort((a, b) => a.padNumber - b.padNumber);
			for (let i = 0; i < sortedPads.length; i++) {
				const padInfo = sortedPads[i];
				fanoutState.selectedPadPosition = padInfo.position;
				fanoutState.selectedPadNet = padInfo.net;
				fanoutState.selectedPadShape = padInfo.shape;
				fanoutState.selectedPadRotation = padInfo.rotation;
				fanoutState.params.lineLengthMil = (i % 2 === 0) ? baseLength : baseLength + stagger;
				await createFanoutByDirection(dx, dy);
			}
			fanoutState.params.lineLengthMil = baseLength;
			// 扇出完成后重置状态，防止光标扇出复用旧焊盘
			fanoutState.selectionMode = null;
			fanoutState.selectedPads = [];
			fanoutState.workState = 'IDLE';
			fanoutState.selectedPadPosition = null;
			fanoutState.selectedPadNet = null;
			fanoutState.selectedPadShape = null;
			fanoutState.selectedPadRotation = null;
			fanoutState.ignoreNextEmptyClick = false;
			eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, { mode: null });
			eda.sys_Message.showToastMessage('扇出成功', ESYS_ToastMessageType.INFO);
		}
		else if (fanoutState.selectedPadPosition) {
			if (isDiag && fanoutState.selectedPadShape !== 'ELLIPSE') {
				eda.sys_Message.showToastMessage('该方向不支持此焊盘形状', ESYS_ToastMessageType.WARNING);
				return;
			}
			await createFanoutByDirection(dx, dy);
			resetAfterFanout();
			eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, { mode: null });
			eda.sys_Message.showToastMessage('扇出成功', ESYS_ToastMessageType.INFO);
		}
	});

	// 订阅光标扇出开关
	eda.sys_MessageBus.subscribePublic(MESSAGE_TOPIC_CURSOR_TOGGLE, (message: any) => {
		fanoutState.cursorFanoutEnabled = message?.enabled === true;
		console.warn('[PadFanout] 光标扇出:', fanoutState.cursorFanoutEnabled);
	});

	// 订阅刷新消息
	eda.sys_MessageBus.subscribePublic(MESSAGE_TOPIC_REFRESH, async () => {
		console.warn('[PadFanout] 刷新 PCB 规则...');
		await loadPCBRuleDefaults();
		publishInitParams();
		eda.sys_Message.showToastMessage('规则已刷新', ESYS_ToastMessageType.INFO);
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
			const viaUnit: string = physics['Via Size']?.viaSize?.unit ?? 'mil';
			fanoutState.params.viaDiameterMil = viaUnit === 'mm'
				? mmToMil(viaForm.viaOuterdiameterDefault)
				: viaForm.viaOuterdiameterDefault;
			fanoutState.params.holeDiameterMil = viaUnit === 'mm'
				? mmToMil(viaForm.viaInnerdiameterDefault)
				: viaForm.viaInnerdiameterDefault;
			console.warn(`[PadFanout] 过孔规则(${viaUnit}): 外径=${fanoutState.params.viaDiameterMil} mil, 孔径=${fanoutState.params.holeDiameterMil} mil`);
		}

		const trackRules = physics.Track;
		if (trackRules) {
			const defaultRule = Object.values(trackRules).find((r: any) => r.isSetDefault) as any;
			const defaultWidth = defaultRule?.form?.data?.['1']?.defaultValue;
			const trackUnit: string = defaultRule?.unit ?? 'mil';
			if (defaultWidth) {
				fanoutState.params.lineWidthMil = trackUnit === 'mm' ? mmToMil(defaultWidth) : defaultWidth;
				console.warn(`[PadFanout] 走线规则(${trackUnit}): 线宽=${fanoutState.params.lineWidthMil} mil`);
			}
		}

		// 读取盲埋孔规则列表，合并两个表并按层号判断类型
		const blindBuriedSection = physics['Blind/Buried Via'];
		const options: ViaTypeOption[] = [
			{ label: '通孔', viaType: EPCB_PrimitiveViaType.VIA, designRuleName: null },
		];

		const allBlindBuriedItems: Array<{ name: string; key: string; startLayer: number; endLayer: number }> = [];
		if (Array.isArray(blindBuriedSection?.blindVia?.table)) {
			allBlindBuriedItems.push(...blindBuriedSection.blindVia.table);
		}
		if (Array.isArray(blindBuriedSection?.buriedVia?.table)) {
			allBlindBuriedItems.push(...blindBuriedSection.buriedVia.table);
		}

		if (allBlindBuriedItems.length > 0) {
			const maxLayer = Math.max(...allBlindBuriedItems.map(item => Math.max(item.startLayer, item.endLayer)));
			for (const item of allBlindBuriedItems) {
				const isBlind = item.startLayer === 1 || item.endLayer === 1
					|| item.startLayer === maxLayer || item.endLayer === maxLayer;
				options.push({
					label: isBlind ? `盲孔 ${item.name}` : `埋孔 ${item.name}`,
					viaType: EPCB_PrimitiveViaType.BLIND,
					// 盲孔用 name，埋孔用 key（API 参数要求不同）
					designRuleName: isBlind ? item.name : item.key,
				});
			}
		}
		fanoutState.params.viaTypeOptions = options;
		fanoutState.params.selectedViaTypeIndex = 0;
		console.warn(`[PadFanout] 过孔类型选项: ${options.map(o => o.label).join(', ')}`);
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
		staggerLength: milToMm(fanoutState.params.staggerLengthMil),
		viaTypeOptions: fanoutState.params.viaTypeOptions,
	});
	console.warn('[PadFanout] 已推送初始参数到 iframe');
}

function unsubscribeMessage(): void {
	if (messageBusTask) {
		console.warn('[PadFanout] 取消 MessageBus 订阅');
		messageBusTask.cancel();
		messageBusTask = null;
	}
	if (paramsUpdateTask) {
		paramsUpdateTask.cancel();
		paramsUpdateTask = null;
	}
}

async function handleMouseEvent(
	eventType: EPCB_MouseEventType,
	props: Array<{
		primitiveId: string;
		primitiveType: EPCB_PrimitiveType;
		net?: string;
		designator?: string;
		parentComponentPrimitiveId?: string;
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
			// 光标扇出：需开关开启
			if (!fanoutState.cursorFanoutEnabled) {
				return;
			}
			const mousePos = await eda.pcb_SelectControl.getCurrentMousePosition();
			if (mousePos) {
				console.warn(`[Fanout] 鼠标位置(mil): (${mousePos.x}, ${mousePos.y})`);
				if (fanoutState.selectionMode === 'MULTI' && fanoutState.selectedPads.length > 0) {
					console.warn('[Fanout] ========== 批量扇出 ==========');
					console.warn(`[Fanout] 焊盘数量: ${fanoutState.selectedPads.length}`);
					const baseLength = fanoutState.params.lineLengthMil;
					const stagger = fanoutState.params.staggerLengthMil;
					// 用距鼠标最近的焊盘作为参考原点，避免边缘焊盘方向判定偏差
					let nearestPad = fanoutState.selectedPads[0];
					let minDist = Number.MAX_VALUE;
					for (const pad of fanoutState.selectedPads) {
						const dist = (mousePos.x - pad.position.x) ** 2 + (mousePos.y - pad.position.y) ** 2;
						if (dist < minDist) {
							minDist = dist;
							nearestPad = pad;
						}
					}
					const refCenter = nearestPad.position;
					// 按焊盘编号排序，保证相邻焊盘参差严格交替
					const sortedPads = [...fanoutState.selectedPads].sort((a, b) => a.padNumber - b.padNumber);
					for (let i = 0; i < sortedPads.length; i++) {
						const padInfo = sortedPads[i];
						fanoutState.selectedPadPosition = padInfo.position;
						fanoutState.selectedPadNet = padInfo.net;
						fanoutState.selectedPadShape = padInfo.shape;
						fanoutState.selectedPadRotation = padInfo.rotation;
						fanoutState.params.lineLengthMil = (i % 2 === 0) ? baseLength : baseLength + stagger;
						const effectiveTarget = {
							x: padInfo.position.x + (mousePos.x - refCenter.x),
							y: padInfo.position.y + (mousePos.y - refCenter.y),
						};
						await createFanout(effectiveTarget);
					}
					fanoutState.params.lineLengthMil = baseLength;
					console.warn('[Fanout] ========== 批量扇出完成 ==========');
					fanoutState.selectionMode = null;
					fanoutState.selectedPads = [];
					fanoutState.workState = 'IDLE';
					fanoutState.selectedPadPosition = null;
					fanoutState.selectedPadNet = null;
					fanoutState.selectedPadShape = null;
					fanoutState.selectedPadRotation = null;
					fanoutState.ignoreNextEmptyClick = false;
					eda.sys_Message.showToastMessage('扇出成功', ESYS_ToastMessageType.INFO);
				}
				else if (fanoutState.selectedPadPosition) {
					await createFanout(mousePos);
					resetAfterFanout();
					eda.sys_Message.showToastMessage('扇出成功', ESYS_ToastMessageType.INFO);
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
					// 两种焊盘共有的属性
					const basePrim = p as unknown as {
						getState_X: () => number;
						getState_Y: () => number;
						getState_Net: () => string | undefined;
						getState_Pad: () => TPCB_PrimitivePadShape | undefined;
						getState_Rotation: () => number;
						getState_PadNumber: () => string;
					};
					const x = basePrim.getState_X();
					const y = basePrim.getState_Y();
					const net = basePrim.getState_Net();
					const pad = basePrim.getState_Pad();
					const padRotation = basePrim.getState_Rotation() * Math.PI / 180;
					const shape = Array.isArray(pad) && pad.length > 0 ? String(pad[0]) : 'UNKNOWN';
					const padNumber = Number.parseInt(basePrim.getState_PadNumber(), 10) || 0;

					// 仅器件焊盘（COMPONENT_PAD）有父元件，普通焊盘（PAD）无父元件
					let componentCenter: { x: number; y: number } | null = null;
					if (primitiveType === EPCB_PrimitiveType.COMPONENT_PAD) {
						const compPadPrim = p as unknown as {
							getState_ParentComponentPrimitiveId: () => string;
						};
						try {
							const parentId = compPadPrim.getState_ParentComponentPrimitiveId();
							console.warn(`[Fanout] 器件焊盘编号=${padNumber}, parentId=${parentId}`);
							if (parentId) {
								const comp = await eda.pcb_PrimitiveComponent.get(parentId);
								if (comp) {
									componentCenter = { x: comp.getState_X(), y: comp.getState_Y() };
									console.warn(`[Fanout] 封装中心 (mil): (${componentCenter.x}, ${componentCenter.y})`);
								}
								else {
									console.warn('[Fanout] pcb_PrimitiveComponent.get 返回 undefined');
								}
							}
						}
						catch (err) {
							console.warn('[Fanout] 获取封装中心失败:', err);
						}
					}
					else {
						console.warn(`[Fanout] 普通焊盘编号=${padNumber}，无父元件`);
					}

					padInfos.push({
						position: { x, y },
						net: net || null,
						shape,
						rotation: padRotation,
						componentCenter,
						padNumber,
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
				// 获取封装中心（用于光标扇出方向统一）
				fanoutState.componentCenter = null;
				try {
					const parentId = props[0]?.parentComponentPrimitiveId;
					console.warn('[Fanout] parentComponentPrimitiveId:', parentId);
					if (parentId) {
						const comp = await eda.pcb_PrimitiveComponent.get(parentId);
						if (comp) {
							fanoutState.componentCenter = { x: comp.getState_X(), y: comp.getState_Y() };
							console.warn(`[Fanout] 封装中心坐标 (mil): (${fanoutState.componentCenter.x}, ${fanoutState.componentCenter.y})`);
						}
						else {
							console.warn('[Fanout] pcb_PrimitiveComponent.get 返回 undefined');
						}
					}
					else {
						console.warn('[Fanout] 无 parentComponentPrimitiveId，非封装焊盘');
					}
				}
				catch (err) {
					console.warn('[Fanout] 获取封装中心失败:', err);
				}
				eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, {
					mode: 'SINGLE',
					shape: padInfos[0].shape,
					hasRotation: padInfos[0].rotation !== null && padInfos[0].rotation !== 0,
				});
			}
			else {
				console.warn('[Fanout] ========== 选中多个焊盘 ==========');
				console.warn(`[Fanout] 焊盘数量: ${padInfos.length}`);
				console.warn('[Fanout] =============================');

				fanoutState.selectionMode = 'MULTI';
				fanoutState.selectedPads = padInfos;
				fanoutState.workState = 'PAD_SELECTED';
				fanoutState.ignoreNextEmptyClick = true;
				// 获取封装中心（用于光标扇出方向统一）
				fanoutState.componentCenter = null;
				try {
					const parentId = props[0]?.parentComponentPrimitiveId;
					console.warn('[Fanout] MULTI parentComponentPrimitiveId:', parentId);
					if (parentId) {
						const comp = await eda.pcb_PrimitiveComponent.get(parentId);
						if (comp) {
							fanoutState.componentCenter = { x: comp.getState_X(), y: comp.getState_Y() };
							console.warn(`[Fanout] 封装中心坐标 (mil): (${fanoutState.componentCenter.x}, ${fanoutState.componentCenter.y})`);
						}
						else {
							console.warn('[Fanout] MULTI: pcb_PrimitiveComponent.get 返回 undefined');
						}
					}
					else {
						console.warn('[Fanout] MULTI: 无 parentComponentPrimitiveId');
					}
				}
				catch (err) {
					console.warn('[Fanout] MULTI 获取封装中心失败:', err);
				}
				eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, {
					mode: 'MULTI',
					shape: null,
					hasRotation: false,
				});
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

			const padInfos: SelectedPadInfo[] = [];
			for (const p of primitives) {
				const primitiveType = p.getState_PrimitiveType();
				if (primitiveType === EPCB_PrimitiveType.PAD
					|| primitiveType === EPCB_PrimitiveType.COMPONENT_PAD) {
					const basePrim = p as unknown as {
						getState_X: () => number;
						getState_Y: () => number;
						getState_Net: () => string | undefined;
						getState_Pad: () => TPCB_PrimitivePadShape | undefined;
						getState_Rotation: () => number;
						getState_PadNumber: () => string;
					};
					const x = basePrim.getState_X();
					const y = basePrim.getState_Y();
					const net = basePrim.getState_Net();
					const pad = basePrim.getState_Pad();
					const padRotation = basePrim.getState_Rotation() * Math.PI / 180;
					const shape = Array.isArray(pad) && pad.length > 0 ? String(pad[0]) : 'UNKNOWN';
					const padNumber = Number.parseInt(basePrim.getState_PadNumber(), 10) || 0;
					let componentCenter: { x: number; y: number } | null = null;
					if (primitiveType === EPCB_PrimitiveType.COMPONENT_PAD) {
						const compPadPrim = p as unknown as {
							getState_ParentComponentPrimitiveId: () => string;
						};
						try {
							const parentId = compPadPrim.getState_ParentComponentPrimitiveId();
							if (parentId) {
								const comp = await eda.pcb_PrimitiveComponent.get(parentId);
								if (comp)
									componentCenter = { x: comp.getState_X(), y: comp.getState_Y() };
							}
						}
						catch { /* 忽略 */ }
					}
					padInfos.push({ position: { x, y }, net: net || null, shape, rotation: padRotation, componentCenter, padNumber });
				}
			}

			if (padInfos.length === 0)
				return;

			// 重置，新焊盘需要重新选方向

			if (padInfos.length === 1) {
				console.warn('[Fanout] ========== 切换单个焊盘 ==========');
				console.warn(`[Fanout] 新焊盘坐标 (mil): (${padInfos[0].position.x}, ${padInfos[0].position.y})`);
				console.warn(`[Fanout] 新焊盘形状: ${padInfos[0].shape}`);
				console.warn('[Fanout] =============================');

				fanoutState.selectionMode = 'SINGLE';
				fanoutState.selectedPadRotation = padInfos[0].rotation;
				fanoutState.selectedPadPosition = padInfos[0].position;
				fanoutState.selectedPadNet = padInfos[0].net;
				fanoutState.selectedPadShape = padInfos[0].shape;
				fanoutState.selectedPads = [];
				fanoutState.ignoreNextEmptyClick = true;
				// 更新封装中心
				fanoutState.componentCenter = null;
				try {
					const parentId = props[0]?.parentComponentPrimitiveId;
					if (parentId) {
						const comp = await eda.pcb_PrimitiveComponent.get(parentId);
						if (comp)
							fanoutState.componentCenter = { x: comp.getState_X(), y: comp.getState_Y() };
					}
				}
				catch { /* 忽略 */ }
				eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, {
					mode: 'SINGLE',
					shape: padInfos[0].shape,
					hasRotation: padInfos[0].rotation !== 0,
				});
			}
			else {
				console.warn('[Fanout] ========== 切换多个焊盘 ==========');
				console.warn(`[Fanout] 焊盘数量: ${padInfos.length}`);
				console.warn('[Fanout] =============================');

				fanoutState.selectionMode = 'MULTI';
				fanoutState.selectedPads = padInfos;
				fanoutState.selectedPadPosition = null;
				fanoutState.selectedPadNet = null;
				fanoutState.selectedPadShape = null;
				fanoutState.selectedPadRotation = null;
				fanoutState.ignoreNextEmptyClick = true;
				// 更新封装中心
				fanoutState.componentCenter = null;
				try {
					const parentId = props[0]?.parentComponentPrimitiveId;
					if (parentId) {
						const comp = await eda.pcb_PrimitiveComponent.get(parentId);
						if (comp)
							fanoutState.componentCenter = { x: comp.getState_X(), y: comp.getState_Y() };
					}
				}
				catch { /* 忽略 */ }
				eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, {
					mode: 'MULTI',
					shape: null,
					hasRotation: false,
				});
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
		eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, { mode: null });
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
	let globalDir: { x: number; y: number };
	if (fanoutState.selectedPadShape === 'ELLIPSE') {
		// 圆形焊盘方向已在全局坐标系中计算，无需旋转变换
		globalDir = localDir;
	}
	else {
		const rad = (rotation ?? 0) * Math.PI / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		globalDir = { x: localDir.x * cos - localDir.y * sin, y: localDir.x * sin + localDir.y * cos };
	}
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

async function createFanoutByDirection(localDirX: number, localDirY: number): Promise<void> {
	if (!fanoutState.selectedPadPosition)
		return;
	const rotation = fanoutState.selectedPadRotation;
	const length = fanoutState.params.lineLengthMil;
	const localDir = { x: localDirX * length, y: localDirY * length };
	let globalDir: { x: number; y: number };
	if (fanoutState.selectedPadShape === 'ELLIPSE' || !rotation) {
		globalDir = localDir;
	}
	else {
		const rad = rotation * Math.PI / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		globalDir = { x: localDir.x * cos - localDir.y * sin, y: localDir.x * sin + localDir.y * cos };
	}
	const viaPos = {
		x: fanoutState.selectedPadPosition.x + globalDir.x,
		y: fanoutState.selectedPadPosition.y + globalDir.y,
	};
	const net = fanoutState.selectedPadNet || '';
	const selectedViaType = fanoutState.params.viaTypeOptions[fanoutState.params.selectedViaTypeIndex]
		?? fanoutState.params.viaTypeOptions[0];
	if (selectedViaType.viaType === EPCB_PrimitiveViaType.BLIND && !selectedViaType.designRuleName) {
		eda.sys_Message.showToastMessage('未设计盲埋孔！', ESYS_ToastMessageType.WARNING);
		return;
	}
	try {
		await eda.pcb_PrimitiveVia.create(
			net,
			viaPos.x,
			viaPos.y,
			fanoutState.params.holeDiameterMil,
			fanoutState.params.viaDiameterMil,
			selectedViaType.viaType,
			selectedViaType.designRuleName ?? undefined,
			undefined,
			false,
		);
		await eda.pcb_PrimitiveLine.create(
			net,
			EPCB_LayerId.TOP,
			fanoutState.selectedPadPosition.x,
			fanoutState.selectedPadPosition.y,
			viaPos.x,
			viaPos.y,
			fanoutState.params.lineWidthMil,
			false,
		);
	}
	catch (err) {
		console.error('[Fanout] 方向键扇出失败:', err);
		eda.sys_Message.showToastMessage('扇出失败', ESYS_ToastMessageType.ERROR);
	}
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
		const selectedViaType = fanoutState.params.viaTypeOptions[fanoutState.params.selectedViaTypeIndex]
			?? fanoutState.params.viaTypeOptions[0];
		console.warn(`[Fanout] 过孔类型: ${selectedViaType.label}, designRuleName: ${selectedViaType.designRuleName}`);

		// 盲埋孔但无规则名称，说明 PCB 未配置对应规则
		if (selectedViaType.viaType === EPCB_PrimitiveViaType.BLIND && !selectedViaType.designRuleName) {
			eda.sys_Message.showToastMessage('未设计盲埋孔！', ESYS_ToastMessageType.WARNING);
			return;
		}

		const viaResult = await eda.pcb_PrimitiveVia.create(
			net,
			viaPos.x,
			viaPos.y,
			fanoutState.params.holeDiameterMil,
			fanoutState.params.viaDiameterMil,
			selectedViaType.viaType,
			selectedViaType.designRuleName ?? undefined,
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
	fanoutState.cursorFanoutEnabled = false;
	fanoutState.componentCenter = null;
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
	fanoutState.componentCenter = null;
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
	fanoutState.cursorFanoutEnabled = false;
	// 通知 iframe 重置 UI 状态
	eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_RESET_UI, {});
	eda.sys_MessageBus.publishPublic(MESSAGE_TOPIC_PAD_SELECTED, { mode: null });
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
