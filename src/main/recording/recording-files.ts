import { dialog } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RecordingDocument, timestampedFilename } from '../../shared/types/recording';

function isRecordingDocument(value: unknown): value is RecordingDocument {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const document = value as Partial<RecordingDocument>;
	return document.version === 1 && typeof document.name === 'string' && typeof document.createdAt === 'string' && Array.isArray(document.actions);
}

export async function saveRecording(document: RecordingDocument): Promise<boolean> {
	const result = await dialog.showSaveDialog({
		title: 'Save WebTestFlow recording',
		defaultPath: path.join('recordings', timestampedFilename(document.name || 'webtestflow-recording', 'json')),
		filters: [{ name: 'WebTestFlow recording', extensions: ['json'] }]
	});

	if (result.canceled || !result.filePath) {
		return false;
	}

	await fs.mkdir(path.dirname(result.filePath), { recursive: true });
	await fs.writeFile(result.filePath, JSON.stringify(document, null, 2), 'utf8');
	return true;
}

export async function loadRecording(): Promise<RecordingDocument | null> {
	const result = await dialog.showOpenDialog({
		title: 'Load WebTestFlow recording',
		properties: ['openFile'],
		filters: [{ name: 'WebTestFlow recording', extensions: ['json'] }]
	});

	if (result.canceled || result.filePaths.length === 0) {
		return null;
	}

	const content = await fs.readFile(result.filePaths[0], 'utf8');
	const parsed: unknown = JSON.parse(content);
	if (!isRecordingDocument(parsed)) {
		throw new Error('The selected file is not a valid WebTestFlow recording.');
	}

	return parsed;
}