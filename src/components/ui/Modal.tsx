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
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
  showCloseButton = true,
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

            <div className="overflow-y-auto overscroll-contain p-4 pb-[max(1rem,var(--safe-area-bottom))] sm:p-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

export const ConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
}) => {
  const variantClasses = {
    danger: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
    info: 'bg-primary text-primary-foreground hover:opacity-90',
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-muted-foreground">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${variantClasses[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default Modal;
