import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('dismisses only the top dialog when Escape is pressed', () => {
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    render(<>
      <Modal isOpen onClose={closeParent} title="Parent"><p>Parent content</p></Modal>
      <Modal isOpen onClose={closeChild} title="Child" appearance="workflow"><p>Child content</p></Modal>
    </>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeParent).not.toHaveBeenCalled();
    expect(closeChild).toHaveBeenCalledOnce();
  });

  it('blocks dismissal and keeps focus inside while a workflow is busy', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Saving" appearance="workflow" busy
      footer={<button type="button" disabled data-autofocus>Cancel</button>}><p>Saving changes</p></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Saving' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
  });

  it('keeps focus inside when controls become disabled, including disabled fieldsets', () => {
    const content = (busy: boolean) => <Modal isOpen onClose={vi.fn()} title="Clear instructors" busy={busy}>
      <fieldset disabled={busy}><input type="radio" aria-label="This section" /></fieldset>
      <button disabled={busy} type="button">Clear</button>
    </Modal>;
    const view = render(content(false));
    screen.getByRole('button', { name: 'Clear' }).focus();
    view.rerender(content(true));
    const dialog = screen.getByRole('dialog', { name: 'Clear instructors' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
  });

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
