import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { BrowserManager } from './browser/browser-manager';
import { registerBrowserHandlers } from './ipc/browser-handlers';
import { registerRecordingHandlers } from './ipc/recording-handlers';

let mainWindow: BrowserWindow | null = null;
let browserManager: BrowserManager | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  browserManager = new BrowserManager();
  registerBrowserHandlers(browserManager);
  registerRecordingHandlers();

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    browserManager?.dispose();
    browserManager = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  process.env.VITE_DEV_SERVER_URL ??= 'http://localhost:5173';
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
