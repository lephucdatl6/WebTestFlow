import { chromium, Browser, Page } from 'playwright';
import { RecordedAction } from '../../shared/types/recording';

export class BrowserManager {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private originalUrl: string | undefined;
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
					this.originalUrl = undefined;
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

		this.originalUrl = this.removeTemporaryUrlParameters(url).toString();
		await this.page!.goto(url.toString(), { waitUntil: 'domcontentloaded' });
		return this.page!.url();
	}

	public async startRecording(): Promise<string | undefined> {
		await this.launch();
		this.recordingEnabled = true;
		this.recordedActions = [];
		this.sameTabNavigationDeadline = 0;

		if (this.page) {
			await this.attachRecorderHandlers(this.page);
		}

		return this.originalUrl ?? (this.page?.url().startsWith('http') ? this.page.url() : undefined);
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
		this.originalUrl = undefined;
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

	private removeTemporaryUrlParameters(url: URL): URL {
		const cleanedUrl = new URL(url.toString());
		const temporaryParameters = new Set(['solution', 'js_challenge', 'jsc_token', 'jsc_orig_r']);
		for (const parameter of Array.from(cleanedUrl.searchParams.keys())) {
			if (temporaryParameters.has(parameter) || parameter.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(parameter.toLowerCase())) {
				cleanedUrl.searchParams.delete(parameter);
			}
		}
		return cleanedUrl;
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
				try {
					await this.attachRecorderHandlers(this.page);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					if (!/execution context was destroyed|frame was detached|cannot find context/i.test(message)) {
						console.error('Failed to reattach browser recorder:', error);
					}
				}
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
			const actionableSelector = 'input, textarea, select, button, a, [role="button"], [role="link"], [role="option"], [role="menuitem"], [role="combobox"], [role="listbox"], [aria-haspopup], [tabindex]';

			function escapeAttributeValue(value: string): string {
				return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
			}

			function uniqueSelectorForElement(element: Element): string {
				const tag = element.tagName.toLowerCase();
				const stableAttributes = ['data-testid', 'name', 'placeholder', 'aria-label', 'title', 'data-section', 'alt', 'role', 'type', 'slot'];

				if (element instanceof HTMLElement && element.id) {
					const idSelector = `#${CSS.escape(element.id)}`;
					if (document.querySelectorAll(idSelector).length === 1) {
						return idSelector;
					}
				}

				for (const attribute of stableAttributes) {
					const value = element.getAttribute(attribute);
					if (!value) {
						continue;
					}

					const selector = `${tag}[${attribute}="${escapeAttributeValue(value)}"]`;
					if (document.querySelectorAll(selector).length === 1) {
						return selector;
					}
				}

				const path: string[] = [];
				let current: Element | null = element;
				while (current && current !== document.documentElement) {
					const currentElement: Element = current;
					const currentTag = currentElement.tagName.toLowerCase();
					const parentElement: Element | null = currentElement.parentElement;
					const siblings: Element[] = parentElement ? Array.from(parentElement.children) as Element[] : [];
					const sameTagSiblings = parentElement
						? siblings.filter((sibling: Element) => sibling.tagName === currentElement.tagName)
						: [];
					const position = sameTagSiblings.indexOf(currentElement) + 1;
					path.unshift(sameTagSiblings.length > 1 ? `${currentTag}:nth-of-type(${position})` : currentTag);
					const selector = path.join(' > ');
					const matches = document.querySelectorAll(selector);
					if (matches.length === 1 && matches[0] === element) {
						return selector;
					}
					current = parentElement;
				}

				return path.join(' > ');
			}

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
					let hrefSelector: string;
					const queryStart = href.indexOf('?');
					if (queryStart >= 0) {
						const path = href.slice(0, queryStart);
						const queryParts = href.slice(queryStart + 1).split('&');
						const temporaryParameterNames = ['solution', 'js_challenge', 'jsc_token', 'jsc_orig_r', 'cid', 'iid', 'fbclid', 'gclid'];
						const firstTemporaryIndex = queryParts.findIndex((part) => {
							const parameterName = decodeURIComponent(part.split('=')[0]).toLowerCase();
							return temporaryParameterNames.includes(parameterName) || parameterName.startsWith('utm_');
						});

						if (firstTemporaryIndex >= 0) {
							const stablePrefix = queryParts.slice(0, firstTemporaryIndex).join('&');
							const prefix = `${path}${stablePrefix ? `?${stablePrefix}` : ''}`;
							hrefSelector = `a[href^="${prefix.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
						} else {
							hrefSelector = `a[href="${href.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
						}
					} else {
						hrefSelector = `a[href="${href.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
					}

					const hrefMatches = document.querySelectorAll(hrefSelector);
					return hrefMatches.length === 1 && hrefMatches[0] === element
						? hrefSelector
						: uniqueSelectorForElement(element);
				}

				const dataSection = element.getAttribute('data-section');
				if (dataSection) {
					return `${tag}[data-section="${dataSection}"]`;
				}

				const alt = element.getAttribute('alt');
				if (alt) {
					return `${tag}[alt="${alt}"]`;
				}

				return uniqueSelectorForElement(element);
			}

			function elementDescription(element: Element): string | undefined {
				return element.getAttribute('aria-label') ?? element.getAttribute('name') ?? undefined;
			}

			function roleForElement(element: Element): string | undefined {
				const tag = element.tagName.toLowerCase();
				const explicitRole = element.getAttribute('role');
				if (explicitRole) {
					return explicitRole;
				}

				if (tag === 'a' && element.hasAttribute('href')) {
					return 'link';
				}
				if (tag === 'button') {
					return 'button';
				}
				if (tag === 'textarea') {
					return 'textbox';
				}
				if (tag === 'select') {
					return element.hasAttribute('multiple') ? 'listbox' : 'combobox';
				}
				if (tag === 'input') {
					const type = (element.getAttribute('type') ?? 'text').toLowerCase();
					if (type === 'hidden') {
						return undefined;
					}
					if (['button', 'submit', 'reset', 'image'].includes(type)) {
						return 'button';
					}
					if (type === 'checkbox') {
						return 'checkbox';
					}
					if (type === 'radio') {
						return 'radio';
					}
					if (type === 'search') {
						return 'searchbox';
					}
					if (type === 'number') {
						return 'spinbutton';
					}
					return 'textbox';
				}

				return undefined;
			}

			function roleNameForElement(element: Element, role: string): string {
				const labelledBy = element.getAttribute('aria-labelledby');
				const labelledByText = labelledBy
					?.split(/\s+/)
					.map((id) => document.getElementById(id)?.textContent?.trim())
					.filter((part): part is string => Boolean(part))
					.join(' ');
				const ownText = Array.from(element.childNodes)
					.filter((node) => node.nodeType === Node.TEXT_NODE)
					.map((node) => node.textContent?.trim())
					.filter((part): part is string => Boolean(part))
					.join(' ');
				const roleText = role ? element.textContent?.trim() : undefined;
				return (element.getAttribute('aria-label') ?? labelledByText ?? element.getAttribute('title') ?? roleText ?? ownText ?? '')
					.replace(/\s+/g, ' ')
					.trim();
			}

			function labelNamesForElement(element: Element): string[] {
				const names = [element.getAttribute('aria-label') ?? ''];
				const labelledBy = element.getAttribute('aria-labelledby');
				if (labelledBy) {
					names.push(labelledBy
						.split(/\s+/)
						.map((id) => document.getElementById(id)?.textContent?.trim())
						.filter((part): part is string => Boolean(part))
						.join(' '));
				}

				if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
					names.push(...Array.from(element.labels ?? []).map((label) => label.textContent ?? ''));
				}

				return names.map((name) => name.replace(/\s+/g, ' ').trim()).filter(Boolean);
			}

			function hasUniqueLabelName(target: Element, labelText: string): boolean {
				const labelableElements = document.querySelectorAll('input, textarea, select, [contenteditable="true"], [aria-label], [aria-labelledby]');
				const matches = Array.from(labelableElements).filter((candidate) => labelNamesForElement(candidate).includes(labelText));
				return matches.length === 1 && matches[0] === target;
			}

			function playwrightLocatorFromElement(element: Element): string | undefined {
				const role = roleForElement(element);
				const name = role ? roleNameForElement(element, role) : undefined;
				const placeholder = element.getAttribute('placeholder');
				let ambiguousSemanticLocator = false;

				if (isFillableElement(element)) {
					const labels = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
						? Array.from(element.labels ?? [])
						: [];
					const labelText = labels
						.map((label) => label.textContent?.replace(/\s+/g, ' ').trim())
						.find((text): text is string => Boolean(text));
					if (labelText) {
						if (hasUniqueLabelName(element, labelText)) {
							return `getByLabel(${JSON.stringify(labelText)}, { exact: true })`;
						}
						ambiguousSemanticLocator = true;
					}
				}

				if (isFillableElement(element) && placeholder) {
					const matchingPlaceholders = Array.from(document.querySelectorAll('[placeholder]'))
						.filter((candidate) => candidate.getAttribute('placeholder') === placeholder);
					if (matchingPlaceholders.length === 1 && matchingPlaceholders[0] === element) {
						return `getByPlaceholder(${JSON.stringify(placeholder)}, { exact: true })`;
					}
					ambiguousSemanticLocator = true;
				}

				const ariaLabel = element.getAttribute('aria-label');
				if (isFillableElement(element) && ariaLabel) {
					const normalizedAriaLabel = ariaLabel.replace(/\s+/g, ' ').trim();
					if (hasUniqueLabelName(element, normalizedAriaLabel)) {
						return `getByLabel(${JSON.stringify(normalizedAriaLabel)}, { exact: true })`;
					}
					ambiguousSemanticLocator = true;
				}

				if (role && name && name.length < 80) {
					const candidates = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role]'));
					const matchingCandidates = candidates.filter((candidate) => {
						const candidateRole = roleForElement(candidate);
						return candidateRole === role && roleNameForElement(candidate, candidateRole) === name;
					});
					if (matchingCandidates.length === 1 && matchingCandidates[0] === element) {
						return `getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(name)}, exact: true })`;
					}
					ambiguousSemanticLocator = true;
				}

				if (ambiguousSemanticLocator) {
					return `locator(${JSON.stringify(uniqueSelectorForElement(element))})`;
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

				const composedTarget = event.composedPath().find(
					(pathItem): pathItem is Element => pathItem instanceof Element && pathItem.matches(actionableSelector)
				);
				const chosenTarget = target.closest(actionableSelector)
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
