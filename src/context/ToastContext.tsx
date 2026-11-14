import { createContext, useContext, useRef, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ConfirmModalVariant } from '../components/ui/ConfirmModal'
import { isSessionEnded } from '../lib/sessionEnded'

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading'

/** How long each kind stays on screen. Loading toasts stay until they are updated or dismissed. */
const TOAST_DURATIONS: Record<Exclude<ToastType, 'loading'>, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 6000,
}

const MAX_TOASTS = 5
const EXIT_MS = 200

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message: string
  /** Milliseconds before auto-dismiss; undefined keeps the toast until it is dismissed. */
  duration?: number
  /** Bumped whenever the toast is re-raised or updated, so its countdown restarts. */
  revision: number
  exiting?: boolean
}

export interface ToastUpdate {
  type?: ToastType
  title?: string
  message?: string
  duration?: number
}

export interface ConfirmOptions {
  title: string
  message: ReactNode
  eyebrow?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmModalVariant
  appearance?: 'default' | 'workflow'
  onConfirm?: () => unknown
}

export interface ConfirmRequest extends ConfirmOptions {
  id: string
}

export interface ToastApi {
  success: (title: string, message: string, duration?: number) => string
  error: (title: string, message: string, duration?: number) => string
  warning: (title: string, message: string, duration?: number) => string
  info: (title: string, message: string, duration?: number) => string
  /** Stays on screen until `update` turns it into a result or `dismiss` removes it. */
  loading: (title: string, message?: string) => string
  /** Change an existing toast in place, e.g. loading -> success or error. */
  update: (id: string, changes: ToastUpdate) => void
  dismiss: (id: string) => void
}

interface ToastContextValue {
  toasts: ToastItem[]
  toast: ToastApi
  dismiss: (id: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  confirmRequest: ConfirmRequest | null
  isConfirming: boolean
  resolveConfirm: (answer: boolean) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToastState] = useState<ToastItem[]>([])
  // Mirrors the state so a toast's id is known the moment it is raised, not after the next render.
  const toastsRef = useRef<ToastItem[]>([])
  const setToasts = useCallback((change: (prev: ToastItem[]) => ToastItem[]) => {
    toastsRef.current = change(toastsRef.current)
    setToastState(toastsRef.current)
  }, [])
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
      setToasts((prev) => prev.filter((t) => t.id !== id || !t.exiting))
    }, EXIT_MS)
  }, [setToasts])

  const addToast = useCallback(
    (type: ToastType, title: string, message: string, duration?: number) => {
      // After the session ends, requests still in flight reject; the session-ended screen explains
      // what happened, so their failure notices would only stack up behind it.
      if (type !== 'success' && type !== 'loading' && isSessionEnded()) return ''

      const lifetime = type === 'loading' ? undefined : duration ?? TOAST_DURATIONS[type]
      let id: string = crypto.randomUUID()

      setToasts((prev) => {
        // The same notice raised again while it is still showing restarts its countdown
        // instead of stacking a copy.
        const twin = prev.find((t) => !t.exiting && t.type === type && t.title === title && t.message === message)
        if (twin) {
          id = twin.id
          return prev.map((t) => (t === twin ? { ...t, duration: lifetime, revision: t.revision + 1 } : t))
        }

        const next = [...prev, { id, type, title, message, duration: lifetime, revision: 0 }]
        if (next.length <= MAX_TOASTS) return next
        // Make room by dropping the oldest toast that is not still reporting progress.
        const oldest = next.findIndex((t) => t.type !== 'loading')
        return next.filter((_, index) => index !== (oldest === -1 ? 0 : oldest))
      })

      return id
    },
    [setToasts]
  )

  const updateToast = useCallback((id: string, changes: ToastUpdate) => {
    setToasts((prev) => prev.map((t) => {
      if (t.id !== id) return t
      const type = changes.type ?? t.type
      return {
        ...t,
        ...changes,
        type,
        duration: type === 'loading' ? undefined : changes.duration ?? TOAST_DURATIONS[type],
        revision: t.revision + 1,
        exiting: false,
      }
    }))
  }, [setToasts])

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

  const toastApi = useMemo<ToastApi>(() => ({
    success: (title, message, duration) => addToast('success', title, message, duration),
    error: (title, message, duration) => addToast('error', title, message, duration),
    warning: (title, message, duration) => addToast('warning', title, message, duration),
    info: (title, message, duration) => addToast('info', title, message, duration),
    loading: (title, message = '') => addToast('loading', title, message),
    update: updateToast,
    dismiss,
  }), [addToast, dismiss, updateToast])

  return (
    <ToastContext.Provider
      value={{
        toasts,
        toast: toastApi,
        dismiss,
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
