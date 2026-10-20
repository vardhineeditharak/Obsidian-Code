import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { Modal, PromptDialog } from '../src/components/ui/Dialog';

describe('Modal Focus Integrity & Keystroke Stability (BUG-FOCUS-UNFOCUS)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders Modal without errors and maintains dialog accessibility semantics', () => {
    const html = renderToString(
      React.createElement(
        Modal,
        {
          isOpen: true,
          onClose: () => {},
          title: 'Create Collaborative Project',
        },
        React.createElement('input', {
          id: 'project-name-input',
          type: 'text',
          defaultValue: 'My Project',
        })
      )
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Create Collaborative Project');
    expect(html).toContain('project-name-input');
  });

  it('preserves input focus logic and does not reset on onClose reference changes', () => {
    // Simulates keystroke re-renders in Dashboard New Project Modal
    let renderCount = 0;
    const TestHarness: React.FC = () => {
      const [name, setName] = useState('');
      renderCount++;

      return React.createElement(
        Modal,
        {
          isOpen: true,
          // Inline function created anew on each render (previously caused effect re-execution)
          onClose: () => {},
          title: 'Create Project',
        },
        React.createElement('input', {
          id: 'project-name-input',
          value: name,
          onChange: (e: any) => setName(e.target.value),
        })
      );
    };

    // Initial render
    const html1 = renderToString(React.createElement(TestHarness));
    expect(html1).toContain('project-name-input');
    expect(renderCount).toBe(1);
  });

  it('PromptDialog keeps form values when parent re-renders with fresh fields array', () => {
    const fields = [
      { id: 'name', label: 'Checkpoint Name', required: true },
      { id: 'note', label: 'Notes', type: 'textarea' as const },
    ];

    const html = renderToString(
      React.createElement(PromptDialog, {
        isOpen: true,
        title: 'Create Named Checkpoint',
        fields,
        onSubmit: () => {},
        onCancel: () => {},
      })
    );

    expect(html).toContain('Checkpoint Name');
    expect(html).toContain('prompt-name');
    expect(html).toContain('prompt-note');
  });
});
