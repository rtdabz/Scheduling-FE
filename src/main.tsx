import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/ui/Toast'
import SingleClickGuard from './components/ui/SingleClickGuard'

// A page chunk that fails to load (usually stale hashes after a new deploy)
// is remembered by React.lazy, so its menu stayed dead until a manual refresh.
// Reload once to pick up the current build; the timestamp guard stops a loop
// when the server itself is unreachable.
const CHUNK_RELOAD_KEY = 'wicars:chunk-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: still reload once for this page load.
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <SingleClickGuard>
        <App />
      </SingleClickGuard>
      <ToastContainer />
    </ToastProvider>
  </StrictMode>,
)
