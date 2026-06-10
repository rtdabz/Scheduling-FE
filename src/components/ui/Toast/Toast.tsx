import React from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import type { ToastItem } from '../../../context/ToastContext'

interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

const BORDER_COLORS = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#C9952A',
  info: '#3b82f6',
}

const ICON_COLORS = BORDER_COLORS

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = ICONS[toast.type]
  const color = BORDER_COLORS[toast.type]

  return (
    <div
      className={`
        relative min-w-[320px] max-w-[400px] bg-[#1C0507]/95 backdrop-blur-md 
        rounded-2xl shadow-2xl shadow-black/40 border border-white/10 border-l-4
        overflow-hidden px-4 py-3.5 flex items-start gap-3
        ${toast.exiting ? 'animate-toastOut' : 'animate-toastIn'}
      `}
      style={{ borderLeftColor: color }}
    >
      <Icon size={22} style={{ color: ICON_COLORS[toast.type] }} className="flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white">{toast.title}</h4>
        <p className="text-xs text-[#E8D5C4]/80">{toast.message}</p>
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="text-[#E8D5C4]/50 hover:text-white transition-colors p-1"
      >
        <X size={16} />
      </button>

      {/* Progress Bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5"
        style={{
          backgroundColor: color,
          animation: `toastProgress ${toast.duration || 4000}ms linear forwards`
        }}
      />
    </div>
  )
}
