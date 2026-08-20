import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/ui/Toast'
import SingleClickGuard from './components/ui/SingleClickGuard'

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
