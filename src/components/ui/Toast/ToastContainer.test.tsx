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

function LoadingTrigger() {
  const { toast } = useToast()

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const id = toast.loading('Saving schedule', 'This can take a moment.')
          window.setTimeout(() => toast.update(id, { type: 'success', title: 'Schedule saved', message: 'The schedule is ready for review.' }), 10_000)
        }}
      >
        Trigger loading
      </button>
      <button
        type="button"
        onClick={() => {
          const id = toast.loading('Saving schedule')
          window.setTimeout(() => toast.update(id, { type: 'error', title: 'Schedule could not be saved', message: 'Room 204 is occupied.' }), 10_000)
        }}
      >
        Trigger failing load
      </button>
    </>
  )
}

const renderToasts = (children: React.ReactNode) => render(
  <ToastProvider>
    {children}
    <ToastContainer />
  </ToastProvider>,
)

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('ToastContainer notification presentation', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows every kind as a toast and never opens a blocking dialog', () => {
    vi.useFakeTimers()
    renderToasts(<NotificationTriggers />)

    fireEvent.click(screen.getByRole('button', { name: 'Trigger success' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trigger error' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trigger warning' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Schedule saved').closest('[data-type]')?.getAttribute('data-type')).toBe('success')
    expect(screen.getByRole('alert').getAttribute('data-type')).toBe('error')
    expect(screen.getByText('Room 204 is already occupied on Monday from 9:00 AM to 10:30 AM.')).toBeTruthy()
    expect(screen.getByText('Conflict detected').closest('[data-type]')?.getAttribute('data-type')).toBe('warning')
  })

  it('keeps errors on screen longer than successes', () => {
    vi.useFakeTimers()
    renderToasts(<NotificationTriggers />)

    fireEvent.click(screen.getByRole('button', { name: 'Trigger success' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trigger error' }))

    advance(4000)
    expect(screen.queryByText('Schedule saved')).toBeNull()
    expect(screen.getByText('Schedule could not be saved')).toBeTruthy()

    advance(2500)
    expect(screen.queryByText('Schedule could not be saved')).toBeNull()
  })

  it('dismisses a toast from its close button', () => {
    vi.useFakeTimers()
    renderToasts(<NotificationTriggers />)

    fireEvent.click(screen.getByRole('button', { name: 'Trigger error' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Schedule could not be saved' }))
    advance(300)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('holds a toast open while it is hovered', () => {
    vi.useFakeTimers()
    renderToasts(<NotificationTriggers />)

    fireEvent.click(screen.getByRole('button', { name: 'Trigger success' }))
    fireEvent.mouseEnter(screen.getByRole('status'))
    advance(10_000)
    expect(screen.getByText('Schedule saved')).toBeTruthy()

    fireEvent.mouseLeave(screen.getByRole('status'))
    advance(4000)
    expect(screen.queryByText('Schedule saved')).toBeNull()
  })

  it('does not stack a copy of a toast that is already showing', () => {
    vi.useFakeTimers()
    renderToasts(<NotificationTriggers />)

    const trigger = screen.getByRole('button', { name: 'Trigger error' })
    fireEvent.click(trigger)
    advance(4000)
    fireEvent.click(trigger)

    expect(screen.getAllByRole('alert')).toHaveLength(1)

    // Raising it again restarted the countdown.
    advance(4000)
    expect(screen.getByRole('alert')).toBeTruthy()
    advance(2500)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps a loading toast until it turns into a success, which then auto-dismisses', () => {
    vi.useFakeTimers()
    renderToasts(<LoadingTrigger />)

    fireEvent.click(screen.getByRole('button', { name: 'Trigger loading' }))
    advance(9000)
    expect(screen.getByRole('status').getAttribute('data-type')).toBe('loading')
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Trigger loading' })).toBeTruthy()

    advance(1000)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').getAttribute('data-type')).toBe('success')
    expect(screen.getByText('Schedule saved')).toBeTruthy()
    expect(screen.queryByText('Saving schedule')).toBeNull()

    advance(4000)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('turns a loading toast into an error', () => {
    vi.useFakeTimers()
    renderToasts(<LoadingTrigger />)

    fireEvent.click(screen.getByRole('button', { name: 'Trigger failing load' }))
    advance(10_000)

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('alert').getAttribute('data-type')).toBe('error')
    expect(screen.getByText('Room 204 is occupied.')).toBeTruthy()
  })
})
