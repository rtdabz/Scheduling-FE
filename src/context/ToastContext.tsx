import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message: string
  duration?: number
  exiting?: boolean
}

interface ToastContextValue {
  toasts: ToastItem[]
  toast: {
    success: (title: string, message: string, duration?: number) => void
    error: (title: string, message: string, duration?: number) => void
    warning: (title: string, message: string, duration?: number) => void
    info: (title: string, message: string, duration?: number) => void
  }
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )

    // Wait for exit animation then remove
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }, [])

  const addToast = useCallback(
    (type: ToastType, title: string, message: string, duration = 2500) => {
      const id = crypto.randomUUID()
      const newToast: ToastItem = { id, type, title, message, duration }

      setToasts((prev) => {
        const next = [...prev, newToast]
        if (next.length > 5) {
          return next.slice(1) // Remove oldest
        }
        return next
      })

      // Auto dismiss
      setTimeout(() => {
        dismiss(id)
      }, duration)
    },
    [dismiss]
  )

  const toastApi = {
    success: (title: string, message: string, duration?: number) => addToast('success', title, message, duration),
    error: (title: string, message: string, duration?: number) => addToast('error', title, message, duration),
    warning: (title: string, message: string, duration?: number) => addToast('warning', title, message, duration),
    info: (title: string, message: string, duration?: number) => addToast('info', title, message, duration),
  }

  return (
    <ToastContext.Provider value={{ toasts, toast: toastApi, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
