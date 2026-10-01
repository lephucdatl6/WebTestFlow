export interface SpecFileSelection {
	fileName: string;
}

export interface SpecTestStep {
	title: string;
	status: 'running' | 'passed' | 'failed' | 'skipped';
	detail?: string;
	durationMs?: number;
	error?: string;
	file?: string;
	line?: number;
	children?: SpecTestStep[];
}

export interface SpecTestResult {
	status: 'passed' | 'failed' | 'stopped';
	fileName: string;
	testName?: string;
	durationMs: number;
	steps: SpecTestStep[];
	error?: string;
	output?: string;
}

export interface SpecTestProgress {
	status: 'running' | 'passed' | 'failed' | 'stopped';
	fileName: string;
	testName?: string;
	currentStep?: string;
	durationMs: number;
	steps: SpecTestStep[];
}