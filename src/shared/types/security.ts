export type SecurityHeaderStatus = 'present' | 'missing' | 'review';

export type SecurityResponseContext = 'normal' | 'redirect' | 'client-error' | 'server-error' | 'possible-challenge';

export interface SecurityHeaderResult {
	name: string;
	status: SecurityHeaderStatus;
	value?: string;
	explanation: string;
}

export interface SecurityAnalysisResult {
	finalUrl: string;
	redirects: Array<{ statusCode: number; from: string; to: string }>;
	statusCode: number;
	statusText: string;
	responseContext: SecurityResponseContext;
	responseMessage: string;
	responseWarning?: string;
	analyzedAt: string;
	headers: SecurityHeaderResult[];
}