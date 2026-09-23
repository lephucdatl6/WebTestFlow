import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, MousePointerClick, RotateCw, Type } from 'lucide-react';

function App() {
  const [url, setUrl] = useState('https://example.com');
  const [selector, setSelector] = useState('');
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('Chromium is closed');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

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
        <button type="button" disabled={isBusy} onClick={() => void run(() => window.webTestFlow.close(), 'Chromium is closed')}>
          Close
        </button>
      </form>
      <section className="workspace" aria-label="Browser workspace">
        <div className="workspace-content">
          <p className="eyebrow">Phase 2 / Playwright</p>
          <h1>{status}</h1>
          <p>Use the controls above to drive the Chromium window opened by Playwright.</p>
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
