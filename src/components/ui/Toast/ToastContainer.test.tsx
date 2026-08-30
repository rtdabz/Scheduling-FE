import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
