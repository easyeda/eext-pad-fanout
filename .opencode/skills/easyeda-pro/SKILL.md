---
name: easyeda-pro
description: >-
  EasyEDA Pro (嘉立创EDA) API skill. Use for PCB design, schematic editing, footprint/symbol
  management, project operations, and extension development. Provides 120+ classes API reference,
  WebSocket bridge for live debugging, and code patterns for PCB, schematic, library operations.
  Trigger: "嘉立创EDA", "EasyEDA", "PCB", "schematic", "EDA", "原理图", "PCB设计".
  **IMPORTANT**: 嘉立创EDA = EasyEDA (same product). Use "EasyEDA" for English, "嘉立创EDA" for Chinese.
license: MIT
compatibility: opencode
metadata:
  author: JLCEDA
  version: "1.0.3"
---

# EasyEDA Pro API Skill

> **Product Naming**: 嘉立创EDA = **EasyEDA** (same product). Use "EasyEDA" for English, "嘉立创EDA" for Chinese.

## Quick Reference

| Domain | API Prefix | Unit |
|--------|------------|------|
| PCB | `eda.pcb_*` | 1mil |
| Schematic | `eda.sch_*` | 0.01inch (10mil) |
| Document | `eda.dmt_*` | varies |
| Library | `eda.lib_*` | varies |

## Critical Rules

1. **Coordinate units differ by domain**:
   - PCB: 1 unit = 1mil
   - Schematic: 1 unit = 0.01inch (10mil)
   - Mixing them causes 10x position errors

2. **Async primitive pattern** for modifying:
   ```javascript
   const prim = await eda.pcb_PrimitiveVia.get([id]);
   const asyncPrim = prim.toAsync();
   asyncPrim.setState_X(newX);
   asyncPrim.done();
   ```

3. **Return values, don't log**: Use `return`, not `console.log`

4. **Verify document state first**:
   ```javascript
   await eda.dmt_Project.getCurrentProjectInfo();
   await eda.dmt_SelectControl.getCurrentDocumentInfo();
   ```

## API Modules

| Prefix | Classes |
|--------|---------|
| `DMT_*` | Board, EditorControl, Folder, Panel, Pcb, Project, Schematic, SelectControl, Team, Workspace |
| `PCB_*` | Document, Drc, Layer, Net, Primitive*, SelectControl |
| `SCH_*` | Document, Drc, Primitive*, SelectControl |
| `LIB_*` | Device, Footprint, LibrariesList, Symbol, 3DModel |
| `SYS_*` | Dialog, FileSystem, I18n, Log, Message, MessageBus, Storage |

## Common Patterns

### Create PCB line:
```javascript
await eda.pcb_PrimitiveLine.create(
	'GND',
	1,
	0,
	0,
	1000,
	0,
	10,
	false
);
// net, layer(1=top copper), x1, y1, x2, y2, width, lock
```

### Create schematic component:
```javascript
await eda.sch_PrimitiveComponent.create(
	'device-uuid',
	5000,
	5000,
	'',
	0,
	false,
	true,
	true
);
// uuid, x, y, subPart, rotation, mirror, addBom, addPcb
```

## Documentation

- `references/_index.md` — API master index
- `references/_quick-reference.md` — Method signatures
- `references/classes/` — 120 class docs
- `references/enums/` — 62 enums
- `format/pcb/pad_via.md` — PCB pad/via format
- `format/schematic/component.md` — Schematic component format
