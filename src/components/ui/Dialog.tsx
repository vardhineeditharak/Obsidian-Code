import React, { useEffect, useRef, useId } from 'react';
import { X, AlertTriangle, HelpCircle } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
  ariaDescribedBy?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  maxWidth = 'max-w-md',
  ariaDescribedBy,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const autoTitleId = useId();
  const titleId = title ? autoTitleId : undefined;

  useEffect(() => {
    if (!isOpen) return;

    // Capture the trigger element that had focus before modal opened (A11Y-1)
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog on open (A11Y-1)
    const focusTimer = setTimeout(() => {
      if (!dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogRef.current.focus();
      }
    }, 25);

    // Keyboard handlers: ESC to close + Tab/Shift+Tab focus trap (A11Y-1)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previously focused trigger element on unmount/close (A11Y-1)
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={ariaDescribedBy}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`w-full ${maxWidth} rounded-xl bg-bone border border-stone shadow-2xl inset-glow overflow-hidden flex flex-col modal-dialog ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone bg-bone">
            <div id={titleId} className="text-sm font-normal text-ink flex items-center gap-2">
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-1 focus-visible:ring-amber transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const descId = useId();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-md" ariaDescribedBy={descId}>
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-2.5 rounded-md shrink-0 ${
              isDestructive
                ? 'bg-crimson/10 text-crimson border border-crimson/20'
                : 'bg-warning-yellow/10 text-warning-yellow border border-warning-yellow/20'
            }`}
          >
            {isDestructive ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-normal text-ink">{title}</h3>
            <p id={descId} className="text-sm text-driftwood mt-1 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary text-xs px-4 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={
              isDestructive
                ? 'px-4 py-2 text-xs font-normal rounded-md bg-crimson text-white hover:opacity-90 transition cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-crimson'
                : 'btn-primary text-xs px-4 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber'
            }
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export interface PromptField {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  type?: 'text' | 'textarea';
}

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  fields: PromptField[];
  submitText?: string;
  cancelText?: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  isOpen,
  title,
  message,
  fields,
  submitText = 'Submit',
  cancelText = 'Cancel',
  onSubmit,
  onCancel,
}) => {
  const [formValues, setFormValues] = React.useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const msgId = useId();

  React.useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      fields.forEach((f) => {
        initial[f.id] = f.defaultValue || '';
      });
      setFormValues(initial);
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [isOpen, fields]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && !formValues[f.id]?.trim()) {
        return;
      }
    }
    onSubmit(formValues);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      maxWidth="max-w-md"
      title={title}
      ariaDescribedBy={message ? msgId : undefined}
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {message && (
          <p id={msgId} className="text-xs text-driftwood">
            {message}
          </p>
        )}

        <div className="space-y-3">
          {fields.map((field, idx) => {
            const inputId = `prompt-${field.id}`;
            return (
              <div key={field.id}>
                <label htmlFor={inputId} className="block text-xs font-normal text-ink mb-1">
                  {field.label} {field.required && <span className="text-crimson">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={inputId}
                    ref={idx === 0 ? (firstInputRef as any) : undefined}
                    value={formValues[field.id] || ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs text-ink placeholder-mist focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber transition"
                  />
                ) : (
                  <input
                    id={inputId}
                    type="text"
                    ref={idx === 0 ? (firstInputRef as any) : undefined}
                    value={formValues[field.id] || ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs text-ink placeholder-mist focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber transition"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary text-xs px-4 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            className="btn-primary text-xs px-4 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber"
          >
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
};
