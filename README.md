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

The goal is to reduce the barrier to browser test automation while still using Playwright as the underlying automation engine.

---

## Features

### Website Launcher

Enter a website URL and open it inside the application's controlled browser.

* URL validation
* Website navigation
* Browser interaction
* Form submission
* File uploads are planned

### Action Recorder

Record meaningful browser actions while interacting with a website. The current recorder supports:

- Navigation
- Clicks
- Text input
- Enter/submit actions
- Live action updates
- Consecutive fill merging for the same field
- Structured JSON view of recorded actions

The recorder stores both a **CSS selector** and a **semantic Playwright locator** when one can be identified.

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

Recorded actions currently remain in memory during the active recording session. They can be reviewed in the action list or structured JSON view, then downloaded as a `webtestflow-recording.json` file. Long URLs and selectors are shortened in the action list but remain complete in JSON. The recorder focuses on **semantic browser interactions rather than mouse coordinates**:

```text
Click → Button "Sign In"
```

instead of:

```text
Click → X: 524, Y: 318
```

Same-tab navigation caused directly by a link click is omitted from the action list. Manual URL navigation and new-tab navigation remain recorded.

### Test Replay

Recorded actions are intended to be replayed automatically through Playwright. Replay is planned for Phase 5.

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

WebTestFlow is planned to analyze common HTTP security headers for a website.

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
Permissions-Policy           ⚠ Not configured
```

The analyzer explains what each header does and provides general configuration recommendations.

**Note:** This feature is a configuration check, not a complete security assessment.

### Test Reports

Future test execution can provide:

* Pass/fail status
* Execution logs
* Test duration
* Screenshots
* Security analysis results

### Test Storage

Recordings can be saved and loaded as versioned JSON files through native Electron file dialogs.

### Playwright Export

Recorded tests can be exported as Playwright TypeScript test files. Actions with semantic locators use those locators, other actions fall back to CSS locators.

Example:

```typescript
test('Login Test', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/dashboard/);
});
```

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

### Storage

**Current:** JSON export

**Planned:** Automatic recording persistence and SQLite

---

## Project Structure

```text
WebTestFlow/
│
├── src/
│   ├── main/
│   │   ├── main.ts
│   │   ├── ipc/
│   │   ├── browser/
│   │   ├── security/
│   │   ├── tests/
│   │   └── storage/
│   │
│   ├── renderer/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   │
│   └── shared/
│       ├── types/
│       └── constants/
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── test-cases/
├── screenshots/
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

### Phase 5 - Test Replay

* [ ] Run recorded tests
* [ ] Stop tests
* [ ] Pass/fail status
* [ ] Error handling

### Phase 6 - Security Analyzer

* [ ] Strict-Transport-Security
* [ ] Content-Security-Policy
* [ ] X-Frame-Options
* [ ] X-Content-Type-Options
* [ ] Referrer-Policy
* [ ] Permissions-Policy

### Phase 7 - Assertions

* [ ] URL assertions
* [ ] Text visibility
* [ ] Element existence
* [ ] Page title
* [ ] Element state

### Phase 8 - Reporting

* [ ] Screenshots
* [ ] Execution logs
* [ ] Test duration
* [ ] Pass/fail summary
* [ ] Security report

---

## Why This Project?

WebTestFlow is being developed to explore practical software testing and browser automation while building a tool that can be useful for QA workflows.

The project focuses on:

* Web application testing
* Test automation
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

