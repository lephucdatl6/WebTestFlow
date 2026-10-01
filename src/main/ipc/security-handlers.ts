import { ipcMain } from 'electron';
import { analyzeSecurityHeaders } from '../security/security-header-analyzer';

export function registerSecurityHandlers(): void {
	ipcMain.handle('security:analyze-headers', (_event, url: string) => analyzeSecurityHeaders(url));
}