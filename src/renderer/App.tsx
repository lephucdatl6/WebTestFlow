import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, MousePointerClick, RotateCw, Type } from 'lucide-react';

type RecordedAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string; playwright?: string; description?: string }
  | { type: 'fill'; selector: string; value: string; playwright?: string; description?: string }
  | { type: 'submit'; selector: string; playwright?: string; description?: string };

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
        if (!isBrowserOpen && status !== 'Chromium is closed') {
          setIsRecording(false);
          setRecordedActions([]);
          setShowStructuredData(false);
          setStatus('Chromium is closed');
        }
      } catch {
        // The browser status check is best-effort while the app is closing.
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [status]);

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
      await window.webTestFlow.startRecording();
      setRecordedActions([]);
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

  function downloadStructuredData() {
    const data = JSON.stringify(recordedActions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'webtestflow-recording.json';
    link.click();
    URL.revokeObjectURL(downloadUrl);
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
        <button type="button" disabled={isBusy} onClick={() => void closeBrowser()}>
          Close
        </button>
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
                  <div className="structured-data-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={downloadStructuredData}
                      aria-label="Download action JSON"
                      title="Download action JSON"
                    >
                      <Download aria-hidden="true" size={16} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

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
