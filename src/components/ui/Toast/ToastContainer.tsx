import React from 'react'
import { useToast } from '../../../context/ToastContext'
import Toast from './Toast'

export default function ToastContainer() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <div className="flex flex-col gap-3 pointer-events-auto">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  )
}
