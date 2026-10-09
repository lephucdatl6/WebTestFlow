import { chromium, Browser, Page } from 'playwright';
import { RecordedAction, RecordedAssertion } from '../../shared/types/recording';
import { resolveLocator } from './locator-resolution';

export class BrowserManager {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private originalUrl: string | undefined;
	private recordingEnabled = false;
	private recordingSessionId = 0;
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
					this.recordingSessionId += 1;
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

	public async startRecording(existingActions?: RecordedAction[]): Promise<string | undefined> {
		await this.launch();
		this.recordingSessionId += 1;
		this.recordingEnabled = true;
		this.recordedActions = existingActions ? [...existingActions] : [];
		this.sameTabNavigationDeadline = 0;

		if (this.page) {
			await this.attachRecorderHandlers(this.page);
		}

		return this.originalUrl ?? (this.page?.url().startsWith('http') ? this.page.url() : undefined);
	}

	public async stopRecording(): Promise<RecordedAction[]> {
		this.recordingEnabled = false;
		this.recordingSessionId += 1;
		this.sameTabNavigationDeadline = 0;
		return [...this.recordedActions];
	}
	public getRecordedActions(): RecordedAction[] {
		return [...this.recordedActions];
	}

	public addRecordingAssertion(assertion: RecordedAssertion): void {
		if (!this.recordingEnabled) {
			throw new Error('Assertions can only be added while recording.');
		}

		this.recordedActions.push(assertion);
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

	public async debugAction(action: Extract<RecordedAction, { selector: string }>, startUrl: string | undefined): Promise<void> {
		await this.launch();
		const page = this.requirePage();

		if (startUrl) {
			const currentUrl = page.url();
			if (!currentUrl.startsWith(startUrl)) {
				await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
				// Let dynamic content finish so the locator resolves and the outline isn't wiped.
				await page.waitForLoadState('load').catch(() => undefined);
			}
		}

		const locator = resolveLocator(page, action);
		const count = await locator.count();
		if (count === 0) {
			throw new Error('No element matches this locator on the page.');
		}
		const target = count === 1 ? locator : locator.first();

		// Clear any previous debug highlight so only one element stays outlined.
		await page.evaluate(() => {
			const previous = document.querySelector<HTMLElement>('[data-wtf-debug-highlight]');
			if (previous) {
				previous.style.outline = previous.dataset.wtfPreviousOutline ?? '';
				previous.style.outlineOffset = previous.dataset.wtfPreviousOutlineOffset ?? '';
				previous.removeAttribute('data-wtf-debug-highlight');
				delete previous.dataset.wtfPreviousOutline;
				delete previous.dataset.wtfPreviousOutlineOffset;
			}
		}).catch(() => undefined);

		await target.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
		await target.scrollIntoViewIfNeeded().catch(() => undefined);
		await target.evaluate((element) => {
			const html = element as HTMLElement;
			html.dataset.wtfPreviousOutline = html.style.outline;
			html.dataset.wtfPreviousOutlineOffset = html.style.outlineOffset;
			html.setAttribute('data-wtf-debug-highlight', 'true');
			html.style.outline = '3px solid #ff5722';
			html.style.outlineOffset = '2px';
			// Highlight persists until the next debugAction or a page navigation.
		});
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
		this.recordingSessionId += 1;
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
			const navigationSessionId = this.recordingEnabled ? this.recordingSessionId : undefined;

			// Allow the click's exposed-function callback to arrive before classifying this navigation.
			await new Promise<void>((resolve) => setTimeout(resolve, 50));

			const suppressNavigation = this.sameTabNavigationDeadline > Date.now();
			this.sameTabNavigationDeadline = 0;

			if (navigationSessionId === this.recordingSessionId && this.recordingEnabled && !suppressNavigation) {
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
					if (!/execution context was destroyed|frame was detached|cannot find context|target page, context or browser has been closed/i.test(message)) {
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
			const lastCheckboxStates = new WeakMap<HTMLInputElement, boolean>();
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
				const dataTestId = element.getAttribute('data-testid');
				if (dataTestId) {
					return `[data-testid="${dataTestId}"]`;
				}

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

			const nameFromContentRoles = new Set([
				'button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem',
				'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'rowheader', 'switch', 'tab',
				'tooltip', 'treeitem'
			]);

			function labelTextsForElement(element: Element): string[] {
				if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
					return [];
				}

				return Array.from(element.labels ?? [])
					.map((label) => {
						// Clone the label and drop embedded controls so a wrapping label's
						// text does not include option/input content.
						const clone = label.cloneNode(true) as HTMLElement;
						clone.querySelectorAll('input, textarea, select, button, [contenteditable="true"]').forEach((control) => control.remove());
						return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
					})
					.filter((text): text is string => Boolean(text));
			}

			function roleNameForElement(element: Element, role: string): string {
				const labelledBy = element.getAttribute('aria-labelledby');
				const labelledByText = labelledBy
					?.split(/\s+/)
					.map((id) => document.getElementById(id)?.textContent?.trim())
					.filter((part): part is string => Boolean(part))
					.join(' ');
				const labelText = labelTextsForElement(element).find(Boolean);
				const ownText = Array.from(element.childNodes)
					.filter((node) => node.nodeType === Node.TEXT_NODE)
					.map((node) => node.textContent?.trim())
					.filter((part): part is string => Boolean(part))
					.join(' ');
				const roleText = nameFromContentRoles.has(role) ? element.textContent?.trim() : undefined;
				return (element.getAttribute('aria-label') ?? labelledByText ?? labelText ?? element.getAttribute('title') ?? roleText ?? ownText ?? '')
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

				names.push(...labelTextsForElement(element));

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

				if (isFillableElement(element) || isCheckboxElement(element)) {
					const labelText = labelTextsForElement(element).find(Boolean);
					if (labelText) {
						if (hasUniqueLabelName(element, labelText)) {
							return `getByLabel(${JSON.stringify(labelText)}, { exact: true })`;
						}
						ambiguousSemanticLocator = true;
					}
				}

				if ((isFillableElement(element) || isCheckboxElement(element)) && placeholder) {
					const matchingPlaceholders = Array.from(document.querySelectorAll('[placeholder]'))
						.filter((candidate) => candidate.getAttribute('placeholder') === placeholder);
					if (matchingPlaceholders.length === 1 && matchingPlaceholders[0] === element) {
						return `getByPlaceholder(${JSON.stringify(placeholder)}, { exact: true })`;
					}
					ambiguousSemanticLocator = true;
				}

				const ariaLabel = element.getAttribute('aria-label');
				if ((isFillableElement(element) || isCheckboxElement(element)) && ariaLabel) {
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
				return element.matches('input, textarea, select, [contenteditable="true"]') && !isCheckboxElement(element) && !isRadioElement(element);
			}

			function isCheckboxElement(element: Element): element is HTMLInputElement {
				return element instanceof HTMLInputElement && element.type === 'checkbox';
			}

			function isRadioElement(element: Element): element is HTMLInputElement {
				return element instanceof HTMLInputElement && element.type === 'radio';
			}

			function isCheckableElement(element: Element): element is HTMLInputElement {
				return isCheckboxElement(element) || isRadioElement(element);
			}

			function fillableElementFromEvent(event: Event): Element | undefined {
				const composedTarget = event.composedPath().find(
					(pathItem): pathItem is Element => pathItem instanceof Element && isFillableElement(pathItem)
				);
				return composedTarget ?? (event.target instanceof Element && isFillableElement(event.target) ? event.target : undefined);
			}

			function checkableElementFromEvent(event: Event): HTMLInputElement | undefined {
				const composedTarget = event.composedPath().find(
					(pathItem): pathItem is HTMLInputElement => pathItem instanceof HTMLInputElement && (pathItem.type === 'checkbox' || pathItem.type === 'radio')
				);
				if (composedTarget) {
					return composedTarget;
				}

				if (!(event.target instanceof Element)) {
					return undefined;
				}

				const targetCheckable = event.target.closest('input[type="checkbox"], input[type="radio"]');
				if (targetCheckable instanceof HTMLInputElement && isCheckableElement(targetCheckable)) {
					return targetCheckable;
				}

				const label = event.target.closest('label');
				return label instanceof HTMLLabelElement && label.control instanceof HTMLInputElement && isCheckableElement(label.control)
					? label.control
					: undefined;
			}

			function captureCheckboxChange(element: HTMLInputElement): void {
				// Radios can't be unchecked directly; only capture them when checked.
				if (isRadioElement(element) && !element.checked) {
					return;
				}
				if (!globalWindow.webTestFlowRecorderCapture || lastCheckboxStates.get(element) === element.checked) {
					return;
				}

				lastCheckboxStates.set(element, element.checked);
				globalWindow.webTestFlowRecorderCapture({
					type: element.checked ? 'check' : 'uncheck',
					selector: selectorFromElement(element),
					playwright: playwrightLocatorFromElement(element),
					description: elementDescription(element)
				});
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
				if (checkableElementFromEvent(event)) {
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
			const checkable = checkableElementFromEvent(event);
			if (checkable) {
				const pendingTimer = pendingInputTimers.get(checkable);
				if (pendingTimer !== undefined) {
					window.clearTimeout(pendingTimer);
					pendingInputTimers.delete(checkable);
				}
				captureCheckboxChange(checkable);
				return;
			}

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
