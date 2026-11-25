import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@clerk/react/legacy', () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: vi.fn(),
      authenticateWithRedirect: vi.fn(),
    },
    setActive: vi.fn(),
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: vi.fn(),
      prepareEmailAddressVerification: vi.fn(),
      attemptEmailAddressVerification: vi.fn(),
      authenticateWithRedirect: vi.fn(),
    },
    setActive: vi.fn(),
  }),
}));

import { AuthPage } from '../src/components/auth/AuthPage';
import { BrandMark } from '../src/components/ui/BrandMark';
import { LoadingState } from '../src/components/ui/LoadingState';
import { Skeleton, SkeletonCard, SkeletonGrid } from '../src/components/ui/Skeleton';
import { IconButton } from '../src/components/ui/IconButton';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { Modal, ConfirmDialog, PromptDialog } from '../src/components/ui/Dialog';

describe('UI Design System, AuthPage, Accessibility Primitives & Modal Stability', () => {
  const rootDir = path.resolve(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');

  describe('AuthPage Layout Invariants & Rendering', () => {
    const authPageSource = fs.readFileSync(
      path.join(rootDir, 'src', 'components', 'auth', 'AuthPage.tsx'),
      'utf-8'
    );

    it('enforces layout invariants in AuthPage source', () => {
      expect(authPageSource).toContain('whitespace-nowrap');
      expect(authPageSource).toContain('overflow-y-auto');
      expect(authPageSource).not.toContain('bg-[#0F172A]');
      expect(authPageSource).not.toContain('blur-3xl');
      expect(authPageSource).not.toContain('bg-slate-900/90');
      expect(authPageSource).toContain('signIn.create');
      expect(authPageSource).toContain('signUp.create');
      expect(authPageSource).toContain('authenticateWithRedirect');
      expect(authPageSource).toContain('prepareEmailAddressVerification');
    });

    it('renders Sign In / Create Account tabs, form inputs, and Google/GitHub OAuth buttons', () => {
      const html = renderToString(React.createElement(AuthPage));
      expect(html).toContain('Obsidian Code');
      expect(html).toContain('role="tablist"');
      expect(html).toContain('Sign In');
      expect(html).toContain('Create Account');
      expect(html).toContain('id="auth-email"');
      expect(html).toContain('id="auth-password"');
      expect(html).toContain('aria-label="Show password"');
      expect(html).toContain('Continue with Google');
      expect(html).toContain('Continue with GitHub');
    });
  });

  describe('BrandMark, SVG Assets & Icon Consistency', () => {
    it('public/logo.svg and public/favicon.svg exist and are valid non-empty SVGs', () => {
      const logoSvg = fs.readFileSync(path.join(publicDir, 'logo.svg'), 'utf-8');
      expect(logoSvg).toContain('<svg');
      expect(logoSvg).toMatch(/viewBox="[^"]+"/);
      expect(fs.statSync(path.join(publicDir, 'logo.svg')).size).toBeGreaterThan(0);

      const faviconSvg = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf-8');
      expect(faviconSvg).toContain('<svg');
      expect(fs.statSync(path.join(publicDir, 'favicon.svg')).size).toBeGreaterThan(0);
    });

    it('BrandMark renders canonical /logo.svg img without dark:invert hacks across Header, Dashboard & AuthPage', () => {
      const html = renderToString(React.createElement(BrandMark, { className: 'w-8 h-8' }));
      expect(html).toContain('<img');
      expect(html).toContain('src="/logo.svg"');
      expect(html).toContain('alt="Obsidian Code"');
      expect(html).toContain('draggable="false"');

      for (const relPath of [
        'src/components/workspace/Header.tsx',
        'src/components/dashboard/Dashboard.tsx',
        'src/components/auth/AuthPage.tsx',
      ]) {
        const src = fs.readFileSync(path.join(rootDir, relPath), 'utf-8');
        expect(src).not.toContain('dark:invert');
        expect(src).toContain('<BrandMark');
      }
    });

    it('index.html references only existing local public icon assets', () => {
      const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
      const iconRefs = [
        ...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon|shortcut icon)"[^>]*href="([^"]+)"/g),
      ].map((m) => m[1]);
      expect(iconRefs.length).toBeGreaterThan(0);
      for (const ref of iconRefs) {
        if (ref.startsWith('/')) {
          const fileName = ref.replace(/^\//, '').split('?')[0];
          expect(fs.existsSync(path.join(publicDir, fileName)), `Missing icon asset: ${ref}`).toBe(true);
        }
      }
    });
  });

  describe('LoadingState, Skeleton, IconButton & ErrorBoundary Primitives', () => {
    it('LoadingState renders semantic status role, polite live region, and fullscreen overlay', () => {
      const inlineHtml = renderToString(React.createElement(LoadingState, { label: 'Loading workspace…' }));
      expect(inlineHtml).toContain('role="status"');
      expect(inlineHtml).toContain('aria-live="polite"');
      expect(inlineHtml).toContain('Loading workspace…');
      expect(inlineHtml).toContain('animate-spin');

      const fullHtml = renderToString(React.createElement(LoadingState, { fullscreen: true }));
      expect(fullHtml).toContain('fixed inset-0');
      expect(fullHtml).toContain('z-50');
    });

    it('Skeleton, SkeletonCard, and SkeletonGrid render accessible loading placeholders', () => {
      const skHtml = renderToString(React.createElement(Skeleton, { className: 'w-24 h-4', rounded: 'full' }));
      expect(skHtml).toContain('aria-hidden="true"');
      expect(skHtml).toContain('animate-pulse');
      expect(skHtml).toContain('rounded-full');

      const cardHtml = renderToString(React.createElement(SkeletonCard));
      expect(cardHtml).toContain('rounded-lg');
      expect(cardHtml).toContain('border');

      const gridHtml = renderToString(React.createElement(SkeletonGrid, { count: 4 }));
      expect(gridHtml).toContain('role="status"');
      expect(gridHtml).toContain('aria-label="Loading workspace projects"');
      expect(gridHtml.match(/h-44/g)?.length).toBe(4);
    });

    it('IconButton enforces aria-label, title fallback, variants, sizes, and disabled state', () => {
      const html = renderToString(
        React.createElement(
          IconButton,
          { 'aria-label': 'Search project', variant: 'primary', size: 'md', onClick: () => {} },
          React.createElement('span', null, 'Find')
        )
      );
      expect(html).toContain('aria-label="Search project"');
      expect(html).toContain('title="Search project"');
      expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('bg-ink');
      expect(html).toContain('p-1.5');

      const disabledHtml = renderToString(
        React.createElement(
          IconButton,
          { 'aria-label': 'Disabled action', variant: 'danger', disabled: true },
          React.createElement('span', null, 'Del')
        )
      );
      expect(disabledHtml).toContain('disabled');
      expect(disabledHtml).toContain('disabled:opacity-40');
    });

    it('ErrorBoundary renders children normally and branded fallback on error', () => {
      const okHtml = renderToString(
        React.createElement(ErrorBoundary, null, React.createElement('div', null, 'Safe Workspace'))
      );
      expect(okHtml).toContain('Safe Workspace');
      expect(okHtml).not.toContain('Workspace Interrupted');

      const customFallbackHtml = renderToString(
        (() => {
          const b = new ErrorBoundary({
            children: null,
            fallback: React.createElement('div', null, 'Custom Crash UI'),
          });
          b.state = { hasError: true, error: new Error('Boom'), errorInfo: null };
          return b.render();
        })()
      );
      expect(customFallbackHtml).toContain('Custom Crash UI');

      const boundary = new ErrorBoundary({ children: null });
      boundary.state = { hasError: true, error: new Error('Simulated crash'), errorInfo: null };
      const errHtml = renderToString(boundary.render());
      expect(errHtml).toContain('Obsidian Code');
      expect(errHtml).toContain('Workspace Interrupted');
      expect(errHtml).toContain('Simulated crash');
      expect(errHtml).toContain('Reload Application');
      expect(errHtml).toContain('Back to Dashboard');
    });
  });

  describe('Modal, ConfirmDialog, PromptDialog & Focus-Trap Stability (src/components/ui/Dialog.tsx)', () => {
    const dialogSrc = fs.readFileSync(
      path.join(rootDir, 'src', 'components', 'ui', 'Dialog.tsx'),
      'utf-8'
    );

    it('maintains focus-trap stability via onCloseRef and strictly [isOpen] effect dependencies', () => {
      expect(dialogSrc).toContain('onCloseRef.current = onClose;');
      expect(dialogSrc).toContain('onCloseRef.current();');
      expect(dialogSrc).toContain('}, [isOpen]);');
      expect(dialogSrc).not.toContain('}, [isOpen, onClose]);');
      expect(dialogSrc).toContain('INPUT_SELECTOR');
      expect(dialogSrc).toContain('FOCUSABLE_SELECTOR');
      expect(dialogSrc).toContain("e.key === 'Tab'");
      expect(dialogSrc).toContain("e.key === 'Escape'");
      expect(dialogSrc).toContain('previouslyFocusedRef.current');
    });

    it('renders accessible Modal, ConfirmDialog, and PromptDialog markup and hides when closed', () => {
      expect(
        renderToString(
          React.createElement(
            Modal,
            { isOpen: false, onClose: () => {}, title: 'Hidden' },
            React.createElement('p', null, 'Hidden body')
          )
        )
      ).toBe('');

      const modalHtml = renderToString(
        React.createElement(
          Modal,
          { isOpen: true, onClose: () => {}, title: 'Version History', ariaDescribedBy: 'desc-1' },
          React.createElement('p', { id: 'desc-1' }, 'Diff content')
        )
      );
      expect(modalHtml).toContain('role="dialog"');
      expect(modalHtml).toContain('aria-modal="true"');
      expect(modalHtml).toContain('aria-labelledby=');
      expect(modalHtml).toContain('aria-describedby="desc-1"');
      expect(modalHtml).toContain('modal-scrim');
      expect(modalHtml).toContain('modal-dialog');
      expect(modalHtml).toContain('aria-label="Close dialog"');

      const confirmHtml = renderToString(
        React.createElement(ConfirmDialog, {
          isOpen: true,
          title: 'Delete File?',
          message: 'Cannot be undone.',
          confirmText: 'Delete',
          isDestructive: true,
          onConfirm: () => {},
          onCancel: () => {},
        })
      );
      expect(confirmHtml).toContain('Delete File?');
      expect(confirmHtml).toContain('bg-crimson');

      const promptHtml = renderToString(
        React.createElement(PromptDialog, {
          isOpen: true,
          title: 'Create Checkpoint',
          message: 'Snapshot workspace state.',
          fields: [
            { id: 'name', label: 'Name', required: true },
            { id: 'note', label: 'Notes', type: 'textarea' },
          ],
          onSubmit: () => {},
          onCancel: () => {},
        })
      );
      expect(promptHtml).toContain('Create Checkpoint');
      expect(promptHtml).toContain('id="prompt-name"');
      expect(promptHtml).toContain('<textarea');
    });
  });

  describe('CSS Foundations in src/index.css', () => {
    const cssContent = fs.readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf-8');

    it('defines design tokens, animations, reduced-motion, and user-select scoping', () => {
      expect(cssContent).toContain('--radius-xs: 1.5px;');
      expect(cssContent).toContain('.modal-scrim');
      expect(cssContent).toContain('.modal-dialog');
      expect(cssContent).toContain('@keyframes modal-fade-in');
      expect(cssContent).toContain('@keyframes modal-scale-in');
      expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssContent).toContain('animation-duration: 0.01ms !important;');
      expect(cssContent).toContain('user-select: none;');
      expect(cssContent).toContain('.monaco-editor');
      expect(cssContent).toContain('.selectable-text');
      expect(cssContent).toContain('user-select: text;');
      expect(cssContent).toContain('.text-micro');
      expect(cssContent).toContain("font-family: 'Inter';");
      expect(cssContent).toContain('/fonts/inter-latin.woff2');
      expect(cssContent).toContain("font-family: 'JetBrains Mono';");
      expect(cssContent).toContain('SF Pro Text');
      expect(cssContent).toContain('--color-parchment: #171717;');
      expect(cssContent).toContain('--color-ember: #7c3aed;');
      expect(cssContent).toContain('.apple-glass-header');
      expect(cssContent).toContain('.apple-popover');
    });

    it('preloads self-hosted Inter and JetBrains Mono fonts in index.html', () => {
      const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
      expect(html).toContain('/fonts/inter-latin.woff2');
      expect(html).toContain('/fonts/jetbrains-mono-latin.woff2');
    });
  });
});
