import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('webTestFlow', {
	launch: () => ipcRenderer.invoke('browser:launch'),
	openUrl: (url: string) => ipcRenderer.invoke('browser:open-url', url) as Promise<string>,
	close: () => ipcRenderer.invoke('browser:close'),
	goBack: () => ipcRenderer.invoke('browser:go-back'),
	goForward: () => ipcRenderer.invoke('browser:go-forward'),
	reload: () => ipcRenderer.invoke('browser:reload'),
	click: (selector: string) => ipcRenderer.invoke('browser:click', selector),
	fill: (selector: string, value: string) => ipcRenderer.invoke('browser:fill', selector, value)
});
