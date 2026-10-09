import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dialog } from 'electron';
import { chromium } from 'playwright';
import { SpecFileSelection, SpecTestProgress, SpecTestResult, SpecTestStep } from '../../shared/types/spec-test';
import { cleanupScreenshots } from '../recording/screenshot-cleanup';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
	return value && typeof value === 'object' ? value as JsonRecord : undefined;
}

function stripAnsi(value: string): string {
	return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function collectSteps(steps: unknown[], screenshots: string[] = []): SpecTestStep[] {
	return steps.flatMap((stepValue) => {
		const step = asRecord(stepValue);
		if (!step || typeof step.title !== 'string') return [];
		const children = collectSteps(Array.isArray(step.steps) ? step.steps : [], screenshots);
		const error = asRecord(step.error);
		const message = typeof error?.message === 'string' ? stripAnsi(error.message) : undefined;
		const location = asRecord(error?.location) ?? asRecord(step.location);
		const status = message || children.some((child) => child.status === 'failed') ? 'failed' : 'passed';
		const screenshotPath = status === 'failed' && screenshots.length > 0 ? screenshots[0] : undefined;
		return [{
			title: step.title,
			status,
			durationMs: typeof step.duration === 'number' ? step.duration : undefined,
			error: message,
			file: typeof location?.file === 'string' ? location.file : undefined,
			line: typeof location?.line === 'number' ? location.line : undefined,
			screenshotPath,
			children: children.length > 0 ? children : undefined
		}];
	});
}

function screenshotPathsFromResult(result: JsonRecord | undefined): string[] {
	if (!result || !Array.isArray(result.attachments)) return [];
	return result.attachments
		.map((attachment) => asRecord(attachment))
		.filter((attachment) => attachment?.contentType === 'image/png' && typeof attachment.path === 'string')
		.map((attachment) => attachment!.path as string);
}

function collectReport(suites: unknown[], parentTitles: string[] = []): { testName?: string; errors: string[]; failed: boolean; steps: SpecTestStep[] } {
	let testName: string | undefined;
	let failed = false;
	const errors: string[] = [];
	const steps: SpecTestStep[] = [];

	for (const suiteValue of suites) {
		const suite = asRecord(suiteValue);
		if (!suite) continue;
		const title = typeof suite.title === 'string' ? suite.title : '';
		const titles = title ? [...parentTitles, title] : parentTitles;

		if (Array.isArray(suite.specs)) {
			for (const specValue of suite.specs) {
				const spec = asRecord(specValue);
				if (!spec) continue;
				const specTitle = typeof spec.title === 'string' ? spec.title : '';
				testName ??= [...titles, specTitle].filter(Boolean).join(' > ') || undefined;
				if (spec.ok === false) failed = true;

				if (Array.isArray(spec.tests)) {
					for (const testValue of spec.tests) {
						const test = asRecord(testValue);
						if (test?.status === 'unexpected' || test?.status === 'failed') failed = true;
						if (Array.isArray(test?.results)) {
							for (const resultValue of test.results) {
								const result = asRecord(resultValue);
								if (result?.status === 'failed') failed = true;
										const screenshots = screenshotPathsFromResult(result);
										if (Array.isArray(result?.steps)) steps.push(...collectSteps(result.steps, screenshots));
								if (Array.isArray(result?.errors)) {
									for (const errorValue of result.errors) {
										const error = asRecord(errorValue);
										if (typeof error?.message === 'string') errors.push(error.message);
										else if (typeof error?.stack === 'string') errors.push(error.stack);
									}
								}
							}
						}
					}
				}
			}
		}

		if (Array.isArray(suite.suites)) {
			const nested = collectReport(suite.suites, titles);
			testName ??= nested.testName;
			failed ||= nested.failed;
			errors.push(...nested.errors);
			steps.push(...nested.steps);
		}
	}

	return { testName, errors, failed, steps };
}

export class SpecFileRunner {
	private selectedFilePath: string | undefined;
	private child: ChildProcessWithoutNullStreams | undefined;
	private stopRequested = false;

	constructor(private readonly projectRoot: string, private readonly screenshotsDir?: string) {}

	private async persistScreenshots(steps: SpecTestStep[]): Promise<void> {
		if (!this.screenshotsDir) return;
		const persistList = async (list: SpecTestStep[]): Promise<void> => {
			for (const step of list) {
				if (step.screenshotPath) {
					try {
						await fs.mkdir(this.screenshotsDir!, { recursive: true });
						const destination = path.join(this.screenshotsDir!, `spec-${Date.now()}-${path.basename(step.screenshotPath)}`);
						await fs.copyFile(step.screenshotPath, destination);
						step.screenshotPath = destination;
					} catch {
						step.screenshotPath = undefined;
					}
				}
				if (step.children?.length) await persistList(step.children);
			}
		};
		await persistList(steps);
	}

	public async load(): Promise<SpecFileSelection | null> {
		const selection = await dialog.showOpenDialog({
			title: 'Load Playwright TypeScript test',
			properties: ['openFile'],
			filters: [{ name: 'Playwright TypeScript tests', extensions: ['spec.ts'] }]
		});

		if (selection.canceled || selection.filePaths.length === 0) return null;

		const filePath = selection.filePaths[0];
		if (!path.basename(filePath).toLowerCase().endsWith('.spec.ts')) {
			throw new Error('Select a Playwright test file ending in .spec.ts.');
		}
		await fs.access(filePath);
		this.selectedFilePath = filePath;
		return { fileName: path.basename(filePath) };
	}

	public async run(onProgress: (progress: SpecTestProgress) => void = () => undefined): Promise<SpecTestResult> {
		if (!this.selectedFilePath) throw new Error('Load a Playwright .spec.ts file first.');
		if (this.child) throw new Error('A Playwright test file is already running.');

		const filePath = this.selectedFilePath;
		const fileName = path.basename(filePath);
		const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'webtestflow-playwright-'));
		const outputDirectory = path.join(tempDirectory, 'artifacts');
		const reportPath = path.join(tempDirectory, 'report.json');
		const configPath = path.join(tempDirectory, 'playwright.config.cjs');
		const reporterPath = path.join(tempDirectory, 'webtestflow-progress-reporter.cjs');
		const cliPath = require.resolve('@playwright/test/cli');
		const startedAt = Date.now();
		let stdout = '';
		let stderr = '';
		let outputBuffer = '';
		let testName: string | undefined;
		let currentStep: string | undefined;
		const liveSteps: SpecTestStep[] = [];
		const progressStepIndices = new Map<number, number>();
		const progressMarker = '__WEBTESTFLOW_PROGRESS__';
		this.stopRequested = false;
		const publishProgress = () => onProgress({
			status: 'running',
			fileName,
			testName,
			currentStep,
			durationMs: Date.now() - startedAt,
			steps: liveSteps.map((step) => ({ ...step }))
		});

		const consumeOutput = (chunk: Buffer, flush = false) => {
			outputBuffer += chunk.toString();
			const lines = outputBuffer.split(/\r?\n/);
			outputBuffer = flush ? '' : lines.pop() ?? '';
			for (const line of lines) {
				if (line.startsWith(progressMarker)) {
					try {
						const event = asRecord(JSON.parse(line.slice(progressMarker.length)));
						if (!event) continue;
						if (event.type === 'test' && typeof event.title === 'string') {
							testName = event.title;
						} else if (event.type === 'step-begin' && typeof event.id === 'number' && typeof event.title === 'string') {
							currentStep = event.title;
							progressStepIndices.set(event.id, liveSteps.length);
							liveSteps.push({
								title: event.title,
								status: 'running',
								file: typeof asRecord(event.location)?.file === 'string' ? asRecord(event.location)!.file as string : undefined,
								line: typeof asRecord(event.location)?.line === 'number' ? asRecord(event.location)!.line as number : undefined
							});
						} else if (event.type === 'step-end' && typeof event.id === 'number') {
							const index = progressStepIndices.get(event.id);
						if (index !== undefined && liveSteps[index]) {
							liveSteps[index] = {
								...liveSteps[index],
								status: event.status === 'failed' ? 'failed' : 'passed',
								durationMs: typeof event.duration === 'number' ? event.duration : undefined,
								error: typeof event.error === 'string' ? stripAnsi(event.error) : undefined,
								file: typeof asRecord(event.location)?.file === 'string' ? asRecord(event.location)!.file as string : liveSteps[index].file,
								line: typeof asRecord(event.location)?.line === 'number' ? asRecord(event.location)!.line as number : liveSteps[index].line
							};
						}
						currentStep = [...liveSteps].reverse().find((step) => step.status === 'running')?.title;
					}
					publishProgress();
					} catch {
					stdout = `${stdout}${line}\n`.slice(-200_000);
				}
				} else {
					stdout = `${stdout}${line}\n`.slice(-200_000);
				}
			}
		};
		publishProgress();

		try {
			await fs.mkdir(outputDirectory, { recursive: true });
			const reporterSource = `const marker = ${JSON.stringify(progressMarker)};\nclass WebTestFlowProgressReporter {\n  constructor() { this.ids = new WeakMap(); this.nextId = 0; }\n  send(event) { process.stdout.write(marker + JSON.stringify(event) + "\\n"); }\n  onTestBegin(test) { this.send({ type: "test", title: test.title }); }\n  shouldReport(step) {\n    if (step.category === "test.step") return true;\n    if (step.category !== "pw:api" && step.category !== "expect") return false;\n    for (let parent = step.parent; parent; parent = parent.parent) if (parent.category === "test.step") return false;\n    return true;\n  }\n  onStepBegin(test, result, step) { if (this.shouldReport(step)) { const id = ++this.nextId; this.ids.set(step, id); this.send({ type: "step-begin", id, title: step.title, location: step.location }); } }\n  onStepEnd(test, result, step) { const id = this.ids.get(step); if (id !== undefined) this.send({ type: "step-end", id, status: step.error ? "failed" : "passed", duration: step.duration, error: step.error?.message, location: step.error?.location || step.location }); }\n}\nmodule.exports = WebTestFlowProgressReporter;\n`;
			await fs.writeFile(reporterPath, reporterSource, 'utf8');
			await fs.writeFile(configPath, `module.exports = { testDir: ${JSON.stringify(path.dirname(filePath))}, testMatch: [${JSON.stringify(path.basename(filePath))}], reporter: [['json'], [${JSON.stringify(reporterPath)}]], use: { screenshot: 'only-on-failure', launchOptions: { executablePath: ${JSON.stringify(chromium.executablePath())} } } };`, 'utf8');
			const child = spawn(process.execPath, [cliPath, 'test', '--config', configPath, '--workers=1', '--output', outputDirectory], {
				cwd: this.projectRoot,
				windowsHide: true,
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: '1',
					NODE_PATH: [path.join(this.projectRoot, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
					PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
					FORCE_COLOR: '0'
				}
			});
			this.child = child;

			child.stdout.on('data', (chunk: Buffer) => {
				consumeOutput(chunk);
			});
			child.stderr.on('data', (chunk: Buffer) => {
				stderr = (stderr + chunk.toString()).slice(-200_000);
			});

			const exitCode = await new Promise<number | null>((resolve, reject) => {
				child.once('error', reject);
				child.once('close', (code) => resolve(code));
			});
			consumeOutput(Buffer.from(outputBuffer), true);
			this.child = undefined;

			if (this.stopRequested) {
				return { status: 'stopped', fileName, durationMs: Date.now() - startedAt, steps: liveSteps };
			}

			let report: JsonRecord | undefined;
			try {
				report = asRecord(JSON.parse(await fs.readFile(reportPath, 'utf8')));
			} catch {
				// If the runner failed before producing its report, preserve the CLI output below.
			}

			const stats = asRecord(report?.stats);
			const collected = collectReport(Array.isArray(report?.suites) ? report.suites : []);
			const reporterErrors = Array.isArray(report?.errors)
				? report.errors.map((entry) => asRecord(entry)?.message).filter((message): message is string => typeof message === 'string')
				: [];
			const errors = [...collected.errors, ...reporterErrors];
			const failed = exitCode !== 0 || collected.failed || errors.length > 0;
			const details = stripAnsi(errors.join('\n\n') || (failed ? (stderr || stdout).trim() : '')) || undefined;
			const testName = collected.testName?.startsWith(`${fileName} > `)
				? collected.testName.slice(fileName.length + 3)
				: collected.testName;

			await this.persistScreenshots(collected.steps);
			// Cleanup finishes before the temporary Playwright output directory is removed.
			await cleanupScreenshots(this.screenshotsDir);

			return {
				status: failed ? 'failed' : 'passed',
				fileName,
				testName,
				durationMs: typeof stats?.duration === 'number' ? stats.duration : Date.now() - startedAt,
				steps: collected.steps,
				error: details,
				output: !report ? `${stdout}${stderr ? `\n${stderr}` : ''}`.trim() : undefined
			};
		} finally {
			this.child = undefined;
			this.stopRequested = false;
			await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	public stop(): boolean {
		if (!this.child) return false;
		this.stopRequested = true;
		this.child.kill();
		return true;
	}
}