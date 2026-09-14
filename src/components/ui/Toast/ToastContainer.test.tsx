import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '../../../context/ToastContext'
import ToastContainer from './ToastContainer'

function NotificationTriggers() {
  const { toast } = useToast()

  return (
    <>
      <button
        type="button"
        onClick={() => toast.success('Schedule saved', 'The schedule is ready for review.')}
      >
        Trigger success
      </button>
      <button
        type="button"
        onClick={() => toast.error('Schedule could not be saved', 'Room 204 is already occupied on Monday from 9:00 AM to 10:30 AM.')}
      >
        Trigger error
      </button>
      <button
        type="button"
        onClick={() => toast.warning('Conflict detected', 'The instructor has another class during this period.')}
      >
        Trigger warning
      </button>
    </>
  )
}

function ConfirmTrigger({ onAnswer }: { onAnswer: (answer: boolean) => void }) {
  const { confirm } = useToast()

  return (
    <button
      type="button"
      onClick={() => {
        void confirm({
          title: 'Archive Room',
          message: 'This room will be hidden from active lists.',
          confirmLabel: 'Confirm Archive',
          variant: 'danger',
        }).then(onAnswer)
      }}
    >
      Trigger confirm
    </button>
  )
}

describe('ToastContainer confirmations', () => {
  afterEach(cleanup)

  it('asks through the shared modal and resolves true when confirmed', async () => {
    const onAnswer = vi.fn()
    render(
      <ToastProvider>
        <ConfirmTrigger onAnswer={onAnswer} />
        <ToastContainer />
      </ToastProvider>,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Trigger confirm' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Archive Room')).toBeTruthy()
    expect(screen.getByText('This room will be hidden from active lists.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }))
    })

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('resolves false when cancelled', async () => {
    const onAnswer = vi.fn()
    render(
      <ToastProvider>
        <ConfirmTrigger onAnswer={onAnswer} />
        <ToastContainer />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Trigger confirm' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('settles a question that is superseded before it is answered', async () => {
    const onAnswer = vi.fn()
    render(
      <ToastProvider>
        <ConfirmTrigger onAnswer={onAnswer} />
        <ToastContainer />
      </ToastProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger confirm' })
    await act(async () => {
      fireEvent.click(trigger)
      fireEvent.click(trigger)
    })

    // The first promise must not be left hanging when a second question replaces it.
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('keeps the modal open and locked while the confirmed action runs', async () => {
    let finish!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const onAnswer = vi.fn()

    function ActionTrigger() {
      const { confirm } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            void confirm({ title: 'Approve Schedule', message: 'Approve?', confirmLabel: 'Confirm Approve', onConfirm: action }).then(onAnswer)
          }}
        >
          Trigger action confirm
        </button>
      )
    }

    render(
      <ToastProvider>
        <ActionTrigger />
        <ToastContainer />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Trigger action confirm' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    })

    expect(action).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Confirm Approve/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    expect(onAnswer).not.toHaveBeenCalled()

    await act(async () => { finish() })

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ToastContainer notification presentation', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows success as a toast and opens errors directly in the shared modal', () => {
    vi.useFakeTimers()

    render(
      <ToastProvider>
        <NotificationTriggers />
        <ToastContainer />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Trigger success' }))
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Schedule saved')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Trigger error' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('System Error')).toBeTruthy()
    expect(screen.getByText('Schedule could not be saved')).toBeTruthy()
    expect(screen.getByText('Room 204 is already occupied on Monday from 9:00 AM to 10:30 AM.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens warnings directly in the shared modal', () => {
    render(
      <ToastProvider>
        <NotificationTriggers />
        <ToastContainer />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Trigger warning' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('System Warning')).toBeTruthy()
    expect(screen.getByText('Conflict detected')).toBeTruthy()
    expect(screen.getByText('The instructor has another class during this period.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
