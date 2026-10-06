export type RecordedAction =
	| { type: 'navigate'; url: string }
	| { type: 'click'; selector: string; playwright?: string; description?: string }
	| { type: 'fill'; selector: string; value: string; playwright?: string; description?: string }
	| { type: 'submit'; selector: string; playwright?: string; description?: string }
	| { type: 'check'; selector: string; playwright?: string; description?: string }
	| { type: 'uncheck'; selector: string; playwright?: string; description?: string }
	| { type: 'assert-url'; value: string }
	| { type: 'assert-text'; text: string }
	| { type: 'assert-element'; selector: string; playwright?: string; description?: string }
	| { type: 'assert-title'; title: string }
	| { type: 'assert-state'; selector: string; playwright?: string; description?: string; state: 'enabled' | 'disabled' | 'checked' | 'visible' };
export type RecordedAssertion = Extract<RecordedAction, { type: `assert-${string}` }>;

export interface RecordingDocument {
	version: 1;
	name: string;
	createdAt: string;
	startUrl?: string;
	actions: RecordedAction[];
}

export function recordingNameFromUrl(url: string | undefined): string {
	if (!url) {
		return 'webtestflow-recording';
	}

	try {
		const hostname = new URL(url).hostname.replace(/^www\./i, '');
		const siteName = hostname.split('.')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
		return siteName || 'webtestflow-recording';
	} catch {
		return 'webtestflow-recording';
	}
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