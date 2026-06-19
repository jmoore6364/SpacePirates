# Packaging — Pass 7 (optional, deferred)

The web build is the source of truth and runs anywhere. This note captures the
path to ship a desktop `.exe` (and Steam-readiness) without committing the heavy
toolchain into the repo yet.

## Why deferred
Electron + electron-builder pull hundreds of MB of binaries and produce large
installers. The game is fully playable as a web build, so packaging is kept as an
opt-in step rather than a default dependency.

## Plan (Electron wrapper)
1. `npm i -D electron electron-builder`.
2. Add an Electron main process that loads the built `dist/index.html`:
   ```js
   // electron/main.cjs
   const { app, BrowserWindow } = require('electron');
   const path = require('path');
   function createWindow() {
     const win = new BrowserWindow({
       width: 1280, height: 800, backgroundColor: '#05060d',
       webPreferences: { contextIsolation: true },
     });
     win.removeMenu();
     win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
   }
   app.whenReady().then(createWindow);
   app.on('window-all-closed', () => app.quit());
   ```
   The Vite build already uses `base: './'`, so `file://` loading works.
3. Scripts:
   ```jsonc
   "electron:dev": "npm run build && electron electron/main.cjs",
   "dist:win": "npm run build && electron-builder --win --x64"
   ```
4. `electron-builder` config (in package.json `build`): set `appId`, `productName`
   "Void Corsair", `files: ["dist/**", "electron/**"]`, NSIS target for an installer.

## Steam-readiness notes
- Ship the unpacked build or the NSIS installer.
- Add a settings screen for resolution/vsync if needed (bloom/sound already toggle).
- Replace `localStorage` saves with a file in `app.getPath('userData')` for a more
  conventional desktop save location.
- Controller support and key remapping would be the next polish step.
