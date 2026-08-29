'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import BodyPortal, { useOverlayScrollLock } from '@/components/ui/BodyPortal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  /** Actions pinned below the scrolling body — a submit button belongs here, not in children. */
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
  showCloseButton = true,
  footer,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  useOverlayScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleCloseRequest = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('rillcod:native-back', handleCloseRequest);
    requestAnimationFrame(() => modalRef.current?.focus());

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('rillcod:native-back', handleCloseRequest);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] overflow-hidden overscroll-contain">
        <div
          className="fixed inset-0 bg-foreground/40 transition-opacity"
          onClick={closeOnBackdrop ? onClose : undefined}
        />

        <div className="flex min-h-full items-end justify-center px-0 pt-[var(--safe-area-top)] sm:items-center sm:p-4">
          <div
            ref={modalRef}
            className={`relative flex max-h-[min(92dvh,calc(100dvh-var(--safe-area-top)))] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg ${sizeClasses[size]}`}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
          >
            {(title || showCloseButton) && (
              <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-4 sm:p-6">
                {title && (
                  <h3
                    id={titleId}
                    className="text-lg font-semibold text-foreground"
                  >
                    {title}
                  </h3>
                )}
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-2 text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}

            <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 ${footer ? '' : 'pb-[max(1rem,var(--safe-area-bottom))]'}`}>
              {children}
            </div>

            {/* Actions stay put while the body scrolls.
                Without this every dialog with a form put its own submit button
                inside the scroll area, so on a phone a long form buried the one
                control the user opened it to reach. Callers that pass no footer
                are unaffected and keep the safe-area padding on the body. */}
            {footer && (
              <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border p-4 pb-[max(1rem,var(--safe-area-bottom))] sm:p-6">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

export const ConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  /** Return false to keep the dialog open after a handled failure. */
  onConfirm: () => void | boolean | Promise<void | boolean>;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  confirmingText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  busy?: boolean;
}> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  confirmingText = 'Working…',
  cancelText = 'Cancel',
  variant = 'info',
  busy = false,
}) => {
  const variantClasses = {
    danger: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
    info: 'bg-primary text-primary-foreground hover:opacity-90',
    success: 'bg-emerald-700 text-white hover:bg-emerald-800',
  };

  const handleConfirm = async () => {
    if (busy) return;
    const result = await onConfirm();
    if (result !== false) onClose();
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      closeOnBackdrop={!busy}
      title={title}
      size="sm"
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="min-h-11 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground/80 hover:bg-background disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${variantClasses[variant]}`}
          >
            {busy ? confirmingText : confirmText}
          </button>
        </div>
      }
    >
      <div className="text-sm leading-6 text-muted-foreground">
        {message}
      </div>
    </Modal>
  );
};

export default Modal;
