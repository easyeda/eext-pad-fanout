# DOC-010 参数动态化与 PCB 规则集成

## 功能说明

插件启动时自动读取当前 PCB 的设计规则，将过孔尺寸和走线宽度的默认值填入 UI 面板。用户可在面板中修改这些参数，点击"启用扇出"后参数生效。若 PCB 规则读取失败，则使用内置兜底默认值。

## 数据流

```
padFanout() 启动
  ↓
loadPCBRuleDefaults()
  读取 eda.pcb_Drc.getCurrentRuleConfiguration()
  提取 config.config.Physics['Via Size'] 和 Physics['Track']
  写入 fanoutState.params（mil 单位）
  ↓
openIFrame()  打开 UI 面板（高度 340px）
  ↓
setTimeout 500ms → publishInitParams()
  发布 'pad-fanout-init' 消息（mm 单位）
  ↓
iframe 收到 'pad-fanout-init'
  填充 4 个输入框（过孔外径、孔径、线宽、线长）

用户点击"启用扇出"
  ↓
sendEnableWithParams()
  读取 4 个输入框当前值（mm）
  发布 'pad-fanout-action' { action:'enable', params:{...} }
  ↓
主插件 subscribeMessage() 收到消息
  将 params 从 mm 转换为 mil，写入 fanoutState.params
  调用 enableFanout()

createFanout() 执行时
  使用 fanoutState.params.holeDiameterMil / viaDiameterMil / lineWidthMil / lineLengthMil
```

## PCB 规则数据结构

`eda.pcb_Drc.getCurrentRuleConfiguration()` 返回：

```json
{
	"config": {
		"Physics": {
			"Via Size": {
				"viaSize": {
					"unit": "mil",
					"isSetDefault": true,
					"form": {
						"viaOuterdiameterDefault": 24.0158,
						"viaInnerdiameterDefault": 12.0078,
						"viaOuterdiameterMin": 19.685,
						"viaOuterdiameterMax": 393.7008,
						"viaInnerdiameterMin": 11.811,
						"viaInnerdiameterMax": 248.0314
					}
				}
			},
			"Track": {
				"copperThickness1oz": {
					"unit": "mil",
					"isSetDefault": true,
					"form": {
						"data": {
							"1": {
								"minValue": 5,
								"defaultValue": 10,
								"maxValue": 100
							}
						}
					}
				}
			}
		}
	}
}
```

插件读取路径：
- 过孔外径：`config.config.Physics['Via Size'].viaSize.form.viaOuterdiameterDefault`
- 孔径：`config.config.Physics['Via Size'].viaSize.form.viaInnerdiameterDefault`
- 走线宽度：`Physics['Track']` 中 `isSetDefault === true` 的条目的 `form.data['1'].defaultValue`

所有值单位为 **mil**。

## 消息协议

### pad-fanout-init（主插件 → iframe）

```json
{
	"viaDiameter": 0.610,
	"holeDiameter": 0.305,
	"lineWidth": 0.254,
	"lineLength": 2.540
}
```

单位：mm。在 `padFanout()` 打开 iframe 后约 500ms 发送，等待 iframe 加载完成。

### pad-fanout-action（iframe → 主插件）

启用时：
```json
{
	"action": "enable",
	"params": {
		"viaDiameter": 0.610,
		"holeDiameter": 0.305,
		"lineWidth": 0.254,
		"lineLength": 2.540
	}
}
```

取消时：
```json
{ "action": "cancel" }
```

单位：mm。主插件收到后调用 `mmToMil()` 转换并存入 `fanoutState.params`。

## 兜底默认值

当 PCB 规则读取失败（无 PCB 文档、API 异常等）时，使用以下常量：

| 参数 | 常量名 | 值 |
|------|--------|-----|
| 过孔外径 | `FALLBACK_VIA_DIAMETER_MIL` | 23.622 mil (0.6 mm) |
| 孔径 | `FALLBACK_HOLE_DIAMETER_MIL` | 11.811 mil (0.3 mm) |
| 走线宽度 | `FALLBACK_LINE_WIDTH_MIL` | 10 mil (0.254 mm) |
| 扇出距离 | `FALLBACK_LINE_LENGTH_MIL` | 100 mil (2.54 mm) |

## 涉及文件

| 文件 | 变更内容 |
|------|---------|
| `src/index.ts` | 新增 `FanoutParams` 接口、`loadPCBRuleDefaults()`、`publishInitParams()`；更新 `padFanout()`、`subscribeMessage()`、`createFanout()`、`calculateViaPosition()` |
| `iframe/index.html` | 新增过孔外径/孔径输入框；新增 `sendEnableWithParams()`、`initMessageSubscription()`；更新 `toggleMode()` |
