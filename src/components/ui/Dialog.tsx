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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        className={`w-full ${maxWidth} rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-slate-950/40">
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              {title}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
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
            className={`p-2.5 rounded-xl shrink-0 ${
              isDestructive
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}
          >
            {isDestructive ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">{title}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-white/5 transition cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 text-xs font-medium rounded-xl text-white transition shadow-sm cursor-pointer ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
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
        {message && <p className="text-xs text-slate-400">{message}</p>}

        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div key={field.id}>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {field.label} {field.required && <span className="text-rose-400">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  ref={idx === 0 ? (firstInputRef as any) : undefined}
                  value={formValues[field.id] || ''}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={3}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              ) : (
                <input
                  ref={idx === 0 ? (firstInputRef as any) : undefined}
                  type="text"
                  value={formValues[field.id] || ''}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-white/5 transition cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-500 transition shadow-sm cursor-pointer"
          >
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
};
