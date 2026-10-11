import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('BrandMark & Logo Wiring', () => {
  const rootDir = path.resolve(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');

  it('public/logo.svg exists and is a valid SVG brand asset', () => {
    const logoSvg = fs.readFileSync(path.join(publicDir, 'logo.svg'), 'utf-8');
    // It is an SVG document with a viewBox (scales crisply at any size)
    expect(logoSvg).toContain('<svg');
    expect(logoSvg).toMatch(/viewBox="[^"]+"/);
    expect(fs.statSync(path.join(publicDir, 'logo.svg')).size).toBeGreaterThan(0);
  });

  it('public/favicon.svg exists and is a valid SVG', () => {
    const faviconSvg = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf-8');
    expect(faviconSvg).toContain('<svg');
    expect(fs.statSync(path.join(publicDir, 'favicon.svg')).size).toBeGreaterThan(0);
  });

  it('BrandMark component loads the canonical logo asset via an <img>', () => {
    const brandMarkSource = fs.readFileSync(
      path.join(rootDir, 'src', 'components', 'ui', 'BrandMark.tsx'),
      'utf-8'
    );
    // Single source of truth: the in-app logo points at the same asset as the favicon
    expect(brandMarkSource).toContain('src="/logo.svg"');
    expect(brandMarkSource).toContain('<img');
    expect(brandMarkSource).toContain('Obsidian Code');
  });

  it('Header, Dashboard, and AuthPage use BrandMark and have zero dark:invert filter hacks', () => {
    const header = fs.readFileSync(
      path.join(rootDir, 'src', 'components', 'workspace', 'Header.tsx'),
      'utf-8'
    );
    const dashboard = fs.readFileSync(
      path.join(rootDir, 'src', 'components', 'dashboard', 'Dashboard.tsx'),
      'utf-8'
    );
    const auth = fs.readFileSync(
      path.join(rootDir, 'src', 'components', 'auth', 'AuthPage.tsx'),
      'utf-8'
    );

    // None should contain dark:invert
    expect(header).not.toContain('dark:invert');
    expect(dashboard).not.toContain('dark:invert');
    expect(auth).not.toContain('dark:invert');

    // All should use BrandMark
    expect(header).toContain('<BrandMark');
    expect(dashboard).toContain('<BrandMark');
    expect(auth).toContain('<BrandMark');
  });

  it('index.html only references favicon/icon files that actually exist (no 404s)', () => {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    // Collect every href pointing at a root-level icon asset
    const iconRefs = [...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon|shortcut icon)"[^>]*href="([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(iconRefs.length).toBeGreaterThan(0);
    for (const ref of iconRefs) {
      // Only assert on local, root-relative assets
      if (ref.startsWith('/')) {
        const fileName = ref.replace(/^\//, '').split('?')[0];
        const exists = fs.existsSync(path.join(publicDir, fileName));
        expect(exists, `index.html references missing icon asset: ${ref}`).toBe(true);
      }
    }
  });
});

