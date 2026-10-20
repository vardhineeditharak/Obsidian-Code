import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LatticeLoader } from '../src/components/ui/LatticeLoader';

describe('LatticeLoader Component (React Bits Integration)', () => {
  it('renders with default props and accessibility attributes', () => {
    const html = renderToString(React.createElement(LatticeLoader));
    expect(html).toContain('role="status"');
    expect(html).toContain('lattice-loader');
    expect(html).toContain('data-status="working"');
    expect(html).toContain('data-shape="round"');
    expect(html).toContain('Thinking');
    expect(html).toContain('Done in');
    expect(html).toContain('Failed after');
    expect(html).toContain('Thinking, in progress');
    expect(html).toContain('lattice-loader__timer');
    expect(html).toContain('0.0s');
  });

  it('renders a 3x3 grid with 9 cells in each layer', () => {
    const html = renderToString(React.createElement(LatticeLoader, { grid: 3, pattern: 'orbit' }));
    expect(html).toContain('--ll-n:3');
    // Each layer has 9 cells -> 18 total cell occurrences
    const cellMatches = html.match(/lattice-loader__cell/g) || [];
    expect(cellMatches.length).toBe(18);
  });

  it('renders a 4x4 grid with 16 cells in each layer', () => {
    const html = renderToString(React.createElement(LatticeLoader, { grid: 4, pattern: 'sweep' }));
    expect(html).toContain('--ll-n:4');
    // Each layer has 16 cells -> 32 total cell occurrences
    const cellMatches = html.match(/lattice-loader__cell/g) || [];
    expect(cellMatches.length).toBe(32);
  });

  it('handles "done" and "error" statuses correctly', () => {
    const doneHtml = renderToString(
      React.createElement(LatticeLoader, { status: 'done', doneLabel: 'Compiled in', elapsed: 1.4 })
    );
    expect(doneHtml).toContain('data-status="done"');
    expect(doneHtml).toContain('Compiled in');
    expect(doneHtml).toContain('Compiled in 1.4 seconds');
    expect(doneHtml).toContain('1.4s');

    const errorHtml = renderToString(
      React.createElement(LatticeLoader, { status: 'error', errorLabel: 'Terminated after', elapsed: 3.2 })
    );
    expect(errorHtml).toContain('data-status="error"');
    expect(errorHtml).toContain('Terminated after');
    expect(errorHtml).toContain('Terminated after 3.2 seconds');
    expect(errorHtml).toContain('3.2s');
  });

  it('supports custom pattern objects', () => {
    const customPattern = {
      cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      loop: 10,
      scale: 1,
      lit: 0.35,
    };
    const html = renderToString(
      React.createElement(LatticeLoader, { pattern: customPattern, grid: 3 })
    );
    expect(html).toContain('data-lit="35"');
    expect(html).toContain('--ll-cycle:900ms');
  });

  it('applies custom colors, sizing, and glow', () => {
    const html = renderToString(
      React.createElement(LatticeLoader, {
        cellSize: 8,
        gap: 3,
        fontSize: 16,
        color: '#a78bfa',
        doneColor: '#4ade80',
        errorColor: '#f87171',
        glow: true,
        glowColor: '#a78bfa',
      })
    );
    expect(html).toContain('--ll-cell:8px');
    expect(html).toContain('--ll-gap:3px');
    expect(html).toContain('--ll-font:16px');
    expect(html).toContain('--ll-color:#a78bfa');
    expect(html).toContain('--ll-mark:#4ade80');
    expect(html).toContain('--ll-glow:#a78bfa');
    expect(html).toContain('data-glow');
  });

  it('allows hiding the stopwatch timer', () => {
    const html = renderToString(React.createElement(LatticeLoader, { showTimer: false }));
    expect(html).not.toContain('lattice-loader__timer');
  });
});
