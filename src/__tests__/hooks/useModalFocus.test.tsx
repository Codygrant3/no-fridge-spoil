import { fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useModalFocus } from '../../hooks/useModalFocus';

function TestDialog({ onClose, triggerRef }: { onClose: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useModalFocus(true, dialogRef, close, closeRef, triggerRef);
  return (
    <div ref={dialogRef} role="dialog" tabIndex={-1}>
      <button ref={closeRef}>Close</button>
      <button>Last action</button>
    </div>
  );
}

function DialogHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={triggerRef} onClick={() => setOpen(true)}>Trigger</button>
    {open && <TestDialog triggerRef={triggerRef} onClose={() => { onClose(); setOpen(false); }} />}
  </>;
}

describe('useModalFocus', () => {
  it('moves focus inside, traps Tab, closes on Escape, and restores focus', () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    const last = screen.getByRole('button', { name: 'Last action' });
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });
});
