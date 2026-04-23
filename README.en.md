[简体中文](./README.md) | [English](#) | [繁體中文](./README.zh-Hant.md) | [日本語](./README.ja.md) | [Русский](./README.ru.md)

# Pad Fanout

JLCEDA Pro PCB Pad Fanout Vias Plugin v2.3.1

## Overview

Automatically create fanout vias and traces for selected pads in PCB designs.

**Key features:**

- **Single-pad fanout**: Select a single pad and perform fanout using the direction keys.
- **Batch fanout**: Box-select multiple pads and perform fanout in a unified direction; execution follows pad-number order.
- **Direction-key fanout**: The UI provides 8 direction keys; circular pads support 8 directions, other shapes support 4 directions.
- **Cursor fanout**: When cursor fanout mode is enabled, clicking an empty area on the canvas automatically determines direction and performs the fanout.
- **Blind/buried via support**: Automatically reads blind/buried via settings from PCB design rules; supports through/blind/buried via selection.
- **Rule-following defaults**: On startup the plugin reads via sizes and trace widths from PCB design rules as defaults; supports mm/mil auto-detection and unit switching.
- **Staggered fanout**: When multiple pads are selected, you can set a stagger length so adjacent pads alternate between different fanout lengths.
- **Rotated pad support**: For non-circular pads with rotation, direction keys correspond to the pad's local coordinate directions.

## Usage

1. Start the plugin from the EDA top menu: **Pad Fanout** → **Pad Fanout...**
2. Select or box-select pads on the PCB canvas.
3. Click the direction buttons in the UI panel to execute fanout; or enable the "Cursor Fanout" switch and click an empty area on the canvas.
4. Adjustable parameters in the UI panel:
   - Via type (through / blind / buried)
   - Via outer diameter and drill diameter (mm)
   - Trace width and trace length (mm)
   - Stagger length (mm — used to alternate lengths in batch fanout)
5. Click "↺ Refresh" to re-read the current PCB design rules.
![alt text](企业微信截图_17769280433269.png)

## Notes

- For non-circular pads with a rotation angle, the direction keys correspond to the pad's local coordinate system, not the canvas global directions.
- Diagonal direction keys (↖↗↙↘) only work for circular pads; rectangular pads will show an unsupported message.
- When box-selecting multiple pads, cursor fanout uses the pad nearest to the mouse as the reference origin to determine direction.

## Build

```shell
npm install          # install dependencies
npm run compile      # compile TypeScript → dist/index.js
npm run build        # compile + package → build/dist/*.eext
npm run lint         # ESLint check
npm run fix          # ESLint auto-fix
```

The build artifact `.eext` is located in `build/dist/` and can be imported in the EDA Extension Manager.

## Installation

EDA Pro V3: Top menu → Advanced → Extension Manager… → Import

## License

[Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/)
