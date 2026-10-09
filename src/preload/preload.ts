import { contextBridge, ipcRenderer } from 'electron';
import type { RecordedAssertion, RecordingDocument } from '../shared/types/recording';
import type { TestRunProgress, TestRunResult } from '../shared/types/test-run';
import type { SpecFileSelection, SpecTestProgress, SpecTestResult } from '../shared/types/spec-test';
import type { SecurityAnalysisResult } from '../shared/types/security';

contextBridge.exposeInMainWorld('webTestFlow', {
	launch: () => ipcRenderer.invoke('browser:launch'),
	openUrl: (url: string) => ipcRenderer.invoke('browser:open-url', url) as Promise<string>,
	startRecording: (existingActions?: RecordingDocument['actions']) => ipcRenderer.invoke('browser:start-recording', existingActions) as Promise<string | undefined>,
	stopRecording: () => ipcRenderer.invoke('browser:stop-recording') as Promise<RecordingDocument['actions']>,
	getRecordingActions: () => ipcRenderer.invoke('browser:get-recording-actions') as Promise<RecordingDocument['actions']>,
	addRecordingAssertion: (assertion: RecordedAssertion) => ipcRenderer.invoke('browser:add-recording-assertion', assertion) as Promise<void>,
	isBrowserOpen: () => ipcRenderer.invoke('browser:is-open') as Promise<boolean>,
	close: () => ipcRenderer.invoke('browser:close'),
	goBack: () => ipcRenderer.invoke('browser:go-back'),
	goForward: () => ipcRenderer.invoke('browser:go-forward'),
	reload: () => ipcRenderer.invoke('browser:reload'),
	click: (selector: string) => ipcRenderer.invoke('browser:click', selector),
	fill: (selector: string, value: string) => ipcRenderer.invoke('browser:fill', selector, value),
	debugAction: (action: RecordingDocument['actions'][number], startUrl?: string) =>
		ipcRenderer.invoke('browser:debug-action', action, startUrl) as Promise<void>,
	openScreenshot: (filePath: string) => ipcRenderer.invoke('screenshot:open', filePath) as Promise<string>,
	saveRecording: (document: RecordingDocument) => ipcRenderer.invoke('recording:save', document) as Promise<boolean>,
	loadRecording: () => ipcRenderer.invoke('recording:load') as Promise<RecordingDocument | null>,
	generatePlaywrightTest: (name: string, startUrl: string | undefined, actions: RecordingDocument['actions']) => ipcRenderer.invoke('recording:generate-playwright', name, startUrl, actions) as Promise<string>,
	runTest: (startUrl: string | undefined, actions: RecordingDocument['actions']) => ipcRenderer.invoke('test:run', startUrl, actions) as Promise<TestRunResult>,
	stopTest: () => ipcRenderer.invoke('test:stop') as Promise<boolean>,
	onTestProgress: (callback: (progress: TestRunProgress) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, progress: TestRunProgress) => callback(progress);
		ipcRenderer.on('test:progress', listener);
		return () => ipcRenderer.removeListener('test:progress', listener);
	},
	loadSpecTest: () => ipcRenderer.invoke('spec-test:load') as Promise<SpecFileSelection | null>,
	runSpecTest: () => ipcRenderer.invoke('spec-test:run') as Promise<SpecTestResult>,
	stopSpecTest: () => ipcRenderer.invoke('spec-test:stop') as Promise<boolean>,
	onSpecTestProgress: (callback: (progress: SpecTestProgress) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, progress: SpecTestProgress) => callback(progress);
		ipcRenderer.on('spec-test:progress', listener);
		return () => ipcRenderer.removeListener('spec-test:progress', listener);
	},
	analyzeSecurityHeaders: (url: string) => ipcRenderer.invoke('security:analyze-headers', url) as Promise<SecurityAnalysisResult>
});
