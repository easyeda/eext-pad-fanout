# AGENTS.md

## Project Overview

SDK for building extensions/plugins for EasyEDA Pro (JLCEDA). Extensions are packaged as `.eext` files.

## Build Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run lint` | Run ESLint |
| `npm run fix` | Run ESLint with `--fix` |
| `npm run compile` | Compile TypeScript via esbuild to `./dist/` |
| `npm run build` | Full pipeline: compile + package (runs `packaged.ts`) |

Output: `build/dist/<name>_v<version>.eext`

## Build Pipeline

`npm run build` runs two steps:
1. `ts-node ./config/esbuild.prod.ts` - esbuild compilation
2. `ts-node ./build/packaged.ts` - creates `.eext` package (zip)

The `packaged.ts` script also **auto-generates UUID** in `extension.json` if the `uuid` field is empty.

## Extension Entry Point

- Default entry: `src/index.ts`
- Configurable via `extension.json` -> `entry` field
- Export named functions to reference them in `headerMenus` in `extension.json`

## Code Style

- ESLint config: `@antfu/eslint-config`
- Indent: **tabs**
- Quotes: single
- Semi: yes

Pre-commit hook: `lint-staged` runs `eslint --fix` on all staged files.

## Type Definitions

Dev dependency `@jlceda/pro-api-types` provides the `eda` global types. The `eda` namespace is injected by EasyEDA Pro at runtime.

## EDA API Reference (via `eda` global namespace)

Complete API reference: https://prodocs.lceda.cn/cn/api/reference/pro-api.html

### SYS (System APIs) - accessed via `eda.sys_*`

| Class | Description |
|---|---|
| `eda.sys_ClientUrl` | Client URL utilities |
| `eda.sys_Dialog` | Dialogs (showInformationMessage, etc.) |
| `eda.sys_Environment` | Environment info |
| `eda.sys_FileManager` | File management |
| `eda.sys_FileSystem` | File system operations |
| `eda.sys_FontManager` | Font management |
| `eda.sys_FormatConversion` | Format conversion |
| `eda.sys_HeaderMenu` | Header menu control |
| `eda.sys_I18n` | Internationalization (text translations) |
| `eda.sys_IFrame` | Inline frame control |
| `eda.sys_LoadingAndProgressBar` | Loading/progress indicators |
| `eda.sys_Log` | Logging |
| `eda.sys_Message` | Toast messages |
| `eda.sys_MessageBus` | Inter-extension messaging |
| `eda.sys_PanelControl` | Panel control |
| `eda.sys_RightClickMenu` | Right-click context menu |
| `eda.sys_Setting` | Settings management |
| `eda.sys_ShortcutKey` | Keyboard shortcuts |
| `eda.sys_Storage` | Local storage |
| `eda.sys_Timer` | Timer utilities |
| `eda.sys_Unit` | Unit conversion |
| `eda.sys_WebSocket` | WebSocket communication |
| `eda.sys_Window` | Window events |

### DMT (Document Tree APIs) - accessed via `eda.dmt_*`

| Class | Description |
|---|---|
| `eda.dmt_EditorControl` | Editor control |
| `eda.dmt_SelectControl` | Selection control |
| `eda.dmt_Workspace` | Workspace management |
| `eda.dmt_Team` | Team collaboration |
| `eda.dmt_Folder` | Folder operations |
| `eda.dmt_Project` | Project management |
| `eda.dmt_Board` | Board/PCB file management |
| `eda.dmt_Schematic` | Schematic file management |
| `eda.dmt_Pcb` | PCB operations |
| `eda.dmt_Panel` | Panel management |

### SCH (Schematic APIs) - accessed via `eda.sch_*`

| Class | Description |
|---|---|
| `eda.sch_Document` | Schematic document operations |
| `eda.sch_Drc` | Design rule check |
| `eda.sch_Event` | Schematic events |
| `eda.sch_ManufactureData` | BOM, NC drill export |
| `eda.sch_Primitive` | Base schematic primitive |
| `eda.sch_PrimitiveArc` | Arc primitives |
| `eda.sch_PrimitiveAttribute` | Attribute primitives |
| `eda.sch_PrimitiveBus` | Bus primitives |
| `eda.sch_PrimitiveCircle` | Circle primitives |
| `eda.sch_PrimitiveComponent` | Component primitives |
| `eda.sch_PrimitivePin` | Pin primitives |
| `eda.sch_PrimitivePolygon` | Polygon primitives |
| `eda.sch_PrimitiveRectangle` | Rectangle primitives |
| `eda.sch_PrimitiveText` | Text primitives |
| `eda.sch_PrimitiveWire` | Wire primitives |
| `eda.sch_SelectControl` | Schematic selection |
| `eda.sch_SimulationEngine` | SPICE simulation |
| `eda.sch_Utils` | Schematic utilities |

### PCB (PCB APIs) - accessed via `eda.pcb_*`

