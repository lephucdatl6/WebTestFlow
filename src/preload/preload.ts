import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('webTestFlow', {
	openUrl: (url: string) => ipcRenderer.invoke('browser:open-url', url) as Promise<string>,
	goBack: () => ipcRenderer.invoke('browser:go-back'),
	goForward: () => ipcRenderer.invoke('browser:go-forward'),
	reload: () => ipcRenderer.invoke('browser:reload')
});
