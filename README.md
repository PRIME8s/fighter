# Prime8s Arcade Fighter (Prototype)

A lightweight 2.5D arcade fighter built with Three.js that loads your remote GLB characters from IPFS/Pinata.

## Features
- Character select for P1 and P2 from your provided GLB list (editable in `characters.json`)
- 2.5D side-view stage with basic lighting
- Movement, jump, block, punch, kick with simple hit detection and knockback
- CPU toggle for P2 (rudimentary AI)
- Health bars, round timer, win screen
- Fully client-side; no server required

## Controls
- **Player 1:** A/D move, W jump, S block, J punch, K kick
- **Player 2 (Human):** ←/→ move, ↑ jump, ↓ block, 1 punch, 2 kick
- **CPU:** Check the "P2 is CPU" checkbox to make P2 controlled by AI

## How to run
Open `index.html` in a local server (recommended) because some browsers restrict module imports/file fetches via `file://`.
- Python: `python3 -m http.server 8000` then visit http://localhost:8000
- Node: `npx http-server`

If your GLB endpoints have CORS disabled, you may need to enable it on the hosting side. This prototype sets `crossOrigin` to 'anonymous'.

## Customize
- Add/remove GLB URLs in `characters.json`.
- Adjust attack ranges/damage in `main.js` (see `doPunch`,`doKick` and `handleHits`).
- Swap the stage materials/colors in `main.js` (floor/wall).
