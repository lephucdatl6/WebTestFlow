import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('webTestFlow', {
	launch: () => ipcRenderer.invoke('browser:launch'),
	openUrl: (url: string) => ipcRenderer.invoke('browser:open-url', url) as Promise<string>,
	startRecording: () => ipcRenderer.invoke('browser:start-recording'),
	stopRecording: () => ipcRenderer.invoke('browser:stop-recording') as Promise<Array<{ type: string; selector?: string; playwright?: string; value?: string; url?: string; description?: string }>>,
	getRecordingActions: () => ipcRenderer.invoke('browser:get-recording-actions') as Promise<Array<{ type: string; selector?: string; playwright?: string; value?: string; url?: string; description?: string }>>,
	isBrowserOpen: () => ipcRenderer.invoke('browser:is-open') as Promise<boolean>,
	close: () => ipcRenderer.invoke('browser:close'),
	goBack: () => ipcRenderer.invoke('browser:go-back'),
	goForward: () => ipcRenderer.invoke('browser:go-forward'),
	reload: () => ipcRenderer.invoke('browser:reload'),
	click: (selector: string) => ipcRenderer.invoke('browser:click', selector),
	fill: (selector: string, value: string) => ipcRenderer.invoke('browser:fill', selector, value)
});
