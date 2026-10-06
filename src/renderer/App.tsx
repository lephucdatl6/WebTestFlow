import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Code2, GripVertical, MousePointerClick, Play, Plus, RotateCw, Save, Trash2, Type, X } from 'lucide-react';
import { recordingNameFromUrl, timestampedFilename } from '../shared/types/recording';
import type { RecordedAction, RecordedAssertion, RecordingDocument } from '../shared/types/recording';
import type { TestRunProgress } from '../shared/types/test-run';
import type { SpecFileSelection, SpecTestProgress, SpecTestResult, SpecTestStep } from '../shared/types/spec-test';
import type { SecurityAnalysisResult, SecurityHeaderStatus, SecurityResponseContext } from '../shared/types/security';

function securityHeaderStatusLabel(status: SecurityHeaderStatus, responseContext: SecurityResponseContext): string {
  if (responseContext === 'normal') {
    return status === 'present' ? 'Present' : status === 'review' ? 'Review' : 'Missing';
  }

  return status === 'present'
    ? 'Present in received response'
    : status === 'review'
      ? 'Review received value'
      : 'Missing in received response';
}

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

function isRecordedAction(value: unknown): value is RecordedAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const action = value as Record<string, unknown>;
  const hasValidLocatorMetadata = ['playwright', 'description'].every((key) => (
    action[key] === undefined || typeof action[key] === 'string'
  ));

  switch (action.type) {
    case 'navigate':
      return typeof action.url === 'string';
    case 'click':
    case 'submit':
    case 'check':
    case 'uncheck':
    case 'assert-element':
      return typeof action.selector === 'string' && hasValidLocatorMetadata;
    case 'fill':
      return typeof action.selector === 'string' && typeof action.value === 'string' && hasValidLocatorMetadata;
    case 'assert-url':
      return typeof action.value === 'string';
    case 'assert-text':
      return typeof action.text === 'string';
    case 'assert-title':
      return typeof action.title === 'string';
    case 'assert-state':
      return typeof action.selector === 'string'
        && hasValidLocatorMetadata
        && ['enabled', 'disabled', 'checked', 'visible'].includes(String(action.state));
    default:
      return false;
  }
}

