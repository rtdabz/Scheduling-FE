import { useToast } from '../../../context/ToastContext'
import ConfirmModal from '../ConfirmModal'
import Toast from './Toast'

export default function ToastContainer() {
  const { toasts, modalNotices, dismiss, dismissModalNotice } = useToast()
  const activeNotice = modalNotices[0] ?? null
  const closeActiveNotice = () => {
    if (activeNotice) dismissModalNotice(activeNotice.id)
  }

  const noticePresentation = activeNotice?.type === 'error'
    ? { eyebrow: 'System Error', variant: 'error' as const }
    : activeNotice?.type === 'warning'
      ? { eyebrow: 'System Warning', variant: 'warning' as const }
      : { eyebrow: 'System Notice', variant: 'info' as const }

  return (
    <>
      <div className="pointer-events-none fixed right-3 top-3 z-[9999] flex w-[calc(100vw-1.5rem)] flex-col gap-3 sm:right-6 sm:top-6 sm:w-auto">
        <div className="pointer-events-auto flex flex-col gap-3">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>

      <ConfirmModal
        isOpen={activeNotice !== null}
        eyebrow={noticePresentation.eyebrow}
        title={activeNotice?.title ?? 'System notice'}
        message={activeNotice?.message ?? ''}
        confirmLabel="Close"
        variant={noticePresentation.variant}
        showCancel={false}
        onCancel={closeActiveNotice}
        onConfirm={closeActiveNotice}
      />
    </>
  )
}
