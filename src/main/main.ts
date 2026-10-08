import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { BrowserManager } from './browser/browser-manager';
import { registerBrowserHandlers } from './ipc/browser-handlers';
import { registerRecordingHandlers } from './ipc/recording-handlers';
import { registerTestHandlers } from './ipc/test-handlers';
import { TestRunner } from './tests/test-runner';
import { SpecFileRunner } from './tests/spec-file-runner';
import { registerSpecTestHandlers } from './ipc/spec-test-handlers';
import { registerSecurityHandlers } from './ipc/security-handlers';

let mainWindow: BrowserWindow | null = null;
let browserManager: BrowserManager | null = null;
const testRunner = new TestRunner();
const specFileRunner = new SpecFileRunner(app.getAppPath());

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
  registerTestHandlers(testRunner, () => mainWindow);
  registerSpecTestHandlers(specFileRunner, () => mainWindow);
  registerSecurityHandlers();

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    browserManager?.dispose();
    void testRunner.stop();
    specFileRunner.stop();
    browserManager = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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
