import { BrowserWindow, WebContentsView } from 'electron';

export class BrowserManager {
	private readonly view: WebContentsView;

	public constructor(private readonly window: BrowserWindow) {
		this.view = new WebContentsView({
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false
			}
		});

		this.window.contentView.addChildView(this.view);
		this.updateBounds();
		this.window.on('resize', () => this.updateBounds());
		void this.openUrl('https://example.com');
	}

	public async openUrl(rawUrl: string): Promise<string> {
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

		await this.view.webContents.loadURL(url.toString());
		return this.view.webContents.getURL();
	}

	public goBack(): void {
		if (this.view.webContents.navigationHistory.canGoBack()) {
			this.view.webContents.navigationHistory.goBack();
		}
	}

	public goForward(): void {
		if (this.view.webContents.navigationHistory.canGoForward()) {
			this.view.webContents.navigationHistory.goForward();
		}
	}

	public reload(): void {
		this.view.webContents.reload();
	}

	public dispose(): void {
		this.window.contentView.removeChildView(this.view);
		this.view.webContents.close();
	}

	private updateBounds(): void {
		const bounds = this.window.getContentBounds();
		this.view.setBounds({
			x: 0,
			y: 64,
			width: bounds.width,
			height: Math.max(0, bounds.height - 64)
		});
	}
}
