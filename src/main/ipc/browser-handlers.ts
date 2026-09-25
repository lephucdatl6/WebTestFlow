import { ipcMain } from 'electron';
import { BrowserManager } from '../browser/browser-manager';

export function registerBrowserHandlers(browserManager: BrowserManager): void {
	ipcMain.handle('browser:open-url', async (_event, url: string) => {
		return browserManager.openUrl(url);
	});

	ipcMain.handle('browser:launch', () => browserManager.launch());
	ipcMain.handle('browser:start-recording', () => browserManager.startRecording());
	ipcMain.handle('browser:stop-recording', () => browserManager.stopRecording());
	ipcMain.handle('browser:get-recording-actions', () => browserManager.getRecordedActions());
	ipcMain.handle('browser:is-open', () => browserManager.isBrowserOpen());
	ipcMain.handle('browser:close', () => browserManager.close());
	ipcMain.handle('browser:go-back', () => browserManager.goBack());
	ipcMain.handle('browser:go-forward', () => browserManager.goForward());
	ipcMain.handle('browser:reload', () => browserManager.reload());
	ipcMain.handle('browser:click', (_event, selector: string) => browserManager.click(selector));
	ipcMain.handle('browser:fill', (_event, selector: string, value: string) => browserManager.fill(selector, value));
}