function App() {
  const [url, setUrl] = useState('https://example.com');
  const [selector, setSelector] = useState('');
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('Chromium is closed');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecordingSession, setHasRecordingSession] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNewRecordingConfirmation, setShowNewRecordingConfirmation] = useState(false);
  const [showStructuredData, setShowStructuredData] = useState(false);
  const [isEditingActionsJson, setIsEditingActionsJson] = useState(false);
  const [actionJsonDraft, setActionJsonDraft] = useState('');
  const [actionJsonError, setActionJsonError] = useState('');
  const [recordedActions, setRecordedActions] = useState<RecordedAction[]>([]);
  const [dragOverActionIndex, setDragOverActionIndex] = useState<number | null>(null);
  const [showAssertionForm, setShowAssertionForm] = useState(false);
  const [assertionType, setAssertionType] = useState<'assert-url' | 'assert-text' | 'assert-element' | 'assert-title' | 'assert-state'>('assert-url');
  const [assertionValue, setAssertionValue] = useState('');
  const [assertionState, setAssertionState] = useState<'enabled' | 'disabled' | 'checked' | 'visible'>('enabled');
  const [recordingStartUrl, setRecordingStartUrl] = useState<string | undefined>();
  const [testRunProgress, setTestRunProgress] = useState<TestRunProgress | null>(null);
  const [loadedSpecFile, setLoadedSpecFile] = useState<SpecFileSelection | null>(null);
  const [specTestProgress, setSpecTestProgress] = useState<SpecTestProgress | null>(null);
  const [specTestResult, setSpecTestResult] = useState<SpecTestResult | null>(null);
  const [isSpecTestRunning, setIsSpecTestRunning] = useState(false);
  const [securityAnalysis, setSecurityAnalysis] = useState<SecurityAnalysisResult | null>(null);
  const [securityError, setSecurityError] = useState('');
  const [isAnalyzingSecurity, setIsAnalyzingSecurity] = useState(false);
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const savedActionsSnapshot = useRef<string | null>(null);

  useEffect(() => window.webTestFlow.onTestProgress(setTestRunProgress), []);
  useEffect(() => window.webTestFlow.onSpecTestProgress(setSpecTestProgress), []);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const interval = window.setInterval(async () => {
      const actions = await window.webTestFlow.getRecordingActions();
      if (JSON.stringify(actions) !== savedActionsSnapshot.current) {
        setHasUnsavedChanges(true);
      }
      setRecordedActions((current) => {
        const merged = [...actions];
        const matched = new Set<number>();
        for (const assertion of current.filter((action) => action.type.startsWith('assert-'))) {
          const matchingIndex = merged.findIndex((action, index) => (
            !matched.has(index) && JSON.stringify(action) === JSON.stringify(assertion)
          ));
          if (matchingIndex >= 0) {
            matched.add(matchingIndex);
          } else {
            merged.push(assertion);
          }
        }
        return merged;
      });

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
          const actions = await window.webTestFlow.getRecordingActions();
          setRecordedActions(actions);
          setHasUnsavedChanges(JSON.stringify(actions) !== savedActionsSnapshot.current);
          setHasRecordingSession(true);
          setIsRecording(false);
          setStatus('Recording stopped: browser disconnected');
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

  async function analyzeSecurity() {
    setSecurityError('');
    setIsAnalyzingSecurity(true);
    try {
      const result = await window.webTestFlow.analyzeSecurityHeaders(url);
      setSecurityAnalysis(result);
      setShowSecurityDetails(false);
    } catch (analysisError) {
      setSecurityAnalysis(null);
      setSecurityError(readableError(analysisError));
    } finally {
      setIsAnalyzingSecurity(false);
    }
  }

  async function startNewRecording() {
    if (hasUnsavedChanges) {
      setShowNewRecordingConfirmation(true);
      return;
    }
    await beginNewRecording();
  }

  async function confirmNewRecording() {
    setShowNewRecordingConfirmation(false);
    await beginNewRecording();
  }

  async function beginNewRecording() {
    await run(async () => {
      const startUrl = await window.webTestFlow.startRecording();
      savedActionsSnapshot.current = JSON.stringify([]);
      setRecordedActions([]);
      setRecordingStartUrl(startUrl);
      setHasRecordingSession(true);
      setHasUnsavedChanges(false);
      setTestRunProgress(null);
      setSpecTestProgress(null);
      setSpecTestResult(null);
      setShowStructuredData(false);
      setIsEditingActionsJson(false);
      setActionJsonDraft('');
      setActionJsonError('');
      setShowAssertionForm(false);
      setShowNewRecordingConfirmation(false);
      setIsRecording(true);
      setStatus('Recording started');
    }, 'Recording started');
  }

  async function continueRecording() {
    await run(async () => {
      await window.webTestFlow.startRecording(recordedActions);
      setHasRecordingSession(true);
      setIsRecording(true);
      setStatus('Recording continued');
    }, 'Recording continued');
  }

  async function stopRecording() {
    try {
      const actions = await window.webTestFlow.stopRecording();
      setRecordedActions(actions);
      setHasRecordingSession(true);
      setHasUnsavedChanges(JSON.stringify(actions) !== savedActionsSnapshot.current);
      setIsRecording(false);
      setStatus(actions.length > 0 ? `Recording stopped: ${actions.length} action(s)` : 'Recording stopped');
    } catch (recordingError) {
      setError(readableError(recordingError));
      setIsRecording(false);
      setHasRecordingSession(true);
      setStatus('Recording stopped with an error');
    }
  }

  async function closeBrowser() {
    await run(async () => {
      await window.webTestFlow.close();
      setIsRecording(false);
      setHasRecordingSession(false);
      setHasUnsavedChanges(false);
      setShowNewRecordingConfirmation(false);
      savedActionsSnapshot.current = null;
      setRecordedActions([]);
      setRecordingStartUrl(undefined);
      setTestRunProgress(null);
      setShowStructuredData(false);
      setIsEditingActionsJson(false);
      setActionJsonDraft('');
      setActionJsonError('');
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
    const document = createRecordingDocument();
    const saved = await window.webTestFlow.saveRecording(document);
    if (saved) {
      savedActionsSnapshot.current = JSON.stringify(document.actions);
      setHasUnsavedChanges(false);
    }
    setStatus(saved ? 'Recording saved' : 'Save cancelled');
  }

  function editActionsJson() {
    setActionJsonDraft(JSON.stringify(recordedActions, null, 2));
    setActionJsonError('');
    setIsEditingActionsJson(true);
  }

  function cancelActionsJsonEdit() {
    setActionJsonDraft('');
    setActionJsonError('');
    setIsEditingActionsJson(false);
  }

  function applyActionsJsonEdit() {
    try {
      const parsed: unknown = JSON.parse(actionJsonDraft);
      if (!Array.isArray(parsed) || !parsed.every(isRecordedAction)) {
        throw new Error('Enter a JSON array containing valid WebTestFlow actions and assertions.');
      }

      const actions = parsed as RecordedAction[];
      setRecordedActions(actions);
      setHasUnsavedChanges(JSON.stringify(actions) !== savedActionsSnapshot.current);
      setActionJsonDraft('');
      setActionJsonError('');
      setIsEditingActionsJson(false);
    } catch (editError) {
      setActionJsonError(editError instanceof Error ? editError.message : 'The action JSON is invalid.');
    }
  }

  function moveAction(fromIndex: number, toIndex: number) {
    setRecordedActions((actions) => {
      if (fromIndex < 0 || fromIndex >= actions.length || toIndex < 0 || toIndex >= actions.length || fromIndex === toIndex) {
        return actions;
      }

      const reordered = [...actions];
      const [action] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, action);
      savedActionsSnapshot.current ??= JSON.stringify(actions);
      return reordered;
    });
    setHasUnsavedChanges(true);
    setDragOverActionIndex(null);
  }

  function deleteAction(index: number) {
    setRecordedActions((actions) => actions.filter((_action, actionIndex) => actionIndex !== index));
    setHasUnsavedChanges(true);
  }

  async function addAssertion(event: FormEvent) {
    event.preventDefault();
    const enteredValue = assertionValue.trim();
    if (!enteredValue) {
      setError('Enter a value for this assertion.');
      return;
    }

    const assertion: RecordedAssertion = assertionType === 'assert-url'
      ? { type: 'assert-url', value: enteredValue }
      : assertionType === 'assert-text'
        ? { type: 'assert-text', text: enteredValue }
        : assertionType === 'assert-element'
          ? { type: 'assert-element', selector: enteredValue }
          : assertionType === 'assert-title'
            ? { type: 'assert-title', title: enteredValue }
            : { type: 'assert-state', selector: enteredValue, state: assertionState };

    try {
      if (isRecording) {
        await window.webTestFlow.addRecordingAssertion(assertion);
      }
      setRecordedActions((actions) => [...actions, assertion]);
      setHasUnsavedChanges(true);
    } catch (assertionError) {
      setError(readableError(assertionError));
      return;
    }
    setAssertionValue('');
    setShowAssertionForm(false);
    setError('');
  }

  async function loadRecording() {
    const document = await window.webTestFlow.loadRecording();
    if (!document) {
      setStatus('Load cancelled');
      return;
    }

    setRecordedActions(document.actions);
    savedActionsSnapshot.current = JSON.stringify(document.actions);
    setHasUnsavedChanges(false);
    setHasRecordingSession(true);
    setIsRecording(false);
    setTestRunProgress(null);
    setIsEditingActionsJson(false);
    setActionJsonDraft('');
    setActionJsonError('');
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
        <button type="button" disabled={isBusy || isRecording || isEditingActionsJson} onClick={() => void run(loadRecording, 'Recording loaded')}>
          Load JSON
        </button>
        <button type="button" disabled={isBusy} onClick={() => void run(loadSpecTest, 'Playwright test loaded')}>
          Load Playwright
        </button>
        <button type="button" disabled={isBusy || isAnalyzingSecurity} onClick={() => void analyzeSecurity()}>
          {isAnalyzingSecurity ? 'Analyzing...' : 'Analyze Security'}
        </button>
        {/* <button type="button" disabled={isBusy} onClick={() => void closeBrowser()}>
          Close
        </button> */}
      </form>
      {showNewRecordingConfirmation ? (
        <div className="recording-confirmation-backdrop">
          <section className="recording-confirmation" role="dialog" aria-modal="true" aria-labelledby="new-recording-confirmation-title">
            <h2 id="new-recording-confirmation-title">Unsaved recording</h2>
            <p>Start a new recording? Your current recording has unsaved changes.</p>
            <div className="recording-confirmation-actions">
              <button type="button" onClick={() => setShowNewRecordingConfirmation(false)}>Cancel</button>
              <button type="button" className="recording-confirm-new" onClick={() => void confirmNewRecording()}>New Recording</button>
            </div>
          </section>
        </div>
      ) : null}
      {(securityAnalysis || isAnalyzingSecurity || securityError) ? <section className="security-section" aria-labelledby="security-heading">
        <div className="security-section-header">
          <strong id="security-heading">Security Headers</strong>
          {securityAnalysis ? (
            <button
              type="button"
              className="security-details-toggle"
              onClick={() => setShowSecurityDetails((visible) => !visible)}
            >
              {showSecurityDetails ? <>Hide Details <ChevronUp aria-hidden="true" size={14} /></> : <>View More <ChevronDown aria-hidden="true" size={14} /></>}
            </button>
          ) : null}
        </div>
        {securityAnalysis ? (
          <>
            <div className="security-badges">
              {securityAnalysis.headers.map((header) => (
                <span className={`security-badge ${header.status}`} key={header.name}>
                  {header.status === 'present' ? <Check aria-hidden="true" size={14} /> : header.status === 'review' ? <AlertTriangle aria-hidden="true" size={14} /> : <X aria-hidden="true" size={14} />}
                  {header.name}
                </span>
              ))}
            </div>
            <div className={`security-response ${securityAnalysis.responseContext}`}>
              <span><b>Status:</b> {securityAnalysis.statusCode}{securityAnalysis.statusText ? ` ${securityAnalysis.statusText}` : ''}</span>
              <span><b>Final URL:</b> {securityAnalysis.finalUrl}</span>
              {securityAnalysis.redirects.length > 0 ? <span><b>Redirects:</b> {securityAnalysis.redirects.length}</span> : null}
              <span>{securityAnalysis.responseMessage}</span>
              {securityAnalysis.responseWarning ? <span className="security-response-warning">{securityAnalysis.responseWarning}</span> : null}
            </div>
            {showSecurityDetails ? (
              <div className="security-details">
                {securityAnalysis.headers.map((header) => (
                  <article className={`security-detail ${header.status}`} key={header.name}>
                    <h3>
                      {header.status === 'present' ? <Check aria-hidden="true" size={16} /> : header.status === 'review' ? <AlertTriangle aria-hidden="true" size={16} /> : <X aria-hidden="true" size={16} />}
                      {header.name}
                    </h3>
                    <strong>{securityHeaderStatusLabel(header.status, securityAnalysis.responseContext)}</strong>
                    {header.value ? <p><b>Value:</b> {header.value}</p> : null}
                    <p>{header.explanation}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="security-empty">Analyze an opened URL to check its response headers.</p>
        )}
        {securityError ? <p className="security-error" role="alert">{securityError}</p> : null}
      </section> : null}
      <section className="workspace" aria-label="Browser workspace">
        <div className={showStructuredData ? 'workspace-content workspace-content-expanded' : 'workspace-content'}>
          <div className="action-recording-heading">
            <p className="eyebrow">Action Recording</p>
            <div className="recording-workflow-controls">
              {isRecording ? (
                <button type="button" className="recording-stop-button" onClick={() => void stopRecording()} disabled={isBusy}>
                  Stop Recording
                </button>
              ) : hasRecordingSession ? (
                <>
                  <button type="button" onClick={() => void continueRecording()} disabled={isBusy || isSpecTestRunning || testRunProgress?.status === 'running'}>
                    Continue Recording
                  </button>
                  <button type="button" onClick={() => void startNewRecording()} disabled={isBusy || isSpecTestRunning || testRunProgress?.status === 'running'}>
                    New Recording
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => void startNewRecording()} disabled={isBusy || isSpecTestRunning || testRunProgress?.status === 'running'}>
                  Start Recording
                </button>
              )}
            </div>
          </div>
          <h1 className="status-heading" title={status}>{status}</h1>
          <p>Use the controls above to drive the Chromium window and capture actions for replay later.</p>

          <div className="recording-panel">
            <div className="recording-header">
              <div className="recording-title">
                <span className={isRecording ? 'recording-indicator active' : 'recording-indicator'} aria-hidden="true" />
                <strong>{isRecording ? 'Recording in progress' : hasRecordingSession ? 'Recording stopped' : 'Ready to record'}</strong>
              </div>
              {!showStructuredData && recordedActions.length > 0 ? (
                <button type="button" className="data-toggle" onClick={() => setShowStructuredData(true)}>
                  View JSON
                </button>
              ) : null}
            </div>

            <div className={showStructuredData && recordedActions.length > 0 ? 'recording-body with-data' : 'recording-body'}>
              <div className="recording-column">
                {showStructuredData && recordedActions.length > 0 ? <strong className="recording-column-title">Actions</strong> : null}
                {recordedActions.length > 0 ? (
                  <ul className="recorded-actions">
                    {recordedActions.map((action, index) => (
                      <li
                        className={dragOverActionIndex === index ? 'recorded-action-drop-target' : ''}
                        key={`${action.type}-${index}`}
                        onDragOver={(event) => {
                          if (isRecording || isEditingActionsJson || testRunProgress?.status === 'running') return;
                          event.preventDefault();
                          setDragOverActionIndex(index);
                        }}
                        onDragLeave={() => setDragOverActionIndex(null)}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (isRecording || isEditingActionsJson || testRunProgress?.status === 'running') return;
                          const fromIndex = Number(event.dataTransfer.getData('text/plain'));
                          if (Number.isInteger(fromIndex)) moveAction(fromIndex, index);
                        }}
                      >
                        <button
                          className="action-drag-handle"
                          type="button"
                          draggable={!isRecording && !isEditingActionsJson && testRunProgress?.status !== 'running'}
                          disabled={isRecording || isEditingActionsJson || testRunProgress?.status === 'running'}
                          aria-label={`Move step ${index + 1}; use up or down arrow keys`}
                          title="Drag to reorder; use up or down arrow keys"
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', String(index));
                          }}
                          onDragEnd={() => setDragOverActionIndex(null)}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowUp' && index > 0) {
                              event.preventDefault();
                              moveAction(index, index - 1);
                            } else if (event.key === 'ArrowDown' && index < recordedActions.length - 1) {
                              event.preventDefault();
                              moveAction(index, index + 1);
                            }
                          }}
                        >
                          <GripVertical aria-hidden="true" size={16} />
                        </button>
                        <span className="action-number" aria-label={`Action ${index + 1}`}>{index + 1}.</span>
                        <span className={`action-type ${action.type.startsWith('assert-') ? 'assertion' : ''}`}>
                          {action.type.startsWith('assert-') ? 'Assertion' : action.type === 'check' ? 'Check' : action.type === 'uncheck' ? 'Uncheck' : 'Action'}
                        </span>
                        {action.type === 'assert-url' ? <span className="action-detail">URL contains {JSON.stringify(action.value)}</span> : null}
                        {action.type === 'assert-text' ? <span className="action-detail">Text {JSON.stringify(action.text)} is visible</span> : null}
                        {action.type === 'assert-title' ? <span className="action-detail">Page title {JSON.stringify(action.title)}</span> : null}
                        {action.type === 'assert-state' ? <span className="action-detail">{action.playwright ?? action.selector} is {action.state}</span> : null}
                        {action.type === 'assert-element' ? <span className="action-detail">{action.playwright ?? action.selector} exists</span> : null}
                        {action.type === 'navigate' ? <span className="action-detail">Navigate</span> : null}
                        {action.type === 'click' ? <span className="action-detail">Click</span> : null}
                        {action.type === 'fill' ? <span className="action-detail">Fill</span> : null}
                        {action.type === 'submit' ? <span className="action-detail">Press Enter</span> : null}
                        {'url' in action && action.url ? <span className="action-detail" title={action.url}>{action.url}</span> : null}
                        {'selector' in action && action.selector && !action.type.startsWith('assert-') ? (
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
                        <button
                          className="action-delete-button"
                          type="button"
                          aria-label={`Delete step ${index + 1}`}
                          title="Delete step"
                          disabled={isRecording || isEditingActionsJson || testRunProgress?.status === 'running'}
                          onClick={() => deleteAction(index)}
                        >
                          <Trash2 aria-hidden="true" size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-recording">No recorded actions yet.</p>
                )}
              </div>

              {showStructuredData && recordedActions.length > 0 ? (
                <div className="structured-data-panel">
                  <div className="action-json-header">
                    <strong className="recording-column-title">Action JSON</strong>
                    <div className="action-json-controls">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditingActionsJson) cancelActionsJsonEdit();
                          setShowStructuredData(false);
                        }}
                      >
                        Hide JSON
                      </button>
                      {isEditingActionsJson ? (
                        <>
                          <button type="button" onClick={cancelActionsJsonEdit}>Cancel</button>
                          <button type="button" onClick={applyActionsJsonEdit}>Apply JSON</button>
                        </>
                      ) : (
                        <button type="button" onClick={editActionsJson} disabled={isRecording || testRunProgress?.status === 'running'}>
                          Edit JSON
                        </button>
                      )}
                    </div>
                  </div>
                  {isEditingActionsJson ? (
                    <textarea
                      className="structured-data structured-data-editor"
                      aria-label="Edit action JSON"
                      spellCheck={false}
                      value={actionJsonDraft}
                      onChange={(event) => setActionJsonDraft(event.target.value)}
                    />
                  ) : (
                    <pre className="structured-data" aria-label="Action JSON data">
                      {JSON.stringify(recordedActions, null, 2)}
                    </pre>
                  )}
                  {actionJsonError ? <p className="action-json-error" role="alert">{actionJsonError}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="structured-data-actions">
              <div className="structured-data-action-group">
                {!testRunProgress || testRunProgress.status !== 'running' ? (
                  <button className="flow-action-button run" type="button" onClick={() => void runTest()} disabled={isBusy || isRecording || isEditingActionsJson || recordedActions.length === 0}>
                    <Play aria-hidden="true" size={15} fill="currentColor" />Run Test
                  </button>
                ) : (
                  <button className="flow-action-button stop" type="button" onClick={() => void stopTest()}>
                    <X aria-hidden="true" size={15} />Stop Test
                  </button>
                )}
                <button className="flow-action-button assertion" type="button" onClick={() => setShowAssertionForm((visible) => !visible)} disabled={isBusy || isEditingActionsJson || testRunProgress?.status === 'running'}>
                  {showAssertionForm ? <X aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}
                  {showAssertionForm ? 'Cancel Assertion' : 'Add Assertion'}
                </button>
              </div>
              <div className="structured-data-action-group">
                <button className="flow-action-button utility" type="button" onClick={() => void exportPlaywrightTest()} disabled={isBusy || isEditingActionsJson || recordedActions.length === 0}>
                  <Code2 aria-hidden="true" size={16} />Export Playwright
                </button>
                <button className="flow-action-button utility" type="button" onClick={() => void saveRecording()} disabled={isBusy || isEditingActionsJson || recordedActions.length === 0}>
                  <Save aria-hidden="true" size={16} />Save JSON
                </button>
              </div>
            </div>
            {showAssertionForm ? (
              <form className="assertion-form" onSubmit={(event) => void addAssertion(event)}>
                <label>
                  Assertion
                  <select value={assertionType} onChange={(event) => setAssertionType(event.target.value as typeof assertionType)}>
                    <option value="assert-url">URL contains</option>
                    <option value="assert-text">Text is visible</option>
                    <option value="assert-element">Element Exists</option>
                    <option value="assert-title">Page title</option>
                    <option value="assert-state">Element State</option>
                  </select>
                </label>
                <label>
                  {assertionType === 'assert-url' ? 'Value' : assertionType === 'assert-text' ? 'Text' : assertionType === 'assert-title' ? 'Expected title' : 'Locator'}
                  <input
                    autoFocus
                    value={assertionValue}
                    onChange={(event) => setAssertionValue(event.target.value)}
                    placeholder={assertionType === 'assert-url' ? '/dashboard' : assertionType === 'assert-text' ? 'Welcome' : assertionType === 'assert-title' ? 'Dashboard' : '#logout or getByText("Log in", { exact: true })'}
                  />
                </label>
                {assertionType === 'assert-state' ? (
                  <label>
                    State
                    <select value={assertionState} onChange={(event) => setAssertionState(event.target.value as typeof assertionState)}>
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                      <option value="checked">Checked</option>
                      <option value="visible">Visible</option>
                    </select>
                  </label>
                ) : null}
                <button className="flow-action-button assertion" type="submit">
                  <Plus aria-hidden="true" size={16} />Add to test flow
                </button>
              </form>
            ) : null}
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
                <button className="flow-action-button run" type="button" onClick={() => void runSpecTest()} disabled={!loadedSpecFile || isBusy || isRecording || testRunProgress?.status === 'running'}>
                  <Play aria-hidden="true" size={15} fill="currentColor" />Run Test
                </button>
              ) : (
                <button className="flow-action-button stop" type="button" onClick={() => void stopSpecTest()}>
                  <X aria-hidden="true" size={15} />Stop Test
                </button>
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
              <button className="flow-action-button utility" type="submit" disabled={isBusy}><MousePointerClick aria-hidden="true" size={16} />Click selector</button>
              <button className="flow-action-button utility" type="button" disabled={isBusy} onClick={() => void run(() => {
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
