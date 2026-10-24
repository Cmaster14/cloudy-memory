'use strict';

const path = require('node:path');

/**
 * The Custom Reminders window: one small window, reused if it is already open.
 * Electron arrives as an argument so nothing here needs a display to import.
 */
function createRemindersWindow({ BrowserWindow, iconPath }) {
  let win = null;

  function open() {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      return;
    }
    win = new BrowserWindow({
      width: 440,
      height: 620,
      minWidth: 380,
      minHeight: 460,
      title: 'Custom Reminders',
      icon: iconPath,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setMenu(null);
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      win = null;
    });
    win.loadFile(path.join(__dirname, 'ui', 'reminders.html'));
  }

  /** Tells an open window that the reminder list changed. */
  function refresh() {
    if (win && !win.isDestroyed()) win.webContents.send('reminders:changed');
  }

  return { open, refresh };
}

module.exports = { createRemindersWindow };
