import { FormEvent, useState } from 'react';

function App() {
  const [url, setUrl] = useState('https://example.com');

  async function openUrl(event: FormEvent) {
    event.preventDefault();
    const finalUrl = await window.webTestFlow.openUrl(url);
    setUrl(finalUrl);
  }

  return (
    <main className="app">
      <form className="toolbar" onSubmit={openUrl}>
        <span className="brand">WebTestFlow</span>
        <button type="button" onClick={() => void window.webTestFlow.goBack()} aria-label="Go back">
          Back
        </button>
        <button type="button" onClick={() => void window.webTestFlow.goForward()} aria-label="Go forward">
          Forward
        </button>
        <button type="button" onClick={() => void window.webTestFlow.reload()} aria-label="Reload page">
          Reload
        </button>
        <input
          className="url-input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
          aria-label="Website URL"
        />
        <button type="submit">Open</button>
      </form>
      <section className="workspace" aria-label="Browser workspace">
        Browser view will appear here.
      </section>
    </main>
  );
}

export default App;
