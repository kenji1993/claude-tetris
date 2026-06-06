# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vanilla JS Tetris. No build, no dependencies, no package.json. Three files: `index.html`, `style.css`, `game.js`.

## Running

Open `index.html` directly, or serve statically:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

No tests, no lint, no build step.

## Architecture (`game.js`)

Single-file game logic, ~300 lines, all module-level state in one `let` declaration (line 43): `board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`.

Key model facts:
- **Board**: `ROWS × COLS` matrix. Each cell is `0` (empty) or color index `1–7` identifying piece type.
- **Pieces** (`PIECES`): square matrices; cell value = same index used in `COLORS`. Rotation via transpose + row-reverse (`rotateCW`).
- **Collision** (`collide`): single source of truth for legality — bounds + overlap. All movement/rotation/drop gate through it.
- **Wall kicks** (`tryRotate`): on rotate collision, tries x offsets `[0,-1,1,-2,2]` before discarding rotation.
- **Game loop** (`loop`): `requestAnimationFrame`-driven; accumulates `dt` into `dropAccum`, drops one row when `dropAccum >= dropInterval`.
- **Levels/speed**: level up every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
- **Scoring**: `LINE_SCORES = [0,100,300,500,800] * level`; hard drop +2/cell, soft drop +1/row.
- **Ghost** (`ghostY`): projects landing position, drawn at `globalAlpha 0.2`.

Lifecycle: `init()` → `spawn()` (moves `next`→`current`, generates new `next`, checks immediate collision → `endGame()`) → loop. `lockPiece()` = merge + clearLines + spawn.

## Editing notes

- Geometry constants `COLS`, `ROWS`, `BLOCK` live at top of `game.js`. If changed, must also update `<canvas id="board">` width/height in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`).
- UI strings are Spanish (Game Over overlay, README). Keep consistent.
