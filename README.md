# WebTestFlow

**Visual Web Test Automation & Security Header Analyzer**

WebTestFlow is a Windows desktop application designed to make web application testing and browser automation easier through a visual interface.

Instead of manually writing browser automation code, users can open a website, interact with it normally, record their actions, and replay those actions as an automated test using Playwright.

WebTestFlow also includes a basic HTTP security header analyzer for checking common web security configuration headers.

> **Project status:** In development

---

## Overview

WebTestFlow combines visual web testing, browser automation, and basic security configuration checks into a single desktop application.

The main workflow is:

```text
Open Website
     ↓
Interact with Website
     ↓
Record Actions
     ↓
Review Test Flow
     ↓
Replay Test
     ↓
View Results
```

For example:

```text
Navigate → /login
     ↓
Fill → Email
     ↓
Fill → Password
     ↓
Click → Sign In
     ↓
Assert → URL contains "/dashboard"
     ↓
Assert → "Welcome" is visible
```

The goal is to reduce the barrier to browser test automation while still using Playwright as the underlying automation engine. WebTestFlow can be used to create repeatable functional and smoke tests for critical web application workflows.

---

## Features

### Website Launcher

Enter a website URL and open it inside the application's controlled browser.

* URL validation
* Website navigation
* Browser interaction
* HTTP and HTTPS protocol restriction
* Automatic `https://` prefix for hostnames entered without a protocol

### Input and Locator Validation

WebTestFlow validates inputs at the boundaries where they are used:

* Website URLs are parsed and restricted to HTTP or HTTPS before navigation.
* JSON recordings are checked for the required version, name, creation time, and action list when loaded.
* Playwright files are restricted to existing `.spec.ts` files when loaded.
* Recorded semantic locators are used only when they uniquely identify the target element.
* Ambiguous placeholders, labels, roles, names, or links fall back to a more specific stable CSS selector instead of blindly using `.first()` or `.nth()`.
* During JSON replay, a semantic locator is checked at runtime and the recorded CSS selector is used when it uniquely identifies the target.

This is locator and input validation for reliable test recording and replay. It is not a complete website security or accessibility audit.

### Action Recorder

Record meaningful browser actions while interacting with a website. The current recorder supports:

- Navigation
- Clicks
- Text input
- Enter/submit actions
- Live action updates
- Consecutive fill merging for the same field
- Duplicate click prevention
- Browser disconnect handling
- Structured JSON view of recorded actions

The recorder stores both a **CSS selector** and a **semantic Playwright locator** when one can be identified. Semantic locator generation can use labels, placeholders, ARIA labels, and accessible roles/names when the locator is unique.

For example, clicking the Home link can be recorded as:

```text
CLICK → getByRole('link', { name: "Home" })
```

The underlying action data contains both selector formats:

```json
[
     {
          "type": "click",
          "selector": "a[href=\"https://example.com/?feed=home\"]",
          "playwright": "getByRole('link', { name: \"Home\" })"
     }
]
```

Selector discovery prioritizes stable attributes and semantic information such as `id`, `name`, `placeholder`, `aria-label`, `href`, `alt`, and accessible text before falling back to less specific selectors. Custom elements are also inspected for nested interactive elements.

Recorded actions remain in memory during the active recording session. They can be reviewed in the action list or structured JSON view, then saved as a versioned JSON recording through the native file dialog. Long URLs and selectors are shortened in the action list but remain complete in JSON. The recorder focuses on **semantic browser interactions rather than mouse coordinates**:

```text
Click → Button "Sign In"
```

instead of:

```text
Click → X: 524, Y: 318
```

Same-tab navigation caused directly by a link click is omitted from the action list. Manual URL navigation and new-tab navigation remain recorded.

### Test Replay

Recorded actions can be replayed in a separate Playwright-controlled Chromium window. WebTestFlow displays step progress and the final pass/fail/stopped result, reports the failed action and error when a step fails, and allows an active run to be stopped.

Example:

```text
1. Navigate       ✓
2. Click Login    ✓
3. Fill Email     ✓
4. Fill Password  ✓
5. Click Sign In  ✓
6. Dashboard      ✓

Result: PASS
```

If an action fails, WebTestFlow will provide information about the failed step and can capture a screenshot of the failure.

### Test Assertions

Future tests are planned to support basic assertions such as:

