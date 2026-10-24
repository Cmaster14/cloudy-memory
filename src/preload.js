'use strict';

// The only bridge between the reminders page and the app. The page gets three
// narrow calls and one event, never ipcRenderer itself.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudy', {
  list: () => ipcRenderer.invoke('reminders:list'),
  add: (request) => ipcRenderer.invoke('reminders:add', request),
  cancel: (id) => ipcRenderer.invoke('reminders:cancel', id),
  onChanged: (callback) => {
    ipcRenderer.on('reminders:changed', () => callback());
  },
});
