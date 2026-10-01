import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, MousePointerClick, RotateCw, Type } from 'lucide-react';
import { recordingNameFromUrl, timestampedFilename } from '../shared/types/recording';
import type { RecordedAction, RecordingDocument } from '../shared/types/recording';
import type { TestRunProgress } from '../shared/types/test-run';
import type { SpecFileSelection, SpecTestProgress, SpecTestResult, SpecTestStep } from '../shared/types/spec-test';

function SpecStepList({ steps, prefix = '' }: { steps: SpecTestStep[]; prefix?: string }) {
  return (
    <ol className="spec-step-list">
      {steps.map((step, index) => {
        const stepNumber = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
        const firstErrorLine = step.error?.split('\n').find((line) => line.trim());
        const timeout = step.error?.match(/(?:Timeout|timeout)[^\n]*?(\d+)ms/);

        return (
          <li className={`spec-step ${step.status}`} key={`${stepNumber}-${step.title}`}>
            <div className="spec-step-heading">
              <span className="spec-step-mark" aria-label={step.status}>
                {step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : step.status === 'running' ? '…' : '–'}
              </span>
              <strong>{stepNumber}. {step.title}</strong>
              {typeof step.durationMs === 'number' ? <span>{(step.durationMs / 1000).toFixed(1)}s</span> : null}
            </div>
            {step.status === 'failed' ? (
              <div className="spec-step-failure">
                {firstErrorLine ? <span>Failed: {firstErrorLine}</span> : <span>Failed during this step.</span>}
                {timeout ? <span>Timeout: {(Number(timeout[1]) / 1000).toFixed(Number(timeout[1]) % 1000 === 0 ? 0 : 1)}s</span> : null}
                {step.file && step.line ? <span>Line {step.line}</span> : null}
              </div>
            ) : null}
            {step.detail ? <div className="spec-step-detail">{step.detail}</div> : null}
            {step.children?.length ? <SpecStepList steps={step.children} prefix={stepNumber} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function App() {
  const [url, setUrl] = useState('https://example.com');
  const [selector, setSelector] = useState('');
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('Chromium is closed');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showStructuredData, setShowStructuredData] = useState(false);
  const [recordedActions, setRecordedActions] = useState<RecordedAction[]>([]);
  const [recordingStartUrl, setRecordingStartUrl] = useState<string | undefined>();
  const [testRunProgress, setTestRunProgress] = useState<TestRunProgress | null>(null);
  const [loadedSpecFile, setLoadedSpecFile] = useState<SpecFileSelection | null>(null);
  const [specTestProgress, setSpecTestProgress] = useState<SpecTestProgress | null>(null);
  const [specTestResult, setSpecTestResult] = useState<SpecTestResult | null>(null);
  const [isSpecTestRunning, setIsSpecTestRunning] = useState(false);

  useEffect(() => window.webTestFlow.onTestProgress(setTestRunProgress), []);
  useEffect(() => window.webTestFlow.onSpecTestProgress(setSpecTestProgress), []);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const interval = window.setInterval(async () => {
      const actions = await window.webTestFlow.getRecordingActions();
      setRecordedActions(actions as RecordedAction[]);

      if (actions.length > 0) {
        const latest = actions[actions.length - 1];
        if (latest.type === 'navigate') {
          setStatus(`Recording: navigated to ${latest.url}`);
        } else if (latest.type === 'fill') {
          setStatus(`Recording: filled ${latest.selector}`);
        } else if (latest.type === 'click') {
          setStatus(`Recording: clicked ${latest.selector}`);
        } else if (latest.type === 'submit') {
          setStatus(`Recording: submitted ${latest.selector}`);
        }
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const isBrowserOpen = await window.webTestFlow.isBrowserOpen();
        if (!isBrowserOpen && isRecording) {
          setIsRecording(false);
          setStatus('Chromium is closed');
        }
      } catch {
        // The browser status check is best-effort while the app is closing.
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [isRecording]);

  function readableError(actionError: unknown): string {
    const message = actionError instanceof Error ? actionError.message : 'The browser action failed.';
    return message.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setError('');
    setIsBusy(true);
    try {
      await action();
      setStatus(success);
    } catch (actionError) {
      setError(readableError(actionError));
    } finally {
      setIsBusy(false);
    }
  }

  async function openUrl(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const finalUrl = await window.webTestFlow.openUrl(url);
      setUrl(finalUrl);
    }, 'Chromium is open');
  }

  async function toggleRecording() {
    if (isRecording) {
      const actions = await window.webTestFlow.stopRecording();
      setRecordedActions(actions as RecordedAction[]);
      setIsRecording(false);
      setStatus(actions.length > 0 ? `Recording stopped: ${actions.length} action(s)` : 'Recording stopped');
      return;
    }

    await run(async () => {
      const startUrl = await window.webTestFlow.startRecording();
      setRecordedActions([]);
      setRecordingStartUrl(startUrl);
      setIsRecording(true);
      setStatus('Recording started');
    }, 'Recording started');
  }

  async function closeBrowser() {
    await run(async () => {
      await window.webTestFlow.close();
      setIsRecording(false);
      setRecordedActions([]);
      setShowStructuredData(false);
    }, 'Chromium is closed');
  }

  function downloadText(filename: string, data: string, type: string) {
    const blob = new Blob([data], { type });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  function createRecordingDocument(): RecordingDocument {
    const firstNavigation = recordedActions.find((action): action is Extract<RecordedAction, { type: 'navigate' }> => action.type === 'navigate');
    const startUrl = recordingStartUrl ?? firstNavigation?.url;
    return {
      version: 1,
      name: recordingNameFromUrl(startUrl),
      createdAt: new Date().toISOString(),
      startUrl,
      actions: recordedActions
    };
  }

  async function saveRecording() {
    const saved = await window.webTestFlow.saveRecording(createRecordingDocument());
    setStatus(saved ? 'Recording saved' : 'Save cancelled');
  }

  async function loadRecording() {
    const document = await window.webTestFlow.loadRecording();
    if (!document) {
      setStatus('Load cancelled');
      return;
    }

    setRecordedActions(document.actions);
    setRecordingStartUrl(document.startUrl);
    if (document.startUrl) {
      setUrl(document.startUrl);
    }
    setShowStructuredData(false);
    setStatus(`Loaded ${document.actions.length} action(s)`);
  }

  async function loadSpecTest() {
    const selection = await window.webTestFlow.loadSpecTest();
    if (!selection) {
      setStatus('Playwright test selection cancelled');
      return;
    }

    setLoadedSpecFile(selection);
    setSpecTestResult(null);
    setStatus(`Loaded ${selection.fileName}`);
  }

  async function exportPlaywrightTest() {
    const document = createRecordingDocument();
    const code = await window.webTestFlow.generatePlaywrightTest(document.name, document.startUrl, document.actions);
    downloadText(timestampedFilename(document.name, 'spec.ts'), code, 'text/plain');
    setStatus('Playwright test exported');
  }

  async function runTest() {
    setError('');
    setTestRunProgress({ status: 'running', currentStep: 0, totalSteps: recordedActions.length + (recordingStartUrl ? 1 : 0), currentAction: 'Starting test', steps: [] });
    try {
      const document = createRecordingDocument();
      const result = await window.webTestFlow.runTest(document.startUrl, document.actions);
      setTestRunProgress(result);
      if (result.status === 'failed') {
        setStatus(`Test failed at step ${result.currentStep + 1}`);
      } else if (result.status === 'stopped') {
        setStatus(`Test stopped at step ${result.currentStep} of ${result.totalSteps}`);
      } else {
        setStatus(`Test passed: ${result.totalSteps} step(s)`);
      }
    } catch (runError) {
      setTestRunProgress(null);
      setError(readableError(runError));
      setStatus('Test could not start');
    }
  }

  async function stopTest() {
    await window.webTestFlow.stopTest();
  }

  async function runSpecTest() {
    setError('');
    setSpecTestResult(null);
    setSpecTestProgress({ status: 'running', fileName: loadedSpecFile?.fileName ?? '', durationMs: 0, steps: [] });
    setIsSpecTestRunning(true);
    try {
      const result = await window.webTestFlow.runSpecTest();
      setSpecTestResult(result);
      setSpecTestProgress(null);
      setStatus(`${result.fileName}: ${result.status}`);
    } catch (runError) {
      setSpecTestProgress(null);
      setError(readableError(runError));
      setStatus('Playwright test could not start');
    } finally {
      setIsSpecTestRunning(false);
    }
  }

  async function stopSpecTest() {
    await window.webTestFlow.stopSpecTest();
  }

  return (
    <main className="app">
      <form className="toolbar" onSubmit={openUrl}>
        <span className="brand">WebTestFlow</span>
        <button
          className="icon-button"
          type="button"
          onClick={() => void run(() => window.webTestFlow.goBack(), 'Moved back')}
          disabled={isBusy}
          aria-label="Go back"
          title="Go back"
        >
          <ArrowLeft aria-hidden="true" size={18} strokeWidth={2} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => void run(() => window.webTestFlow.goForward(), 'Moved forward')}
          disabled={isBusy}
          aria-label="Go forward"
          title="Go forward"
        >
          <ArrowRight aria-hidden="true" size={18} strokeWidth={2} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => void run(() => window.webTestFlow.reload(), 'Page reloaded')}
          disabled={isBusy}
          aria-label="Reload page"
          title="Reload page"
        >
          <RotateCw aria-hidden="true" size={18} strokeWidth={2} />
        </button>
        <input
          className="url-input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
          aria-label="Website URL"
        />
        <button type="submit" disabled={isBusy}>Open</button>
        <button type="button" className={isRecording ? 'recording' : ''} disabled={isBusy} onClick={() => void toggleRecording()}>
          {isRecording ? 'Stop Recording' : 'Record'}
        </button>
        <button type="button" disabled={isBusy} onClick={() => void run(loadRecording, 'Recording loaded')}>
          Load JSON
        </button>
        <button type="button" disabled={isBusy} onClick={() => void run(loadSpecTest, 'Playwright test loaded')}>
          Load Playwright
        </button>
        {/* <button type="button" disabled={isBusy} onClick={() => void closeBrowser()}>
          Close
        </button> */}
      </form>
      <section className="workspace" aria-label="Browser workspace">
        <div className={showStructuredData ? 'workspace-content workspace-content-expanded' : 'workspace-content'}>
          <p className="eyebrow">Action Recording</p>
          <h1 className="status-heading" title={status}>{status}</h1>
          <p>Use the controls above to drive the Chromium window and capture actions for replay later.</p>

          <div className="recording-panel">
            <div className="recording-header">
              <div className="recording-title">
                <span className={isRecording ? 'recording-indicator active' : 'recording-indicator'} aria-hidden="true" />
                <strong>{isRecording ? 'Recording in progress' : 'Ready to record'}</strong>
              </div>
              <button
                type="button"
                className="data-toggle"
                onClick={() => setShowStructuredData((visible) => !visible)}
                disabled={recordedActions.length === 0}
              >
                {showStructuredData ? 'Hide JSON' : 'View JSON'}
              </button>
            </div>

            <div className={showStructuredData && recordedActions.length > 0 ? 'recording-body with-data' : 'recording-body'}>
              <div className="recording-column">
                {showStructuredData && recordedActions.length > 0 ? <strong className="recording-column-title">Actions</strong> : null}
                {recordedActions.length > 0 ? (
                  <ul className="recorded-actions">
                    {recordedActions.map((action, index) => (
                      <li key={`${action.type}-${index}`}>
                        <span className="action-number" aria-label={`Action ${index + 1}`}>{index + 1}.</span>
                        <span className="action-type">{action.type}</span>
                        {'url' in action && action.url ? <span className="action-detail" title={action.url}>{action.url}</span> : null}
                        {'selector' in action && action.selector ? (
                          <span
                            className="action-detail"
                            title={`${action.playwright ?? action.selector}${'value' in action && typeof action.value === 'string' ? ` -> ${JSON.stringify(action.value)}` : ''}`}
                          >
                            {action.playwright ?? action.selector}
                            {'value' in action && typeof action.value === 'string' ? ` -> ${JSON.stringify(action.value)}` : null}
                          </span>
                        ) : null}
                        {'selector' in action && !action.selector && 'value' in action && typeof action.value === 'string' ? (
                          <span className="action-detail" title={JSON.stringify(action.value)}>{JSON.stringify(action.value)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-recording">No recorded actions yet.</p>
                )}
              </div>

              {showStructuredData && recordedActions.length > 0 ? (
                <div className="structured-data-panel">
                  <strong className="recording-column-title">Action JSON</strong>
                  <pre className="structured-data" aria-label="Action JSON data">
                    {JSON.stringify(recordedActions, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
            <div className="structured-data-actions">
              {!testRunProgress || testRunProgress.status !== 'running' ? (
                <button type="button" onClick={() => void runTest()} disabled={isBusy || isRecording || recordedActions.length === 0}>Run Test</button>
              ) : (
                <button type="button" onClick={() => void stopTest()}>Stop Test</button>
              )}
              <button type="button" onClick={() => void exportPlaywrightTest()} disabled={isBusy || recordedActions.length === 0}>Export Playwright</button>
              <button type="button" onClick={() => void saveRecording()} disabled={isBusy || recordedActions.length === 0}>Save JSON</button>
            </div>
            {testRunProgress ? (
              <div className={`test-run-status ${testRunProgress.status}`} aria-live="polite">
                <strong>
                  {testRunProgress.status === 'running' ? 'Test running' :
                    testRunProgress.status === 'passed' ? 'Test passed' :
                      testRunProgress.status === 'failed' ? 'Test failed' : 'Test stopped'}
                </strong>
                <span>
                  {testRunProgress.currentStep}/{testRunProgress.totalSteps} steps
                  {typeof testRunProgress.durationMs === 'number' ? ` · ${(testRunProgress.durationMs / 1000).toFixed(1)}s` : ''}
                </span>
                {testRunProgress.currentAction ? <span>{testRunProgress.currentAction}</span> : null}
                {testRunProgress.steps.length > 0 ? (
                  <div className="spec-steps-section">
                    <strong>Steps</strong>
                    <SpecStepList steps={testRunProgress.steps} />
                  </div>
                ) : null}
                {testRunProgress.error ? (
                  <details className="spec-error-details">
                    <summary>Error Details</summary>
                    <pre className="spec-test-error" role="alert">{testRunProgress.error}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>

          <section className="spec-test-panel" aria-labelledby="spec-test-heading">
            <div className="spec-test-header">
              <div>
                <h2 id="spec-test-heading">Playwright Test</h2>
                <p className="spec-test-warning">Runs the selected TypeScript file.</p>
              </div>
              {loadedSpecFile ? <span className="spec-file-name">{loadedSpecFile.fileName}</span> : null}
            </div>
            <div className="structured-data-actions">
              {!isSpecTestRunning ? (
                <button type="button" onClick={() => void runSpecTest()} disabled={!loadedSpecFile || isBusy || isRecording || testRunProgress?.status === 'running'}>Run Test</button>
              ) : (
                <button type="button" onClick={() => void stopSpecTest()}>Stop Test</button>
              )}
            </div>
            {specTestProgress ? (
              <div className="test-run-status running" aria-live="polite">
                <strong>Test running</strong>
                {specTestProgress.testName ? <span>Test: {specTestProgress.testName}</span> : null}
                <span>File: {specTestProgress.fileName}</span>
                <span>Duration: {(specTestProgress.durationMs / 1000).toFixed(1)}s</span>
                {specTestProgress.currentStep ? <span>Now testing: {specTestProgress.currentStep}</span> : null}
                {specTestProgress.steps.length > 0 ? (
                  <div className="spec-steps-section">
                    <strong>Steps</strong>
                    <SpecStepList steps={specTestProgress.steps} />
                  </div>
                ) : <p className="spec-no-steps">Starting Playwright test…</p>}
              </div>
            ) : specTestResult ? (
              <div className={`test-run-status ${specTestResult.status}`} aria-live="polite">
                <strong>Test {specTestResult.status}</strong>
                {specTestResult.testName ? <span>Test: {specTestResult.testName}</span> : null}
                <span>File: {specTestResult.fileName}</span>
                <span>Duration: {(specTestResult.durationMs / 1000).toFixed(1)}s</span>
                {specTestResult.steps.length > 0 ? (
                  <div className="spec-steps-section">
                    <strong>Steps</strong>
                    <SpecStepList steps={specTestResult.steps} />
                  </div>
                ) : (
                  <p className="spec-no-steps">Playwright did not report named steps. Use test.step() in an edited spec to show individual step results.</p>
                )}
                {specTestResult.error ? (
                  <details className="spec-error-details">
                    <summary>Error Details</summary>
                    <pre className="spec-test-error" role="alert">{specTestResult.error}</pre>
                  </details>
                ) : null}
                {specTestResult.output ? <pre className="spec-test-output">{specTestResult.output}</pre> : null}
              </div>
            ) : null}
          </section>

          <form className="interaction-panel" onSubmit={(event) => {
            event.preventDefault();
            void run(() => {
              if (!selector.trim()) {
                throw new Error('Enter a CSS selector before clicking.');
              }

              return window.webTestFlow.click(selector);
            }, `Clicked ${selector}`);
          }}>
            <label>
              CSS selector
              <input value={selector} onChange={(event) => setSelector(event.target.value)} placeholder="#submit" />
            </label>
            <label>
              Text value
              <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Value for fill" />
            </label>
            <div className="interaction-actions">
              <button type="submit" disabled={isBusy}><MousePointerClick aria-hidden="true" size={16} />Click selector</button>
              <button type="button" disabled={isBusy} onClick={() => void run(() => {
                if (!selector.trim()) {
                  throw new Error('Enter a CSS selector before filling.');
                }

                return window.webTestFlow.fill(selector, value);
              }, `Filled ${selector}`)}>
                <Type aria-hidden="true" size={16} />Fill selector
              </button>
            </div>
          </form>
          <div className="feedback" aria-live="polite">
            {isBusy && <p className="loading"><span className="spinner" aria-hidden="true" />Working...</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
