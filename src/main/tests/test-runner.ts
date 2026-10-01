import { Browser, chromium, Locator, Page } from 'playwright';
import { RecordedAction } from '../../shared/types/recording';
import { SpecTestStep } from '../../shared/types/spec-test';
import { TestRunProgress, TestRunResult } from '../../shared/types/test-run';

function locatorFor(page: Page, action: Extract<RecordedAction, { selector: string }>): Locator {
	const expression = action.playwright;
	const cssMatch = expression?.match(/^locator\(("(?:\\.|[^"\\])*")\)$/);
	if (cssMatch) {
		return page.locator(JSON.parse(cssMatch[1]) as string);
	}

	const roleMatch = expression?.match(/^getByRole\((['"])(.*?)\1,\s*\{\s*name:\s*("(?:\\.|[^"\\])*"),?\s*(?:exact:\s*(true|false))?\s*\}\)$/);
	if (roleMatch) {
		return page.getByRole(roleMatch[2] as Parameters<Page['getByRole']>[0], {
			name: JSON.parse(roleMatch[3]) as string,
			exact: roleMatch[4] === 'true'
		});
	}

	const labelMatch = expression?.match(/^getBy(Placeholder|Label)\(("(?:\\.|[^"\\])*")(?:,\s*\{\s*exact:\s*(true|false)\s*\})?\)$/);
	if (labelMatch) {
		const accessibleName = JSON.parse(labelMatch[2]) as string;
		const options = { exact: labelMatch[3] === 'true' };
		return labelMatch[1] === 'Placeholder'
			? page.getByPlaceholder(accessibleName, options)
			: page.getByLabel(accessibleName, options);
	}

	return page.locator(action.selector);
}

async function uniqueLocatorFor(page: Page, action: Extract<RecordedAction, { selector: string }>): Promise<Locator> {
	const semanticLocator = locatorFor(page, action);
	if (await semanticLocator.count() === 1) {
		return semanticLocator;
	}

	const cssLocator = page.locator(action.selector);
	if (await cssLocator.count() === 1) {
		return cssLocator;
	}

	return semanticLocator;
}

async function clickLocatorFor(page: Page, action: Extract<RecordedAction, { type: 'click' }>): Promise<Locator> {
	const semanticLocator = locatorFor(page, action);
	const semanticCount = await semanticLocator.count();
	if (semanticCount === 1 && await semanticLocator.isVisible()) {
		return semanticLocator;
	}

	const cssLocator = page.locator(action.selector);
	if (await cssLocator.count() === 1) {
		return cssLocator;
	}

	return semanticLocator;
}

function actionLabel(action: RecordedAction): string {
	const locator = 'playwright' in action ? action.playwright : undefined;
	const roleName = locator?.match(/^getByRole\((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'),\s*\{\s*name:\s*("(?:\\.|[^"\\])*")/);
	const semanticName = roleName?.[1]
		?? locator?.match(/^getBy(?:Label|Placeholder)\(("(?:\\.|[^"\\])*")/)?.[1];
	const semanticDescription = semanticName ? JSON.parse(semanticName) as string : undefined;
	const target = ('description' in action ? action.description : undefined)
		?? semanticDescription
		?? ('selector' in action ? action.selector : '');

	switch (action.type) {
		case 'navigate': return `Navigate to ${action.url}`;
		case 'click': return `Click ${target}`;
		case 'fill': return `Fill ${target}`;
		case 'submit': return `Press Enter on ${target}`;
	}
}

function actionStep(action: RecordedAction, index: number): SpecTestStep {
	const title = actionLabel(action);
	const detail = action.type === 'fill' ? `Value: ${action.value.slice(0, 80)}${action.value.length > 80 ? '…' : ''}` : undefined;
	return {
		title,
		status: 'running',
		detail
	};
}

export class TestRunner {
	private browser: Browser | null = null;
	private active = false;
	private stopRequested = false;

	public async run(
		startUrl: string | undefined,
		actions: RecordedAction[],
		onProgress: (progress: TestRunProgress) => void
	): Promise<TestRunResult> {
		if (this.active) {
			throw new Error('A test is already running.');
		}
		if (!startUrl && actions.length === 0) {
			throw new Error('This recording has no starting URL or actions to run.');
		}

		this.active = true;
		this.stopRequested = false;
		const startedAt = Date.now();
		const totalSteps = actions.length + (startUrl ? 1 : 0);
		let currentStep = 0;
		let currentAction: string | undefined;
		let page: Page | undefined;
		const steps: SpecTestStep[] = [];

		const emit = (status: TestRunProgress['status'], error?: string) => onProgress({
			status,
			currentStep,
			totalSteps,
			currentAction,
			error,
			durationMs: Date.now() - startedAt,
			steps: steps.map((step) => ({ ...step }))
		});

		try {
			this.browser = await chromium.launch({ headless: false });
			if (this.stopRequested) {
				return { status: 'stopped', currentStep, totalSteps, durationMs: Date.now() - startedAt, steps };
			}
			page = await this.browser.newPage();
			page.setDefaultTimeout(10000);

			if (startUrl) {
				currentAction = `Navigate ${startUrl}`;
				steps.push({ title: `Navigate to ${startUrl}`, status: 'running' });
				emit('running');
				const stepStarted = Date.now();
				try {
					await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
					steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'passed', durationMs: Date.now() - stepStarted };
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Navigation failed.';
					steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed', durationMs: Date.now() - stepStarted, error: message };
					throw error;
				}
				currentStep += 1;
				emit('running');
			}

			for (let index = 0; index < actions.length; index += 1) {
				if (this.stopRequested) {
					return { status: 'stopped', currentStep, totalSteps, durationMs: Date.now() - startedAt, steps };
				}

				const action = actions[index];
				const nextAction = actions[index + 1];
				if (
					action.type === 'click' &&
					nextAction?.type === 'fill' &&
					(action.selector === nextAction.selector || action.playwright === nextAction.playwright)
				) {
					steps.push({ ...actionStep(action, currentStep), status: 'skipped' });
					currentStep += 1;
					emit('running');
					continue;
				}

				currentAction = actionLabel(action);
				const stepStarted = Date.now();
				const stepIndex = steps.push(actionStep(action, currentStep)) - 1;
				emit('running');

				try {
					switch (action.type) {
						case 'navigate':
							await page.goto(action.url, { waitUntil: 'domcontentloaded' });
							break;
						case 'click':
							await (await clickLocatorFor(page, action)).click();
							break;
						case 'fill':
							await (await uniqueLocatorFor(page, action)).fill(action.value);
							break;
						case 'submit': {
							const previousAction = actions[index - 1];
							const inputAction = previousAction?.type === 'fill' ? previousAction : action;
							await (await uniqueLocatorFor(page, inputAction)).press('Enter');
							break;
						}
					}
					steps[stepIndex] = { ...steps[stepIndex], status: 'passed', durationMs: Date.now() - stepStarted };
				} catch (error) {
					const message = error instanceof Error ? error.message : 'The action failed.';
					steps[stepIndex] = { ...steps[stepIndex], status: 'failed', durationMs: Date.now() - stepStarted, error: message };
					throw error;
				}

				currentStep += 1;
				emit('running');
			}

			currentAction = undefined;
			emit('passed');
			return { status: 'passed', currentStep, totalSteps, durationMs: Date.now() - startedAt, steps };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'The test run failed.';
			if (this.stopRequested) {
				return { status: 'stopped', currentStep, totalSteps, durationMs: Date.now() - startedAt, steps };
			}

			const details = `${currentAction ? `${currentAction}: ` : ''}${message}`;
			emit('failed', details);
			return { status: 'failed', currentStep, totalSteps, error: details, durationMs: Date.now() - startedAt, steps };
		} finally {
			this.active = false;
			this.stopRequested = false;
			const browser = this.browser;
			this.browser = null;
			if (browser?.isConnected()) {
				await browser.close().catch(() => undefined);
			}
		}
	}

	public async stop(): Promise<boolean> {
		if (!this.active) {
			return false;
		}

		this.stopRequested = true;
		const browser = this.browser;
		this.browser = null;
		if (browser?.isConnected()) {
			await browser.close().catch(() => undefined);
		}
		return true;
	}
}