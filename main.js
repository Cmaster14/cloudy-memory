'use strict';

const electron = require('electron');
const path = require('node:path');
const config = require('./src/config');
const { createFileStorage } = require('./src/storage');
const { loadFrames } = require('./src/icons');
const { createTrayApp } = require('./src/app');

const { app, nativeImage } = electron;

if (!app.requestSingleInstanceLock()) {
  // A second copy would just fight the first one over the same state file.
  app.quit();
} else {
  // A tray app has no window; never quit just because none is open.
  app.on('window-all-closed', () => {});

  app.whenReady().then(() => {
    app.setAppUserModelId(config.appUserModelId);

    const trayApp = createTrayApp({
      electron,
      config,
      frames: loadFrames(path.join(__dirname, 'assets', 'frames'), nativeImage),
      storage: createFileStorage(path.join(app.getPath('userData'), 'state.json')),
      debug: !app.isPackaged || process.argv.includes('--debug'),
    });

    trayApp.start();
  });
}