* Verify text is visible
* Verify an element exists
* Verify URL contains a specific value
* Verify page title
* Verify an element is enabled

Example:

```text
Navigate → /login
     ↓
Fill → Email
     ↓
Fill → Password
     ↓
Click → Sign In
     ↓
Assert → URL contains "/dashboard"
     ↓
Assert → "Welcome" is visible
```

### Security Header Analyzer

WebTestFlow analyzes common HTTP security response headers for a website.

Security analysis uses a dedicated main-process HTTP request with the User-Agent `WebTestFlow Security Analyzer`. It follows normal HTTP redirects, analyzes the final response, and does not depend on opening the URL in Chromium or Playwright. A 403 or 429 may still be returned by a website's WAF or bot protection, WebTestFlow reports that response instead of attempting to bypass it.

The initial headers include:

* Strict-Transport-Security
* Content-Security-Policy
* X-Frame-Options
* X-Content-Type-Options
* Referrer-Policy
* Permissions-Policy

Example result:

```text
Security Headers

Strict-Transport-Security    ✓ Present
Content-Security-Policy      ✓ Present
X-Frame-Options              ✗ Missing
X-Content-Type-Options       ✓ Present
Referrer-Policy              ✓ Present
Permissions-Policy           ✗ Missing
```

The analyzer explains what each header does and provides general configuration recommendations.

The result also includes the HTTP status code, final URL after redirects, and basic response context. Responses in the 2xx range are treated as normal; 4xx and 5xx responses are shown as error responses; 403 and 429 responses may be shown as a possible challenge or blocked response. This context describes the response received by WebTestFlow and does not claim a definite bot challenge.

Header values are marked **Present** whenever the response contains the header. A changing CSP nonce or directives such as `unsafe-inline` do not change the Present state. A conservative **Review** state is used only for an explicitly present `X-Content-Type-Options` value that is not `nosniff`.

**Note:** This feature is a configuration check, not a complete security assessment.

### Test Reports

Test execution currently provides:

* Live running-step status for JSON recordings and loaded Playwright tests
* Passed, failed, and stopped status
* Step-level results for JSON replay actions
* Named `test.step()` results for exported Playwright tests and edited specs that use `test.step()`
* Test duration
* Expandable Playwright error details, including locator errors and source lines when reported

Planned reporting features include screenshots and security analysis results.

### Test Storage

Recordings can be saved and loaded as versioned JSON files through native Electron file dialogs. JSON remains WebTestFlow's internal source format for editing and replay. SQLite and automatic background persistence are not currently implemented.

### Playwright Export

Recorded tests can be exported as editable Playwright TypeScript test files. Actions with semantic locators use those locators, other actions fall back to CSS locators. Each exported navigation, click, fill, and Enter action is wrapped in a named `test.step()` so the exported test can report progress while it runs.

Exported `.spec.ts` files can be edited and loaded back into WebTestFlow for direct Playwright Test execution. This provides a separate workflow for users who want to edit generated Playwright code manually before running it.

```text
Record / Load JSON
        ↓
Generate Playwright .spec.ts
        ↓
Edit .spec.ts manually
        ↓
Load .spec.ts
        ↓
Run Playwright Test
        ↓
View execution progress and result
```

The JSON recording remains the source for WebTestFlow recording editing and replay. Edited TypeScript is **not** converted back into JSON.

Only load and run `.spec.ts` files you trust because they execute with the current user's permissions.
Example:

```typescript
test('Login Test', async ({ page }) => {
     await test.step('Navigate to https://example.com/login', async () => {
          await page.goto('https://example.com/login');
     });
     await test.step('Fill Email', async () => {
          await page.getByLabel('Email').fill('test@example.com');
     });
     await test.step('Fill Password', async () => {
          await page.getByLabel('Password').fill('password123');
     });
     await test.step('Click Sign In', async () => {
          await page.getByRole('button', { name: 'Sign In' }).click();
     });
     await expect(page).toHaveURL(/dashboard/);
});
```

Use **Load Playwright** to select an edited `.spec.ts` file and **Run Test** to execute it directly with Playwright Test. The selected file is not modified, and it is never converted back into JSON. For individual live steps in a manually edited file, wrap actions in `test.step()`; ordinary unwrapped Playwright API calls still run normally, but Playwright may not report them as named steps.

---

## Tech Stack

### Frontend

* React
* TypeScript

Used for:

