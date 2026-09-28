import { contextBridge, ipcRenderer } from 'electron';
import type { RecordingDocument } from '../shared/types/recording';

contextBridge.exposeInMainWorld('webTestFlow', {
	launch: () => ipcRenderer.invoke('browser:launch'),
	openUrl: (url: string) => ipcRenderer.invoke('browser:open-url', url) as Promise<string>,
	startRecording: () => ipcRenderer.invoke('browser:start-recording') as Promise<string | undefined>,
	stopRecording: () => ipcRenderer.invoke('browser:stop-recording') as Promise<Array<{ type: string; selector?: string; playwright?: string; value?: string; url?: string; description?: string }>>,
	getRecordingActions: () => ipcRenderer.invoke('browser:get-recording-actions') as Promise<Array<{ type: string; selector?: string; playwright?: string; value?: string; url?: string; description?: string }>>,
	isBrowserOpen: () => ipcRenderer.invoke('browser:is-open') as Promise<boolean>,
	close: () => ipcRenderer.invoke('browser:close'),
	goBack: () => ipcRenderer.invoke('browser:go-back'),
	goForward: () => ipcRenderer.invoke('browser:go-forward'),
	reload: () => ipcRenderer.invoke('browser:reload'),
	click: (selector: string) => ipcRenderer.invoke('browser:click', selector),
	fill: (selector: string, value: string) => ipcRenderer.invoke('browser:fill', selector, value),
	saveRecording: (document: RecordingDocument) => ipcRenderer.invoke('recording:save', document) as Promise<boolean>,
	loadRecording: () => ipcRenderer.invoke('recording:load') as Promise<RecordingDocument | null>,
	generatePlaywrightTest: (name: string, startUrl: string | undefined, actions: RecordingDocument['actions']) => ipcRenderer.invoke('recording:generate-playwright', name, startUrl, actions) as Promise<string>
});
