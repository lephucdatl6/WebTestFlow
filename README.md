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
* File uploads where supported

### Action Recorder

Record meaningful browser actions while interacting with a website.

Currently planned actions include:

* Navigation
* Click
* Text input
* Select
* Checkbox interaction

WebTestFlow focuses on semantic information instead of relying only on mouse coordinates.

For example:

```text
Click → Button "Sign In"
```

instead of:

```text
Click → X: 524, Y: 318
```

### Test Replay

Recorded actions can be replayed automatically through Playwright.

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

Tests can include basic assertions such as:

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

WebTestFlow can analyze common HTTP security headers for a website.

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

Test execution can provide:

* Pass/fail status
* Execution logs
* Test duration
* Screenshots
* Security analysis results

### Test Storage

Recorded tests are stored in a structured format.

The initial implementation uses JSON files.

SQLite may be introduced later if test management becomes more complex.

### Playwright Export

Recorded tests can eventually be exported as Playwright code.

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

**Initial:** JSON

**Planned:** SQLite

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

* [ ] Launch Chromium
* [ ] Navigate to URLs
* [ ] Close browser
* [ ] Basic browser interaction

### Phase 3 - Action Recording

* [ ] Record clicks
* [ ] Record text input
* [ ] Record navigation
* [ ] Convert browser events into test actions

### Phase 4 - Test Replay

* [ ] Run recorded tests
* [ ] Stop tests
* [ ] Pass/fail status
* [ ] Error handling

### Phase 5 - Security Analyzer

* [ ] Strict-Transport-Security
* [ ] Content-Security-Policy
* [ ] X-Frame-Options
* [ ] X-Content-Type-Options
* [ ] Referrer-Policy
* [ ] Permissions-Policy

### Phase 6 - Assertions

* [ ] URL assertions
* [ ] Text visibility
* [ ] Element existence
* [ ] Page title
* [ ] Element state

### Phase 7 - Reporting

* [ ] Screenshots
* [ ] Execution logs
* [ ] Test duration
* [ ] Pass/fail summary
* [ ] Security report

### Phase 8 - Playwright Export

* [ ] Generate Playwright test code
* [ ] Export generated tests

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
```
