import { useToast } from '../../../context/ToastContext'
import ConfirmModal from '../ConfirmModal'
import Toast from './Toast'

export default function ToastContainer() {
  const { toasts, dismiss, confirmRequest, isConfirming, resolveConfirm } = useToast()

  return (
    <>
      {/* Sits above open dialogs so a failure raised from inside one is still readable, and never
          captures clicks outside the toasts themselves. */}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-3 top-3 z-[10050] flex flex-col items-end gap-2.5 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[360px]"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmRequest !== null}
        appearance={confirmRequest?.appearance}
        eyebrow={confirmRequest?.eyebrow ?? 'Confirmation Required'}
        title={confirmRequest?.title ?? ''}
        message={confirmRequest?.message ?? ''}
        confirmLabel={confirmRequest?.confirmLabel ?? 'Confirm'}
        cancelLabel={confirmRequest?.cancelLabel ?? 'Cancel'}
        variant={confirmRequest?.variant ?? 'warning'}
        isConfirming={isConfirming}
        onCancel={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
      />
    </>
  )
}
