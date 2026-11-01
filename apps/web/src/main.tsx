import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LangProvider } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import './index.css';

// Installable app: the manifest drives the prompt and `sw.js` answers an offline
// navigation with the app's own page. Registration never blocks rendering, and
// an origin that refuses service workers (private mode, a cross-origin frame)
// simply keeps the plain web app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No install prompt here; everything else works as before.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
