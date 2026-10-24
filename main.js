'use strict';

const electron = require('electron');
const path = require('node:path');
const config = require('./src/config');
const { createFileStorage } = require('./src/storage');
const { loadFrames } = require('./src/icons');
const { createTrayApp } = require('./src/app');
const { createRemindersWindow } = require('./src/windows');
const { registerReminderIpc } = require('./src/ipc');

const { app, nativeImage, BrowserWindow, ipcMain } = electron;

if (!app.requestSingleInstanceLock()) {
  // A second copy would just fight the first one over the same state file.
  app.quit();
} else {
  // A tray app has no main window; never quit just because none is open
  // (this also covers closing the Custom Reminders window).
  app.on('window-all-closed', () => {});

  app.whenReady().then(() => {
    app.setAppUserModelId(config.appUserModelId);

    const remindersWindow = createRemindersWindow({
      BrowserWindow,
      iconPath: path.join(__dirname, 'assets', 'icon.png'),
    });

    const trayApp = createTrayApp({
      electron,
      config,
      frames: loadFrames(path.join(__dirname, 'assets', 'frames'), nativeImage, { all: true }),
      storage: createFileStorage(path.join(app.getPath('userData'), 'state.json')),
      remindersStorage: createFileStorage(path.join(app.getPath('userData'), 'reminders.json')),
      openRemindersWindow: remindersWindow.open,
      onRemindersChanged: remindersWindow.refresh,
      debug: !app.isPackaged || process.argv.includes('--debug'),
    });

    registerReminderIpc({ ipcMain, trayApp });
    trayApp.start();
  });
}
