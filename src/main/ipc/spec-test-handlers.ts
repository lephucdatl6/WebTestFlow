import { ipcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { SpecTestProgress } from '../../shared/types/spec-test';
import { SpecFileRunner } from '../tests/spec-file-runner';

export function registerSpecTestHandlers(specFileRunner: SpecFileRunner, getWindow: () => BrowserWindow | null): void {
	ipcMain.handle('spec-test:load', () => specFileRunner.load());
	ipcMain.handle('spec-test:run', () => specFileRunner.run((progress: SpecTestProgress) => {
		const window = getWindow();
		if (window && !window.isDestroyed()) {
			window.webContents.send('spec-test:progress', progress);
		}
	}));
	ipcMain.handle('spec-test:stop', () => specFileRunner.stop());
}