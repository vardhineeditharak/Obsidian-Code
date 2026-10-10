import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('BrandMark & Logo Legibility Fix', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('public/logo.svg contains only pure vector geometry with zero raster or base64 data', () => {
    const logoSvg = fs.readFileSync(path.join(rootDir, 'public', 'logo.svg'), 'utf-8');
    expect(logoSvg).not.toContain('base64');
    expect(logoSvg).not.toContain('<image');
    expect(logoSvg).not.toContain('xlink:href');
    expect(logoSvg).toContain('viewBox="0 0 48 48"');
    expect(logoSvg).toContain('stroke="currentColor"');
    expect(logoSvg).toContain('M24 6 L40 15 V33 L24 42 L8 33 V15 Z');
  });

  it('public/favicon.svg contains pure vector geometry with zero raster or base64 data', () => {
    const faviconSvg = fs.readFileSync(path.join(rootDir, 'public', 'favicon.svg'), 'utf-8');
    expect(faviconSvg).not.toContain('base64');
    expect(faviconSvg).not.toContain('<image');
    expect(faviconSvg).not.toContain('xlink:href');
    expect(faviconSvg).toContain('viewBox="0 0 48 48"');
    expect(faviconSvg).toContain('prefers-color-scheme: dark');
  });

  it('BrandMark component exists and defines the pure-vector isometric cube silhouette', () => {
    const brandMarkSource = fs.readFileSync(
      path.join(rootDir, 'src', 'components', 'ui', 'BrandMark.tsx'),
      'utf-8'
    );
    expect(brandMarkSource).toContain('viewBox="0 0 48 48"');
    expect(brandMarkSource).toContain('stroke="currentColor"');
    expect(brandMarkSource).toContain('strokeWidth="4"');
    expect(brandMarkSource).toContain('strokeLinecap="round"');
    expect(brandMarkSource).toContain('strokeLinejoin="round"');
    expect(brandMarkSource).toContain('Obsidian Code mark');
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
});
