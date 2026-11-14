import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
import type { ToastItem, ToastType } from '../../../context/ToastContext'

interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

const ICONS: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  const { id, type, title, message, duration, revision, exiting } = toast
  const Icon = ICONS[type]
  const [paused, setPaused] = useState(false)
  const remaining = useRef(duration ?? 0)

  // A new revision (re-raised or updated toast) starts the countdown over.
  useEffect(() => {
    remaining.current = duration ?? 0
  }, [duration, revision])

  // Hovering or focusing a toast holds it open, so a long message can be read in full.
  useEffect(() => {
    if (duration === undefined || paused || exiting) return
    const startedAt = Date.now()
    const timer = setTimeout(() => onDismiss(id), remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(remaining.current - (Date.now() - startedAt), 0)
    }
  }, [duration, exiting, id, onDismiss, paused, revision])

  const urgent = type === 'error' || type === 'warning'

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-busy={type === 'loading' || undefined}
      data-type={type}
      data-paused={paused}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`wicars-toast ${exiting ? 'animate-toastOut' : 'animate-toastIn'}`}
    >
      <Icon size={18} aria-hidden="true" className={`wicars-toast-icon ${type === 'loading' ? 'animate-spin' : ''}`} />

      <div className="min-w-0 flex-1">
        <p className="break-words text-[13px] font-semibold leading-5 text-text">{title}</p>
        {message && (
          <p className={`mt-0.5 break-words text-xs leading-[1.125rem] text-muted ${urgent ? 'line-clamp-6' : 'line-clamp-3'}`}>{message}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label={`Dismiss ${title}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-parchment hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X size={14} />
      </button>

      {duration !== undefined && !exiting && (
        <span key={revision} aria-hidden="true" className="wicars-toast-progress" style={{ animationDuration: `${duration}ms` }} />
      )}
    </div>
  )
}
