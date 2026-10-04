import { createContext, useContext, useRef, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ConfirmModalVariant } from '../components/ui/ConfirmModal'

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

export interface ConfirmOptions {
  title: string
  message: string
  eyebrow?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmModalVariant
  onConfirm?: () => unknown
}

export interface ConfirmRequest extends ConfirmOptions {
  id: string
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
  confirm: (options: ConfirmOptions) => Promise<boolean>
  confirmRequest: ConfirmRequest | null
  isConfirming: boolean
  resolveConfirm: (answer: boolean) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [modalNotices, setModalNotices] = useState<ModalNoticeItem[]>([])
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const pendingConfirm = useRef<((answer: boolean) => void) | null>(null)
  const pendingAction = useRef<ConfirmOptions['onConfirm']>(undefined)
  const confirmingRef = useRef(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )

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
          return next.slice(1)
        }
        return next
      })

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

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        pendingConfirm.current?.(false)
        pendingConfirm.current = resolve
        pendingAction.current = options.onConfirm
        setConfirmRequest({ ...options, id: crypto.randomUUID() })
      }),
    []
  )

  const resolveConfirm = useCallback((answer: boolean) => {
    if (confirmingRef.current) return

    const resolve = pendingConfirm.current
    const action = answer ? pendingAction.current : undefined
    const settle = () => {
      if (pendingConfirm.current === resolve) {
        pendingConfirm.current = null
        pendingAction.current = undefined
        setConfirmRequest(null)
      }
      resolve?.(answer)
    }

    if (!action) {
      settle()
      return
    }

    confirmingRef.current = true
    setIsConfirming(true)
    void (async () => {
      try {
        await action()
      } catch (error) {
        console.error(error)
      } finally {
        confirmingRef.current = false
        setIsConfirming(false)
        settle()
      }
    })()
  }, [])

  const toastApi = useMemo(() => ({
    success: (title: string, message: string, duration?: number) => addToast(title, message, duration),
    error: (title: string, message: string, _duration?: number) => addModalNotice('error', title, message),
    warning: (title: string, message: string, _duration?: number) => addModalNotice('warning', title, message),
    info: (title: string, message: string, _duration?: number) => addModalNotice('info', title, message),
  }), [addModalNotice, addToast])

  return (
    <ToastContext.Provider
      value={{
        toasts,
        modalNotices,
        toast: toastApi,
        dismiss,
        dismissModalNotice,
        confirm,
        confirmRequest,
        isConfirming,
        resolveConfirm,
      }}
    >
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
