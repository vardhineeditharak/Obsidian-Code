import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle, HelpCircle } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  maxWidth = 'max-w-md',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(38,37,30,0.35)] dark:bg-[rgba(10,10,8,0.65)] animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        className={`w-full ${maxWidth} rounded-lg bg-bone border border-stone shadow-2xl overflow-hidden flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone bg-bone">
            <div className="text-sm font-normal text-ink flex items-center gap-2">
              {title}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen transition cursor-pointer"
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
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-2.5 rounded-md shrink-0 ${
              isDestructive
                ? 'bg-red-500/10 text-crimson border border-crimson/20'
                : 'bg-amber-500/10 text-amber border border-amber/20'
            }`}
          >
            {isDestructive ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-normal text-ink">{title}</h3>
            <p className="font-editorial text-sm text-driftwood mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary text-xs px-4 py-2"
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
                ? 'px-4 py-2 text-xs font-normal rounded-md bg-crimson text-white hover:opacity-90 transition cursor-pointer'
                : 'btn-primary text-xs px-4 py-2'
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
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-md" title={title}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {message && <p className="font-editorial text-xs text-driftwood">{message}</p>}

        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div key={field.id}>
              <label className="block text-xs font-normal text-ink mb-1">
                {field.label} {field.required && <span className="text-crimson">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  ref={idx === 0 ? (firstInputRef as any) : undefined}
                  value={formValues[field.id] || ''}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={3}
                  className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs text-ink placeholder-mist focus:outline-none focus:ring-1 focus:ring-ink"
                />
              ) : (
                <input
                  ref={idx === 0 ? (firstInputRef as any) : undefined}
                  type="text"
                  value={formValues[field.id] || ''}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs text-ink placeholder-mist focus:outline-none focus:ring-1 focus:ring-ink"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary text-xs px-4 py-2"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            className="btn-primary text-xs px-4 py-2"
          >
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
};