* Application UI
* Test flow visualization
* Security results
* Test reports
* Settings
* Test management

### Desktop

* Electron

Used for:

* Windows desktop application
* Application lifecycle
* Native filesystem access
* Communication between UI and application processes
* Windows executable packaging

### Browser Automation

* Playwright

Used for:

* Chromium automation
* Browser navigation
* Clicking elements
* Filling forms
* Reading page information
* Assertions
* Screenshots
* Test execution

### Application Logic

* Node.js
* TypeScript

Used for:

* Playwright integration
* Security header analysis
* Test management
* File operations
* Application services

---

## Project Structure

```text
WebTestFlow/
│
├── src/
│   ├── main/                # Electron main process and services
│   │   ├── browser/         # Browser control and recording
│   │   ├── ipc/             # Communication between processes
│   │   ├── recording/       # JSON storage and Playwright export
│   │   └── tests/           # JSON replay and spec test execution
│   │
│   ├── preload/             # Secure IPC bridge
│   │
│   ├── renderer/            # React desktop application UI
│   │   └── components/      # UI components
│   │
│   └── shared/              # Shared types and utilities
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development Roadmap

### Phase 1 - Desktop Application

* [x] Electron application
* [x] React UI
* [x] URL input
* [x] Basic navigation

### Phase 2 - Playwright Integration

* [x] Launch Chromium
* [x] Navigate to URLs
* [x] Close browser
* [x] Basic browser interaction

### Phase 3 - Action Recording

* [x] Record clicks
* [x] Record text input
* [x] Record navigation
* [x] Record Enter/submit actions
* [x] Convert browser events into structured test actions
* [x] Update the action list while recording
* [x] Merge consecutive fills for the same selector
* [x] Generate semantic Playwright locators when possible
* [x] Handle custom elements and nested accessible controls
* [x] Review recorded actions as formatted JSON
* [x] Display live recording status and action updates
* [x] Keep CSS selectors and semantic Playwright locators in structured actions
* [x] Download recorded actions as JSON
* [x] Number and align recorded action steps
* [x] Detect browser window disconnects
* [x] Remove same-tab navigation events that duplicate a link-click navigation

### Phase 4 - Recording Export and Storage

* [x] Generate Playwright test code
* [x] Export generated tests
* [x] Save recordings to JSON files through a native file dialog
* [x] Load saved recordings when needed
* [x] Validate loaded recording documents
* [x] Load edited Playwright `.spec.ts` files
* [x] Run loaded Playwright `.spec.ts` files
* [x] Stop loaded Playwright `.spec.ts` execution
* [x] Report `.spec.ts` execution progress and results

### Phase 5 - Test Replay

* [x] Run tests
* [x] Stop tests
* [x] Pass/fail status
* [x] Error handling
* [x] Live replay step progress
* [x] Per-action pass/fail results
* [x] Expandable replay error details

### Phase 6 - Security Analyzer

* [x] Analyze HTTP security response headers
* [x] Strict-Transport-Security
* [x] Content-Security-Policy
* [x] X-Frame-Options
* [x] X-Content-Type-Options
* [x] Referrer-Policy
* [x] Permissions-Policy
* [x] Display header values and explanations
* [x] Show present, missing, and review states
* [x] Display HTTP status code and final URL
* [x] Provide basic challenge/error response context

### Phase 7 - Assertions

* [ ] URL assertions
* [ ] Text visibility
* [ ] Element existence
* [ ] Page title
* [ ] Element state
* [ ] Validate smoke-test workflows

### Phase 8 - Reporting

* [ ] Failure screenshots
* [x] Execution progress and results
* [x] Test duration
* [x] Pass/fail summary
* [ ] Security report

### Phase 9 - Advanced Test Execution

* [ ] Test suites
* [ ] Run multiple tests
* [ ] Create smoke-test suites
* [ ] Parallel test execution
* [ ] Retry failed tests
* [ ] Test execution history

---

## Why This Project?

WebTestFlow is being developed to explore practical software testing and browser automation while building a tool that can be useful for QA workflows.

The project focuses on:

* Web application testing
* Test automation
* Smoke testing
* Browser automation
* Test case design
* Bug reproduction
* HTTP security configuration
* Test reporting
* Desktop application development

It also provides hands-on experience working with multiple parts of a modern application:

```text
React
  ↓
Electron IPC
  ↓
Node.js
  ↓
Playwright
  ↓
Chromium

