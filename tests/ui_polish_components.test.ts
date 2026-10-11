import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { LoadingState } from '../src/components/ui/LoadingState';
import { Skeleton, SkeletonCard, SkeletonGrid } from '../src/components/ui/Skeleton';
import { IconButton } from '../src/components/ui/IconButton';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { Modal } from '../src/components/ui/Dialog';

describe('UI/UX Polish Pass & Accessible Components', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('LoadingState Component (POLISH-4)', () => {
    it('renders with role="status" and aria-live="polite"', () => {
      const html = renderToString(React.createElement(LoadingState, { label: 'Loading workspace…' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading workspace…');
      expect(html).toContain('animate-spin');
    });

    it('renders in fullscreen mode when fullscreen prop is true', () => {
      const html = renderToString(React.createElement(LoadingState, { fullscreen: true }));
      expect(html).toContain('fixed inset-0');
      expect(html).toContain('z-50');
    });
  });

  describe('Skeleton Primitives (POLISH-4)', () => {
    it('renders aria-hidden="true" and animate-pulse on Skeleton', () => {
      const html = renderToString(React.createElement(Skeleton, { className: 'w-24 h-4' }));
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('animate-pulse');
    });

    it('renders SkeletonCard with atelier border and structure', () => {
      const html = renderToString(React.createElement(SkeletonCard));
      expect(html).toContain('rounded-lg');
      expect(html).toContain('border');
      expect(html).toContain('animate-pulse');
    });

    it('renders correct count of cards in SkeletonGrid', () => {
      const html = renderToString(React.createElement(SkeletonGrid, { count: 4 }));
      const cardMatches = html.match(/h-44/g);
      expect(cardMatches?.length).toBe(4);
    });
  });

  describe('IconButton Component (A11Y-2)', () => {
    it('enforces aria-label and accessible focus ring', () => {
      const html = renderToString(
        React.createElement(
          IconButton,
          {
            'aria-label': 'Search project',
            title: 'Search in Project',
            onClick: () => {},
          },
          React.createElement('span', null, 'Icon')
        )
      );
      expect(html).toContain('aria-label="Search project"');
      expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('focus:outline-none');
    });

    it('renders disabled attribute when disabled is true', () => {
      const html = renderToString(
        React.createElement(
          IconButton,
          {
            'aria-label': 'Disabled action',
            disabled: true,
            onClick: () => {},
          },
          React.createElement('span', null, 'Icon')
        )
      );
      expect(html).toContain('disabled');
      expect(html).toContain('disabled:opacity-40');
    });
  });

  describe('ErrorBoundary Component (PROD-1)', () => {
    it('renders children normally when no error occurs', () => {
      const html = renderToString(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement('div', { id: 'safe-child' }, 'Normal App Content')
        )
      );
      expect(html).toContain('Normal App Content');
      expect(html).not.toContain('Workspace Interrupted');
    });

    it('renders branded fallback when error state is forced', () => {
      const boundary = new ErrorBoundary({ children: null });
      boundary.state = {
        hasError: true,
        error: new Error('Simulated crash'),
        errorInfo: null,
      };
      const rendered = boundary.render();
      const html = renderToString(rendered);
      expect(html).toContain('Obsidian Code');
      expect(html).toContain('Workspace Interrupted');
      expect(html).toContain('Simulated crash');
      expect(html).toContain('Reload Application');
      expect(html).toContain('Back to Dashboard');
    });
  });

  describe('Modal Accessibility & Styling (BUG-1, A11Y-1, PROD-4)', () => {
    it('renders role="dialog", aria-modal="true", and modal classes', () => {
      const html = renderToString(
        React.createElement(
          Modal,
          {
            isOpen: true,
            onClose: () => {},
            title: 'Version History',
          },
          React.createElement('p', null, 'Diff content')
        )
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby=');
      expect(html).toContain('Version History');
      expect(html).toContain('modal-scrim');
      expect(html).toContain('modal-dialog');
      expect(html).toContain('aria-label="Close dialog"');
      expect(html).toContain('Diff content');
    });

    it('does not render markup when isOpen is false', () => {
      const html = renderToString(
        React.createElement(
          Modal,
          {
            isOpen: false,
            onClose: () => {},
            title: 'Hidden Modal',
          },
          React.createElement('p', null, 'Hidden content')
        )
      );
      expect(html).toBe('');
    });
  });

  describe('CSS Foundations in src/index.css', () => {
    const cssPath = path.join(rootDir, 'src', 'index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    it('defines --radius-xs in @theme (BUG-2 safety net)', () => {
      expect(cssContent).toContain('--radius-xs: 1.5px;');
    });

    it('defines dependency-free modal animations and classes (BUG-1, POLISH-2)', () => {
      expect(cssContent).toContain('.modal-scrim');
      expect(cssContent).toContain('.modal-dialog');
      expect(cssContent).toContain('@keyframes modal-fade-in');
      expect(cssContent).toContain('@keyframes modal-scale-in');
    });

    it('enforces prefers-reduced-motion media query (A11Y-4)', () => {
      expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssContent).toContain('animation-duration: 0.01ms !important;');
    });

    it('scopes user-select: none and enables user-select: text in text regions (PROD-3)', () => {
      expect(cssContent).toContain('user-select: none;');
      expect(cssContent).toContain('.monaco-editor');
      expect(cssContent).toContain('.selectable-text');
      expect(cssContent).toContain('user-select: text;');
    });

    it('defines text-micro typography utility (POLISH-2)', () => {
      expect(cssContent).toContain('.text-micro');
      expect(cssContent).toContain('font-size: 11px;');
    });
  });
});
