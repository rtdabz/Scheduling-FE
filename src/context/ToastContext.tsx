import { createContext, useContext, useState, useCallback, useMemo } from 'react'
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

export interface ModalNoticeItem {
  id: string
  type: Exclude<ToastType, 'success'>
  title: string
  message: string
}

interface ToastContextValue {
  toasts: ToastItem[]
  modalNotices: ModalNoticeItem[]
  toast: {
    success: (title: string, message: string, duration?: number) => void
    error: (title: string, message: string, duration?: number) => void
    warning: (title: string, message: string, duration?: number) => void
    info: (title: string, message: string, duration?: number) => void
  }
  dismiss: (id: string) => void
  dismissModalNotice: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [modalNotices, setModalNotices] = useState<ModalNoticeItem[]>([])

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
    (title: string, message: string, duration = 2500) => {
      const id = crypto.randomUUID()
      const newToast: ToastItem = { id, type: 'success', title, message, duration }

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

  const addModalNotice = useCallback((type: ModalNoticeItem['type'], title: string, message: string) => {
    setModalNotices((prev) => [...prev, { id: crypto.randomUUID(), type, title, message }])
  }, [])

  const dismissModalNotice = useCallback((id: string) => {
    setModalNotices((prev) => prev.filter((notice) => notice.id !== id))
  }, [])

  const toastApi = useMemo(() => ({
    success: (title: string, message: string, duration?: number) => addToast(title, message, duration),
    error: (title: string, message: string, _duration?: number) => addModalNotice('error', title, message),
    warning: (title: string, message: string, _duration?: number) => addModalNotice('warning', title, message),
    info: (title: string, message: string, _duration?: number) => addModalNotice('info', title, message),
  }), [addModalNotice, addToast])

  return (
    <ToastContext.Provider value={{ toasts, modalNotices, toast: toastApi, dismiss, dismissModalNotice }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
