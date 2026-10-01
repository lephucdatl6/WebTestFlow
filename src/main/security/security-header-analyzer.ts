import { SecurityAnalysisResult, SecurityHeaderResult, SecurityResponseContext } from '../../shared/types/security';

const headerDefinitions = [
	['strict-transport-security', 'Strict-Transport-Security', 'Tells browsers to use HTTPS for this website.'],
	['content-security-policy', 'Content-Security-Policy', 'Controls where website resources such as scripts, styles, images, and other content can be loaded from.'],
	['x-frame-options', 'X-Frame-Options', 'Controls whether the website can be loaded inside a frame or iframe.'],
	['x-content-type-options', 'X-Content-Type-Options', 'Prevents browsers from MIME-sniffing the response content type.'],
	['referrer-policy', 'Referrer-Policy', 'Controls how much referrer information the browser sends when navigating to another site.'],
	['permissions-policy', 'Permissions-Policy', 'Controls which browser features, such as camera, microphone, and geolocation, the website allows.']
] as const;

const securityAnalyzerUserAgent = 'WebTestFlow Security Analyzer';
const maximumRedirects = 10;

function parseUrl(rawUrl: string): URL {
	const input = rawUrl.trim();
	let url: URL;

	try {
		url = new URL(input);
	} catch {
		url = new URL(`https://${input}`);
	}

	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('Only HTTP and HTTPS URLs can be analyzed.');
	}

	return url;
}

function responseContext(statusCode: number): { context: SecurityResponseContext; message: string } {
	if (statusCode === 403 || statusCode === 429) {
		return { context: 'possible-challenge', message: 'Possible challenge or blocked response.' };
	}
	if (statusCode >= 500) {
		return { context: 'server-error', message: 'Server error response.' };
	}
	if (statusCode >= 400) {
		return { context: 'client-error', message: 'Client or access error response.' };
	}
	if (statusCode >= 300) {
		return { context: 'redirect', message: 'Redirect response.' };
	}
	return { context: 'normal', message: 'Normal response.' };
}

async function requestFinalResponse(startUrl: URL, signal: AbortSignal): Promise<{ response: Response; redirects: Array<{ statusCode: number; from: string; to: string }> }> {
	let currentUrl = startUrl.toString();
	const redirects: Array<{ statusCode: number; from: string; to: string }> = [];

	for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
		const response = await fetch(currentUrl, {
			method: 'GET',
			redirect: 'manual',
			signal,
			headers: {
				'User-Agent': securityAnalyzerUserAgent,
				Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
			}
		});
		const location = response.headers.get('location');

		if (response.status < 300 || response.status >= 400 || !location) {
			return { response, redirects };
		}

		if (redirectCount === maximumRedirects) {
			throw new Error('The security header request exceeded the redirect limit.');
		}

		const nextUrl = new URL(location, currentUrl).toString();
		redirects.push({ statusCode: response.status, from: currentUrl, to: nextUrl });
		await response.body?.cancel();
		currentUrl = nextUrl;
	}

	throw new Error('The security header request could not determine the final response.');
}

export async function analyzeSecurityHeaders(rawUrl: string): Promise<SecurityAnalysisResult> {
	const url = parseUrl(rawUrl);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);

	try {
		let response: Response;
		let redirects: Array<{ statusCode: number; from: string; to: string }>;
		try {
			({ response, redirects } = await requestFinalResponse(url, controller.signal));
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new Error('The security header request timed out.');
			}
			throw new Error(`Unable to retrieve response headers: ${error instanceof Error ? error.message : 'Network request failed.'}`);
		}

		const headers: SecurityHeaderResult[] = headerDefinitions.map(([key, name, explanation]) => {
			const value = response.headers.get(key) ?? undefined;
			const status = value
				? key === 'x-content-type-options' && value.toLowerCase() !== 'nosniff' ? 'review' : 'present'
				: 'missing';
			return { name, status, value, explanation };
		});
		const context = responseContext(response.status);

		const responseWarning = context.context === 'possible-challenge' || context.context === 'client-error' || context.context === 'server-error'
			? 'The headers below belong to the response received by WebTestFlow and may not represent the website\'s normal page response.'
			: undefined;

		return {
			finalUrl: response.url || url.toString(),
			redirects,
			statusCode: response.status,
			statusText: response.statusText,
			responseContext: context.context,
			responseMessage: context.message,
			responseWarning,
			analyzedAt: new Date().toISOString(),
			headers
		};
	} finally {
		clearTimeout(timeout);
	}
}