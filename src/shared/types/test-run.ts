import type { SpecTestStep } from './spec-test';

export type TestRunStatus = 'running' | 'passed' | 'failed' | 'stopped';

export interface TestRunProgress {
	status: TestRunStatus;
	currentStep: number;
	totalSteps: number;
	currentAction?: string;
	error?: string;
	durationMs?: number;
	steps: SpecTestStep[];
}

export type TestRunResult = Omit<TestRunProgress, 'currentAction'>;