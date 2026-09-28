export type RecordedAction =
	| { type: 'navigate'; url: string }
	| { type: 'click'; selector: string; playwright?: string; description?: string }
	| { type: 'fill'; selector: string; value: string; playwright?: string; description?: string }
	| { type: 'submit'; selector: string; playwright?: string; description?: string };

export interface RecordingDocument {
	version: 1;
	name: string;
	createdAt: string;
	startUrl?: string;
	actions: RecordedAction[];
}

export function timestampedFilename(baseName: string, extension: string, date = new Date()): string {
	const pad = (value: number, length = 2) => value.toString().padStart(length, '0');
	const timestamp = [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate())
	].join('-') + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;

	return `${baseName}-${timestamp}.${extension}`;
}