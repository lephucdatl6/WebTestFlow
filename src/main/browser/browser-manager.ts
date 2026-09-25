import { chromium, Browser, Page } from 'playwright';

type RecordedAction =
	| { type: 'navigate'; url: string }
	| { type: 'click'; selector: string; playwright?: string; description?: string }
	| { type: 'fill'; selector: string; value: string; playwright?: string; description?: string }
	| { type: 'submit'; selector: string; playwright?: string; description?: string };

export class BrowserManager {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private recordingEnabled = false;
	private recordedActions: RecordedAction[] = [];
	private sameTabNavigationDeadline = 0;

	public async launch(): Promise<void> {
		if (!this.browser) {
			this.browser = await chromium.launch({ headless: false });
			const browser = this.browser;
			browser.on('disconnected', () => {
				if (this.browser === browser) {
					this.browser = null;
					this.page = null;
					this.recordingEnabled = false;
					this.recordedActions = [];
				}
			});
		}

		if (!this.page || this.page.isClosed()) {
			this.page = await this.browser.newPage();
			this.page.setDefaultTimeout(5000);
			await this.bindRecorder(this.page);
		}
	}

	public async openUrl(rawUrl: string): Promise<string> {
		await this.launch();

		const input = rawUrl.trim();
		let url: URL;

		try {
			url = new URL(input);
		} catch {
			url = new URL(`https://${input}`);
		}

		if (!['http:', 'https:'].includes(url.protocol)) {
			throw new Error('Only HTTP and HTTPS URLs are supported.');
		}

		await this.page!.goto(url.toString(), { waitUntil: 'domcontentloaded' });
		return this.page!.url();
	}

	public async startRecording(): Promise<void> {
		await this.launch();
		this.recordingEnabled = true;
		this.recordedActions = [];
		this.sameTabNavigationDeadline = 0;

		if (this.page) {
			await this.attachRecorderHandlers(this.page);
		}
	}

	public async stopRecording(): Promise<RecordedAction[]> {
		this.recordingEnabled = false;
		this.sameTabNavigationDeadline = 0;
		const actions = [...this.recordedActions];
		this.recordedActions = [];
		return actions;
	}

	public getRecordedActions(): RecordedAction[] {
		return [...this.recordedActions];
	}

	public isBrowserOpen(): boolean {
		return Boolean(this.browser?.isConnected() && this.page && !this.page.isClosed());
	}

	public async click(selector: string): Promise<void> {
		await this.launch();
		await this.requirePage().locator(selector).click();
	}

	public async fill(selector: string, value: string): Promise<void> {
		await this.launch();
		await this.requirePage().locator(selector).fill(value);
	}

	public async goBack(): Promise<void> {
		await this.launch();
		await this.requirePage().goBack();
	}

	public async goForward(): Promise<void> {
		await this.launch();
		await this.requirePage().goForward();
	}

	public async reload(): Promise<void> {
		await this.launch();
		await this.requirePage().reload();
	}

	public async close(): Promise<void> {
		this.recordingEnabled = false;
		this.recordedActions = [];
		this.sameTabNavigationDeadline = 0;
		await this.browser?.close();
		this.browser = null;
		this.page = null;
	}

	public async dispose(): Promise<void> {
		await this.close();
	}

	private requirePage(): Page {
		if (!this.page || this.page.isClosed()) {
			throw new Error('Launch the browser before interacting with a page.');
		}

		return this.page;
	}

	private async bindRecorder(page: Page): Promise<void> {
		await page.exposeFunction('webTestFlowRecorderCapture', (payload: RecordedAction) => {
			if (!this.recordingEnabled) {
				return;
			}

			const previousAction = this.recordedActions[this.recordedActions.length - 1];
			if (
				payload.type === 'fill' &&
				previousAction?.type === 'fill' &&
				previousAction.selector === payload.selector
			) {
				this.recordedActions[this.recordedActions.length - 1] = payload;
				return;
			}

			if (payload.type === 'click' && 'suppressNextNavigation' in payload && payload.suppressNextNavigation) {
				this.sameTabNavigationDeadline = Date.now() + 1500;
			}

			if (payload.type === 'click' && 'suppressNextNavigation' in payload) {
				const { suppressNextNavigation: _suppressNextNavigation, ...cleanPayload } = payload;
				this.recordedActions.push(cleanPayload);
				return;
			}

			this.recordedActions.push(payload);
		});

		page.on('popup', (popup) => {
			void this.bindRecorder(popup);
		});

		page.on('framenavigated', async (frame) => {
			if (frame !== page.mainFrame()) {
				return;
			}

			// Allow the click's exposed-function callback to arrive before classifying this navigation.
			await new Promise<void>((resolve) => setTimeout(resolve, 50));

			const suppressNavigation = this.sameTabNavigationDeadline > Date.now();
			this.sameTabNavigationDeadline = 0;

			if (this.recordingEnabled && !suppressNavigation) {
				this.recordedActions.push({
					type: 'navigate',
					url: page.url()
				});
			}

			if (this.page) {
				await this.attachRecorderHandlers(this.page);
			}
		});
	}

