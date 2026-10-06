import { Browser, chromium, Locator, Page } from 'playwright';
import { expect } from '@playwright/test';
import { parseLocatorExpression, resolveLocator } from '../browser/locator-resolution';
import { RecordedAction } from '../../shared/types/recording';
import { SpecTestStep } from '../../shared/types/spec-test';
import { TestRunProgress, TestRunResult } from '../../shared/types/test-run';

async function uniqueLocatorFor(page: Page, action: Extract<RecordedAction, { selector: string }>): Promise<Locator> {
	const resolvedLocator = resolveLocator(page, action);
	if (await resolvedLocator.count() === 1) {
		return resolvedLocator;
	}

	if (!parseLocatorExpression(action.selector)) {
		const cssLocator = page.locator(action.selector);
		if (await cssLocator.count() === 1) {
			return cssLocator;
		}
	}

	return resolvedLocator;
}

async function clickLocatorFor(page: Page, action: Extract<RecordedAction, { type: 'click' }>): Promise<Locator> {
	const semanticLocator = resolveLocator(page, action);
	const semanticCount = await semanticLocator.count();
	if (semanticCount === 1 && await semanticLocator.isVisible()) {
		return semanticLocator;
	}

	if (!parseLocatorExpression(action.selector)) {
		const cssLocator = page.locator(action.selector);
		if (await cssLocator.count() === 1) {
			return cssLocator;
		}
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
		case 'check': return `Check ${target}`;
		case 'uncheck': return `Uncheck ${target}`;
		case 'assert-url': return `Assert URL contains ${JSON.stringify(action.value)}`;
		case 'assert-text': return `Assert ${JSON.stringify(action.text)} is visible`;
		case 'assert-element': return `Assert ${target} exists`;
		case 'assert-title': return `Assert page title ${JSON.stringify(action.title)}`;
		case 'assert-state': return `Assert ${target} is ${action.state}`;
	}
}

function actionStep(action: RecordedAction): SpecTestStep {
	const title = actionLabel(action);
	const detail = action.type === 'fill'
		? `Value: ${action.value.slice(0, 80)}${action.value.length > 80 ? '…' : ''}`
		: action.type === 'assert-url'
			? `Expected: URL contains ${JSON.stringify(action.value)}`
			: action.type === 'assert-text'
				? `Expected: ${JSON.stringify(action.text)} is visible`
				: action.type === 'assert-title'
					? `Expected title: ${JSON.stringify(action.title)}`
					: action.type === 'assert-state'
						? `Expected state: ${action.state}`
						: action.type === 'assert-element'
							? 'Expected element to exist'
							: undefined;
	return {
		title,
		status: 'running',
		detail
	};
}

async function runAssertion(page: Page, action: Extract<RecordedAction, { type: `assert-${string}` }>): Promise<string | undefined> {
	switch (action.type) {
		case 'assert-url': {
			const actual = page.url();
			if (!actual.includes(action.value)) {
				throw new Error(`Expected URL to contain ${JSON.stringify(action.value)}. Actual URL: ${actual}`);
			}
			return `Actual URL: ${actual}`;
		}
		case 'assert-text':
			try {
				await expect(page.getByText(action.text)).toBeVisible();
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Text was not visible.';
				throw new Error(`Expected text ${JSON.stringify(action.text)} to be visible. ${message}`);
			}
			return `Visible text: ${JSON.stringify(action.text)}`;
		case 'assert-element': {
			const locator = await uniqueLocatorFor(page, action);
			try {
				await expect(locator.first()).toBeAttached();
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Element was not found.';
				throw new Error(`Expected element ${action.playwright ?? action.selector} to exist. ${message}`);
			}
			return `Found element: ${action.playwright ?? action.selector}`;
		}
		case 'assert-title': {
			const actual = await page.title();
			if (actual !== action.title) {
				throw new Error(`Expected page title ${JSON.stringify(action.title)}. Actual title: ${JSON.stringify(actual)}`);
			}
			return `Actual title: ${JSON.stringify(actual)}`;
		}
		case 'assert-state': {
			const locator = await uniqueLocatorFor(page, action);
			try {
				switch (action.state) {
					case 'enabled': await expect(locator).toBeEnabled(); break;
					case 'disabled': await expect(locator).toBeDisabled(); break;
					case 'checked': await expect(locator).toBeChecked(); break;
					case 'visible': await expect(locator).toBeVisible(); break;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Element state did not match.';
				throw new Error(`Expected ${action.playwright ?? action.selector} to be ${action.state}. ${message}`);
			}
			return `Actual state: ${action.state}`;
		}
	}
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
					steps.push({ ...actionStep(action), status: 'skipped' });
					currentStep += 1;
					emit('running');
					continue;
				}

				currentAction = actionLabel(action);
				const stepStarted = Date.now();
				const stepIndex = steps.push(actionStep(action)) - 1;
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
							{
								const locator = await uniqueLocatorFor(page, action);
								const isCheckbox = await locator.evaluate((element) => element instanceof HTMLInputElement && element.type === 'checkbox');
								if (isCheckbox) {
									const value = action.value.toLowerCase();
									if (['on', 'true', '1', 'checked'].includes(value)) {
										await locator.check();
									} else if (['', 'off', 'false', '0', 'unchecked'].includes(value)) {
										await locator.uncheck();
									} else {
										throw new Error(`Legacy fill value ${JSON.stringify(action.value)} cannot be applied to a checkbox.`);
									}
								} else {
									await locator.fill(action.value);
								}
							}
							break;
						case 'check':
							await (await uniqueLocatorFor(page, action)).check();
							break;
						case 'uncheck':
							await (await uniqueLocatorFor(page, action)).uncheck();
							break;
						case 'submit': {
							const previousAction = actions[index - 1];
							const inputAction = previousAction?.type === 'fill' ? previousAction : action;
							await (await uniqueLocatorFor(page, inputAction)).press('Enter');
							break;
						}
						default: {
							const actual = await runAssertion(page, action);
							if (actual) {
								steps[stepIndex] = { ...steps[stepIndex], detail: `${steps[stepIndex].detail}\n${actual}` };
							}
							break;
						}
					}
					steps[stepIndex] = { ...steps[stepIndex], status: 'passed', durationMs: Date.now() - stepStarted };
				} catch (error) {
					const message = error instanceof Error ? error.message : 'The action failed.';
					steps[stepIndex] = {
						...steps[stepIndex],
						status: 'failed',
						durationMs: Date.now() - stepStarted,
						detail: action.type.startsWith('assert-') ? `${steps[stepIndex].detail}\n${message}` : steps[stepIndex].detail,
						error: message
					};
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