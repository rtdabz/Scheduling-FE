import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import Modal from './Modal';

afterEach(() => cleanup());

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open details</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Record details" footer={<button type="button" onClick={() => setOpen(false)}>Done</button>}>
        <p>Body</p>
      </Modal>
    </>
  );
}

describe('Modal focus management', () => {
  it('moves focus into the dialog, keeps Tab inside it, and returns focus to the opener', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open details' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    const done = screen.getByRole('button', { name: 'Done' });
    done.focus();
    fireEvent.keyDown(done, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close modal' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