	private async attachRecorderHandlers(page: Page): Promise<void> {
		await page.evaluate(() => {
			const globalWindow = window as typeof window & {
				__webTestFlowRecorderBound?: boolean;
				webTestFlowRecorderCapture?: (payload: unknown) => void;
			};

			if (globalWindow.__webTestFlowRecorderBound) {
				return;
			}

			globalWindow.__webTestFlowRecorderBound = true;

			const lastInputValues = new WeakMap<Element, string>();
			const pendingInputTimers = new WeakMap<Element, number>();
			const editedInputTargets = new WeakSet<Element>();
			const lastClickTargets = new WeakSet<Element>();

			function selectorFromElement(element: Element): string {
				const tag = element.tagName.toLowerCase();
				const name = element.getAttribute('name');
				if (name) {
					return `${tag}[name="${name}"]`;
				}

				const placeholder = element.getAttribute('placeholder');
				if (placeholder) {
					return `${tag}[placeholder="${placeholder}"]`;
				}

				const ariaLabel = element.getAttribute('aria-label');
				if (ariaLabel) {
					return `${tag}[aria-label="${ariaLabel}"]`;
				}

				const dataTestId = element.getAttribute('data-testid');
				if (dataTestId) {
					return `[data-testid="${dataTestId}"]`;
				}

				if (element instanceof HTMLElement && element.id) {
					return `#${CSS.escape(element.id)}`;
				}

				const href = element.getAttribute('href');
				if (href) {
					return `a[href="${href}"]`;
				}

				const dataSection = element.getAttribute('data-section');
				if (dataSection) {
					return `${tag}[data-section="${dataSection}"]`;
				}

				const alt = element.getAttribute('alt');
				if (alt) {
					return `${tag}[alt="${alt}"]`;
				}

				const text = element.textContent?.trim();
				if (text && text.length > 0 && text.length < 40) {
					return `${tag}:has-text("${text.replace(/"/g, '\\"')}")`;
				}

				const className = element.getAttribute('class');
				if (className && className.trim()) {
					const cleanClass = className.trim().split(/\s+/).filter(Boolean)[0];
					if (cleanClass) {
						return `${tag}.${cleanClass}`;
					}
				}

				return tag;
			}

			function elementDescription(element: Element): string | undefined {
				return element.getAttribute('aria-label') ?? element.getAttribute('name') ?? undefined;
			}

			function playwrightLocatorFromElement(element: Element): string | undefined {
				const tag = element.tagName.toLowerCase();
				const role = element.getAttribute('role') ?? (tag === 'a' ? 'link' : tag === 'button' ? 'button' : undefined);
				const name = element.getAttribute('aria-label') ?? element.textContent?.trim();
				const placeholder = element.getAttribute('placeholder');

				if (isFillableElement(element) && placeholder) {
					return `getByPlaceholder(${JSON.stringify(placeholder)})`;
				}

				const ariaLabel = element.getAttribute('aria-label');
				if (isFillableElement(element) && ariaLabel) {
					return `getByLabel(${JSON.stringify(ariaLabel)})`;
				}

				if ((role === 'link' || role === 'button') && name && name.length < 80) {
					return `getByRole('${role}', { name: ${JSON.stringify(name)} })`;
				}

				return undefined;
			}

			function isFillableElement(element: Element): boolean {
				return element.matches('input, textarea, select, [contenteditable="true"]');
			}

			function fillableElementFromEvent(event: Event): Element | undefined {
				const composedTarget = event.composedPath().find(
					(pathItem): pathItem is Element => pathItem instanceof Element && isFillableElement(pathItem)
				);
				return composedTarget ?? (event.target instanceof Element && isFillableElement(event.target) ? event.target : undefined);
			}

			function captureFill(element: Element): void {
				if (!globalWindow.webTestFlowRecorderCapture) {
					return;
				}

				if (!isFillableElement(element) || !editedInputTargets.has(element)) {
					return;
				}

				const inputTarget = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
				const nextValue = inputTarget.value ?? '';
				if (lastInputValues.get(element) === nextValue) {
					return;
				}

				lastInputValues.set(element, nextValue);
				editedInputTargets.delete(element);
				globalWindow.webTestFlowRecorderCapture({
					type: 'fill',
					selector: selectorFromElement(element),
					playwright: playwrightLocatorFromElement(element),
					value: nextValue,
					description: elementDescription(element)
				});
			}

			function scheduleFill(element: Element): void {
			const existingTimer = pendingInputTimers.get(element);
			if (existingTimer !== undefined) {
				window.clearTimeout(existingTimer);
			}

			pendingInputTimers.set(element, window.setTimeout(() => {
				pendingInputTimers.delete(element);
				captureFill(element);
			}, 400));
		}

			document.addEventListener('click', (event: Event) => {
				const target = event.target;
				if (!(target instanceof Element) || !globalWindow.webTestFlowRecorderCapture) {
					return;
				}

				if (lastClickTargets.has(target)) {
					return;
				}

				lastClickTargets.add(target);
				setTimeout(() => lastClickTargets.delete(target), 250);

				const interactiveSelector = 'input, textarea, select, button, a, [role="button"], [role="link"]';
				const composedTarget = event.composedPath().find(
					(pathItem): pathItem is Element => pathItem instanceof Element && pathItem.matches(interactiveSelector)
				);
				const chosenTarget = target.closest(interactiveSelector)
					?? (target.matches(interactiveSelector) ? target : target.querySelector(interactiveSelector))
					?? composedTarget
					?? target;
				globalWindow.webTestFlowRecorderCapture({
					type: 'click',
					selector: selectorFromElement(chosenTarget),
					playwright: playwrightLocatorFromElement(chosenTarget),
					description: elementDescription(chosenTarget),
					suppressNextNavigation: chosenTarget.matches('a[href]:not([target="_blank"]):not([target="new"])')
				});
			}, true);

			document.addEventListener('input', (event: Event) => {
				const target = fillableElementFromEvent(event);
				if (!target || !globalWindow.webTestFlowRecorderCapture) {
					return;
				}

				editedInputTargets.add(target);
				scheduleFill(target);
			}, true);

			document.addEventListener('change', (event: Event) => {
			const target = fillableElementFromEvent(event);
			if (target) {
				editedInputTargets.add(target);
				captureFill(target);
			}
		}, true);

			document.addEventListener('blur', (event: FocusEvent) => {
			const target = fillableElementFromEvent(event);
			if (target) {
				const pendingTimer = pendingInputTimers.get(target);
				if (pendingTimer !== undefined) {
					window.clearTimeout(pendingTimer);
					pendingInputTimers.delete(target);
				}
				captureFill(target);
			}
		}, true);

			document.addEventListener('keydown', (event: KeyboardEvent) => {
				const target = event.target instanceof Element ? event.target : undefined;
				const fillTarget = fillableElementFromEvent(event);
				if (!target || !globalWindow.webTestFlowRecorderCapture) {
					return;
				}

				if (event.key !== 'Enter') {
					return;
				}

				if (fillTarget) {
					const pendingTimer = pendingInputTimers.get(fillTarget);
					if (pendingTimer !== undefined) {
						window.clearTimeout(pendingTimer);
						pendingInputTimers.delete(fillTarget);
					}
					captureFill(fillTarget);
				}

				const chosenTarget = target.closest('input, textarea, form, button, [role="button"]') ?? target;
				globalWindow.webTestFlowRecorderCapture({
					type: 'submit',
					selector: selectorFromElement(chosenTarget),
					playwright: playwrightLocatorFromElement(chosenTarget),
					description: elementDescription(chosenTarget)
				});
			}, true);
		});
	}
}
