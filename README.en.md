[简体中文](./README.md) | [English](#) | [繁體中文](./README.zh-Hant.md) | [日本語](./README.ja.md) | [Русский](./README.ru.md)

# Pad Fanout

JLCEDA / EasyEDA Pro PCB Pad Fanout Via Plugin v2.3.5

## Features

Automatically create fanout vias and traces for selected pads in PCB design.

**Key Features:**

- **Single Pad Fanout**: Select a single pad and fan out via direction buttons or staggered length setting
- **Batch Fanout**: Box-select multiple pads and fan out all at once in a unified direction, executed in pad number order
- **Direction Button Fanout**: UI provides 8 direction buttons; all pad shapes support 8-direction fanout
- **Cursor Fanout**: Enable cursor fanout mode, then click on empty canvas to automatically determine direction and fan out
- **Blind/Buried Via Support**: Automatically reads blind/buried via configuration from PCB design rules; supports through-hole, blind, and buried vias
- **Design Rule Following**: Automatically reads via size and trace width from PCB design rules as defaults on startup; supports mm/mil unit auto-detection and switching
- **Net Rule Following**: When switching pads, automatically updates default trace width based on the selected pad's net rules
- **Staggered Fanout**: Set stagger length for both single and batch pad fanout; adjacent pads alternate between different fanout lengths
- **Collapsible Panel**: Main panel collapses to a mini popup with refresh, cursor fanout toggle, and expand button
- **Rotated Pad Support**: For non-circular pads with rotation, direction buttons correspond to consistent dial directions
- **Persistent Settings**: Remembers the last used trace length setting

## Usage

1. Launch the plugin from the EDA top menu: **Pad Fanout** → **Pad Fanout…**
2. Single-click or box-select pads on the PCB canvas
3. Click direction buttons in the UI panel to fan out; or enable "Cursor Fanout" toggle and click on empty canvas
4. Adjust the following parameters in the UI panel:
   - Via type (through-hole / blind / buried)
   - Via outer diameter, hole diameter (mm/mil)
   - Trace width, trace length (mm/mil)
   - Stagger length (for alternating trace length in fanout)
5. Click "↺ Refresh" to re-read current PCB design rules
6. Click "−" to collapse the main panel; a mini popup appears when collapsed

![alt text](企业微信截图_17769280433269.png)

## Notes

- When box-selecting multiple pads, cursor fanout uses the pad closest to the mouse cursor as the reference point for direction determination

## Build

```shell
npm install          # Install dependencies
npm run compile      # TypeScript → dist/index.js
npm run build        # Compile + Package → build/dist/*.eext
npm run lint         # ESLint check
npm run fix          # ESLint auto-fix
```

The build output `.eext` file is located in `build/dist/`. Import it in the EDA Extension Manager to use.

## Installation

**EDA Pro V3:** Top menu → Advanced → Extension Manager… → Import

## License

[Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/)
