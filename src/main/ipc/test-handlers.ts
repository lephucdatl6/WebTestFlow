import { BrowserWindow, ipcMain } from 'electron';
import { RecordedAction } from '../../shared/types/recording';
import { TestRunner } from '../tests/test-runner';

export function registerTestHandlers(testRunner: TestRunner, getWindow: () => BrowserWindow | null): void {
	ipcMain.handle('test:run', (_event, startUrl: string | undefined, actions: RecordedAction[]) => (
		testRunner.run(startUrl, actions, (progress) => {
			const window = getWindow();
			if (window && !window.isDestroyed()) {
				window.webContents.send('test:progress', progress);
			}
		})
	));
	ipcMain.handle('test:stop', () => testRunner.stop());
}