| Class | Description |
|---|---|
| `eda.pcb_Document` | PCB document operations |
| `eda.pcb_Drc` | PCB design rule check |
| `eda.pcb_Event` | PCB events |
| `eda.pcb_Layer` | Layer management |
| `eda.pcb_ManufactureData` | Gerber, drill export |
| `eda.pcb_MathPolygon` | Polygon math utilities |
| `eda.pcb_Net` | Net operations |
| `eda.pcb_Primitive` | Base PCB primitive |
| `eda.pcb_PrimitiveArc` | Arc primitives |
| `eda.pcb_PrimitiveAttribute` | Attribute primitives |
| `eda.pcb_PrimitiveComponent` | Component primitives |
| `eda.pcb_PrimitiveDimension` | Dimension primitives |
| `eda.pcb_PrimitiveFill` | Fill primitives |
| `eda.pcb_PrimitiveImage` | Image primitives |
| `eda.pcb_PrimitiveLine` | Line primitives |
| `eda.pcb_PrimitiveObject` | Embedded object primitives |
| `eda.pcb_PrimitivePad` | Pad primitives |
| `eda.pcb_PrimitivePolyline` | Polyline primitives |
| `eda.pcb_PrimitivePour` | Pour border primitives |
| `eda.pcb_PrimitivePoured` | Copper pour primitives |
| `eda.pcb_PrimitiveRegion` | Region primitives |
| `eda.pcb_PrimitiveString` | String primitives |
| `eda.pcb_PrimitiveVia` | Via primitives |
| `eda.pcb_SelectControl` | PCB selection |

### PNL (Panel APIs) - accessed via `eda.pnl_*`

| Class | Description |
|---|---|
| `eda.pnl_Document` | Panel document operations |

### LIB (Library APIs) - accessed via `eda.lib_*`

| Class | Description |
|---|---|
| `eda.lib_LibrariesList` | Library list management |
| `eda.lib_Classification` | Classification indices |
| `eda.lib_SelectControl` | Library selection |
| `eda.lib_Device` | Device operations |
| `eda.lib_Symbol` | Symbol operations |
| `eda.lib_Footprint` | Footprint operations |
| `eda.lib_3DModel` | 3D model operations |
| `eda.lib_PanelLibrary` | Panel library |
| `eda.lib_Cbb` | CBB (reuse module) operations |

### Enums - accessed via `eda.e*`

| Enum | Description |
|---|---|
| `eda.eSYS_NetlistType` | Netlist types |
| `eda.eSYS_LogType` | Log message types |
| `eda.eSYS_ToastMessageType` | Toast message types |
| `eda.eSYS_BottomPanelTab` | Bottom panel tabs |
| `eda.eSYS_LeftPanelTab` | Left panel tabs |
| `eda.eSYS_RightPanelTab` | Right panel tabs |
| `eda.eSYS_Theme` | UI themes |
| `eda.eDMT_EditorDocumentType` | Editor document types |
| `eda.eDMT_ItemType` | Document tree item types |
| `eda.eSCH_PrimitiveType` | Schematic primitive types |
| `eda.eSCH_PrimitivePinShape` | Pin shapes |
| `eda.eSCH_PrimitivePinType` | Pin types |
| `eda.ePCB_LayerId` | PCB layer IDs |
| `eda.ePCB_PrimitiveType` | PCB primitive types |
| `eda.ePCB_PrimitivePadShapeType` | Pad shape types |
| `eda.ePCB_PrimitiveViaType` | Via types |
| `eda.eLIB_LibraryType` | Library types |
| `eda.eLIB_DeviceJlcLibraryCategory` | JLC library categories |

## .edaignore

Custom ignore file used by `packaged.ts` when creating the `.eext` archive. Includes:
- Source files (`src/`, `config/`, `build/`)
- Dev tooling (`.eslintrc`, `tsconfig.json`, `package.json`)
- Build artifacts (`dist/`, `node_modules/`)

Files not in `.edaignore` are included in the package.

## Key Files

| File | Purpose |
|---|---|
| `extension.json` | Extension manifest (name, UUID, entry, menus) |
| `src/index.ts` | Default extension entry point |
| `config/esbuild.common.ts` | esbuild configuration |
| `build/packaged.ts` | Packaging script (UUID fix + zip) |

## Node Version

Requires Node.js >=20.17.0

## Harness Engineering 文档

项目开发文档位于 `docs/` 目录：

| 文档 | 内容 |
|---|---|
| `docs/README.md` | 文档索引 |
| `docs/DOC-001-project-overview.md` | 项目概述 |
| `docs/DOC-002-functional-spec.md` | 功能规格说明书 |
| `docs/DOC-003-technical-spec.md` | 技术规格说明书 |
| `docs/DOC-004-development-guidelines.md` | 开发规范 |
| `docs/DOC-005-code-templates.md` | 代码模板 |
| `docs/DOC-006-test-plan.md` | 测试计划 |
| `docs/DOC-007-debug-guide.md` | 调试指南 |
| `docs/DOC-008-faq.md` | 常见问题FAQ |
