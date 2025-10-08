# Prime8s Arcade Fighter — Vercel-Ready (GLBs in repo)

Arcade fighter with **touch controls**, **per-character specials**, and a **super meter**. Models are served from the repo's `glb/` folder (same origin) to avoid CORS.

## 🚀 Deploy (Vercel)
1. Initialize & push to GitHub:
   ```bash
   git init
   git lfs install
   git lfs track "*.glb"
   git add .gitattributes glb/*.glb
   git add .
   git commit -m "Prime8s Arcade Fighter (full)"
   git branch -M main
   gh repo create prime8s-arcade-fighter-full --public --source=. --remote=origin
   git push -u origin main
   ```
2. On https://vercel.com → **Add New Project** → Import this repo → Deploy
   - Framework Preset: **Other**
   - Build Command: *(empty)*
   - Output Directory: `.`

## 🌐 GitHub Pages
- Settings → Pages → Source: `main` → Folder: `/ (root)`

## 🎮 Controls
- **P1:** A/D move, W jump, S block, **J** punch, **K** kick, **L** special, **;** super
- **P2 (human):** ←/→ move, ↑ jump, ↓ block, **1** punch, **2** kick, **3** special, **4** super
- Toggle **P2 is CPU** for single-player.

## 🧪 Local test
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## 🔧 Notes
- `characters.json` references `glb/<filename>.glb` (same origin).
- If a model fails, a placeholder appears and an error shows in the in-page console.
- For very large GLBs, consider mesh simplification or Draco-compressed versions.
