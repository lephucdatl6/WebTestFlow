import { ipcMain } from 'electron';
import { generatePlaywrightTest } from '../recording/playwright-export';
import { loadRecording, saveRecording } from '../recording/recording-files';
import { RecordingDocument } from '../../shared/types/recording';

export function registerRecordingHandlers(): void {
	ipcMain.handle('recording:save', (_event, document: RecordingDocument) => saveRecording(document));
	ipcMain.handle('recording:load', () => loadRecording());
	ipcMain.handle('recording:generate-playwright', (_event, name: string, startUrl: string | undefined, actions: RecordingDocument['actions']) => (
		generatePlaywrightTest(name, startUrl, actions)
	));
}