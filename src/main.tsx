import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/ui/Toast'
import SingleClickGuard from './components/ui/SingleClickGuard'

const CHUNK_RELOAD_KEY = 'wicars:chunk-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
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
