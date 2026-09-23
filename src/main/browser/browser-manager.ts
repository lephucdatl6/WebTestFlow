import { chromium, Browser, Page } from 'playwright';

export class BrowserManager {
	private browser: Browser | null = null;
	private page: Page | null = null;

	public async launch(): Promise<void> {
		if (!this.browser) {
			this.browser = await chromium.launch({ headless: false });
		}

		if (!this.page || this.page.isClosed()) {
			this.page = await this.browser.newPage();
			this.page.setDefaultTimeout(5000);
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

}
