import { Locator, Page } from 'playwright';
import { RecordedAction } from '../../shared/types/recording';

type LocatorExpression =
	| { kind: 'css'; selector: string }
	| { kind: 'role'; role: string; name?: string; exact?: boolean }
	| { kind: 'text' | 'label' | 'placeholder'; value: string; exact?: boolean };

const quotedString = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`;

function decodeStringLiteral(literal: string): string {
	if (literal.startsWith('"')) {
		return JSON.parse(literal) as string;
	}

	let result = '';
	for (let index = 1; index < literal.length - 1; index += 1) {
		const character = literal[index];
		if (character !== '\\') {
			result += character;
			continue;
		}

		const escaped = literal[++index];
		switch (escaped) {
			case 'b': result += '\b'; break;
			case 'f': result += '\f'; break;
			case 'n': result += '\n'; break;
			case 'r': result += '\r'; break;
			case 't': result += '\t'; break;
			case 'v': result += '\v'; break;
			case '\n': break;
			case 'u': {
				if (literal[index + 1] === '{') {
					const end = literal.indexOf('}', index + 2);
					if (end < 0) throw new Error('Invalid Unicode escape in locator.');
					result += String.fromCodePoint(Number.parseInt(literal.slice(index + 2, end), 16));
					index = end;
				} else {
					result += String.fromCharCode(Number.parseInt(literal.slice(index + 1, index + 5), 16));
					index += 4;
				}
				break;
			}
			case 'x':
				result += String.fromCharCode(Number.parseInt(literal.slice(index + 1, index + 3), 16));
				index += 2;
				break;
			default:
				result += escaped ?? '';
		}
	}
	return result;
}

export function parseLocatorExpression(expression: string): LocatorExpression | undefined {
	const cssMatch = new RegExp(`^locator\\(\\s*(${quotedString})\\s*\\)$`).exec(expression);
	if (cssMatch) {
		return { kind: 'css', selector: decodeStringLiteral(cssMatch[1]) };
	}

	const roleMatch = new RegExp(`^getByRole\\(\\s*(${quotedString})(?:\\s*,\\s*\\{\\s*name\\s*:\\s*(${quotedString})(?:\\s*,\\s*exact\\s*:\\s*(true|false))?\\s*\\})?\\s*\\)$`).exec(expression);
	if (roleMatch) {
		return {
			kind: 'role',
			role: decodeStringLiteral(roleMatch[1]),
			name: roleMatch[2] ? decodeStringLiteral(roleMatch[2]) : undefined,
			exact: roleMatch[3] === undefined ? undefined : roleMatch[3] === 'true'
		};
	}

	const semanticMatch = new RegExp(`^getBy(Text|Label|Placeholder)\\(\\s*(${quotedString})(?:\\s*,\\s*\\{\\s*exact\\s*:\\s*(true|false)\\s*\\})?\\s*\\)$`).exec(expression);
	if (!semanticMatch) {
		return undefined;
	}

	const kind = semanticMatch[1] === 'Text'
		? 'text'
		: semanticMatch[1] === 'Label'
			? 'label'
			: 'placeholder';
	return {
		kind,
		value: decodeStringLiteral(semanticMatch[2]),
		exact: semanticMatch[3] === undefined ? undefined : semanticMatch[3] === 'true'
	};
}

export function resolveLocator(page: Page, action: Extract<RecordedAction, { selector: string }>): Locator {
	const expression = action.playwright ?? action.selector;
	const parsed = parseLocatorExpression(expression);
	if (!parsed) {
		return page.locator(action.selector);
	}

	switch (parsed.kind) {
		case 'css': return page.locator(parsed.selector);
		case 'role': {
			const role = parsed.role as Parameters<Page['getByRole']>[0];
			return parsed.name === undefined
				? page.getByRole(role)
				: page.getByRole(role, { name: parsed.name, exact: parsed.exact });
		}
		case 'text': return page.getByText(parsed.value, { exact: parsed.exact });
		case 'label': return page.getByLabel(parsed.value, { exact: parsed.exact });
		case 'placeholder': return page.getByPlaceholder(parsed.value, { exact: parsed.exact });
	}
}

export function narrowLocatorExpressionByValue(expression: string, value: string): string {
	const parsed = parseLocatorExpression(expression);
	const valueFilter = `[value=${JSON.stringify(value)}]`;
	if (!parsed) {
		return `locator(${JSON.stringify(expression)}).and(locator(${JSON.stringify(valueFilter)}))`;
	}

	switch (parsed.kind) {
		case 'css':
			return `locator(${JSON.stringify(parsed.selector)}).and(locator(${JSON.stringify(valueFilter)}))`;
		case 'role': {
			const options = parsed.name === undefined
				? ''
				: `, { name: ${JSON.stringify(parsed.name)}${parsed.exact === undefined ? '' : `, exact: ${parsed.exact}`} }`;
			return `getByRole(${JSON.stringify(parsed.role)}${options}).and(locator(${JSON.stringify(valueFilter)}))`;
		}
		case 'text':
		case 'label':
		case 'placeholder':
			// These locator kinds don't pair with a value filter; leave them unchanged.
			return expression;
	}
}

export function locatorExpressionFor(
	action: Extract<RecordedAction, { selector: string }>,
	transformCss: (selector: string) => string = (selector) => selector
): string {
	const expression = action.playwright ?? action.selector;
	const parsed = parseLocatorExpression(expression);
	if (!parsed) {
		return `locator(${JSON.stringify(transformCss(action.selector))})`;
	}

	switch (parsed.kind) {
		case 'css': return `locator(${JSON.stringify(transformCss(parsed.selector))})`;
		case 'role': {
			const options = parsed.name === undefined
				? ''
				: `, { name: ${JSON.stringify(parsed.name)}${parsed.exact === undefined ? '' : `, exact: ${parsed.exact}`} }`;
			return `getByRole(${JSON.stringify(parsed.role)}${options})`;
		}
		case 'text':
		case 'label':
		case 'placeholder': {
			const method = parsed.kind === 'text' ? 'getByText' : parsed.kind === 'label' ? 'getByLabel' : 'getByPlaceholder';
			const options = parsed.exact === undefined ? '' : `, { exact: ${parsed.exact} }`;
			return `${method}(${JSON.stringify(parsed.value)}${options})`;
		}
	}
}

export function locatorDescriptionFor(action: Extract<RecordedAction, { selector: string }>): string {
	const parsed = parseLocatorExpression(action.playwright ?? action.selector);
	if (!parsed) return action.description ?? action.selector;
	if (parsed.kind === 'role') return parsed.name ?? parsed.role;
	return parsed.kind === 'css' ? parsed.selector : parsed.value;
}