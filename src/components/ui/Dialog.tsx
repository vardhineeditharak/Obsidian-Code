import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const INPUT_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])';

// Only the topmost open dialog should react to Escape/Tab. Listeners on `window` cannot
// be stopped by stopPropagation(), so nested dialogs need an explicit stack.
const dialogStack: symbol[] = [];

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
  ariaDescribedBy?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  maxWidth = 'max-w-md',
  ariaDescribedBy,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const autoTitleId = useId();
  const titleId = title ? autoTitleId : undefined;

  useEffect(() => {
    if (!isOpen) return;

    const stackToken = Symbol('dialog');
    dialogStack.push(stackToken);
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Prefer focusing form inputs over the header close button on initial open
    const focusTimer = setTimeout(() => {
      const container = dialogRef.current;
      if (!container) return;

      const firstInput = container.querySelector<HTMLElement>(INPUT_SELECTOR);
      if (firstInput) {
        firstInput.focus();
        return;
      }

      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        container.focus();
      }
    }, 25);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== stackToken) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      const stackIndex = dialogStack.indexOf(stackToken);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);

      const prev = previouslyFocusedRef.current;
      if (prev && prev.isConnected && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCloseRef.current();
        }
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
        {title ? (
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
        ) : null}
        {children}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
            {isDestructive ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <HelpCircle className="w-5 h-5" />
            )}
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
}

export interface PromptField {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  type?: 'text' | 'textarea';
}

export interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  fields: PromptField[];
  submitText?: string;
  cancelText?: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function PromptDialog({
  isOpen,
  title,
  message,
  fields,
  submitText = 'Submit',
  cancelText = 'Cancel',
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const msgId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string> = {};
    for (const field of fieldsRef.current) {
      initial[field.id] = field.defaultValue ?? '';
    }
    setFormValues(initial);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const field of fields) {
      if (field.required && !formValues[field.id]?.trim()) {
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
        {message ? (
          <p id={msgId} className="text-xs text-driftwood">
            {message}
          </p>
        ) : null}

        <div className="space-y-3">
          {fields.map((field) => {
            const inputId = `prompt-${field.id}`;
            return (
              <div key={field.id}>
                <label htmlFor={inputId} className="block text-xs font-normal text-ink mb-1">
                  {field.label}{' '}
                  {field.required ? <span className="text-crimson">*</span> : null}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={inputId}
                    value={formValues[field.id] ?? ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs text-ink placeholder-mist focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber transition"
                  />
                ) : (
                  <input
                    id={inputId}
                    type="text"
                    value={formValues[field.id] ?? ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
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
}
