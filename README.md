# Zombie Survivors — 3D survivors-like roguelite (English clone)

A pure front-end 3D survivors-like roguelite. You auto-fire at the nearest zombie,
walk to dodge, pick up XP to level up, stack weapons, and defeat the bosses in order
to clear the game. Works on **desktop (keyboard + mouse)** and **mobile (touch joystick + jump button)**.

This is an **English translation/clone** of the original `craig7351/zombie-survivors`
(Vue 3 + Babylon.js). All in-game text — character/boss/weapon names, upgrade
descriptions, UI labels and comments — has been translated to English. The 3D art is the
free **CC0 Quaternius "Zombie Apocalypse Kit"** (bundled under `public/models/zombie/`).

## Controls
- **Desktop:** WASD / arrow keys to move, Space to jump. Weapons fire automatically.
- **Mobile:** bottom-left virtual joystick to move, jump button to jump.
- Drag / scroll (or pinch) to rotate / zoom the camera.

## Gameplay
- Auto-combat: your character fires at the nearest zombie; you focus on movement and upgrade picks.
- Weapons stack: bullets, orbiting axes, damage aura, chain lightning, nova blast, boomerang.
- 8 characters, each with a different starting attack.
- Bosses appear in order; defeat the final boss to clear the game.
- 5 difficulties (Easy -> Hell) scaling enemy HP, speed, contact damage and rewards.

## Run locally
Requires Node.js 18+.
```bash
npm install
npm run dev        # start a dev server (prints a local URL, open it in a browser)
```

## Production build
```bash
npm run build      # type-checks (vue-tsc) then builds to ./dist
npm run preview    # serve the built ./dist locally to test
```

## Deploy
The build output in `./dist` is a static site — host it on any static host
(GitHub Pages, Cloudflare Pages, Netlify, Vercel, S3, etc.).
A ready-to-deploy `./dist` is already included in this archive.

> Note: the game loads `.gltf` models over HTTP and uses ES module scripts, so it must be
> served by a web server (it will not run by double-clicking `index.html` from `file://`).
> Use `npm run preview` or any static file server.

## Project layout
```
src/game/        game logic: enemy system, weapons, bosses, upgrades, terrain, sound, input...
src/components/  Vue UI: menus, HUD, joystick, modals, leaderboard, bestiary...
public/models/   3D models (Quaternius Zombie Apocalypse Kit, CC0) + animal models
dist/            pre-built static site (ready to deploy)
```

## Credits
- Original game: `craig7351/zombie-survivors` (Vue 3 + Babylon.js).
- 3D models: Quaternius — Zombie Apocalypse Kit (CC0, public domain).
- Engine: Babylon.js. Framework: Vue 3 + Vite + TypeScript + Tailwind.
