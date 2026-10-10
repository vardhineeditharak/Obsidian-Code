import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('AuthPage Layout and Design Regression Tests', () => {
  const authPagePath = path.resolve(__dirname, '../src/components/auth/AuthPage.tsx');
  const authPageSource = fs.readFileSync(authPagePath, 'utf-8');

  it("AuthPage.tsx source contains 'whitespace-nowrap' inside the divider block", () => {
    expect(authPageSource).toContain('whitespace-nowrap');
  });

  it("AuthPage.tsx source no longer contains 'bg-[#0F172A]' as a divider patch", () => {
    expect(authPageSource).not.toContain('bg-[#0F172A]');
  });

  it("AuthPage.tsx source contains no 'blur-3xl'", () => {
    expect(authPageSource).not.toContain('blur-3xl');
  });

  it("AuthPage.tsx wrapper uses 'overflow-y-auto' (scroll container present)", () => {
    expect(authPageSource).toContain('overflow-y-auto');
  });

  it("OAuth buttons no longer contain 'bg-slate-900/90'", () => {
    expect(authPageSource).not.toContain('bg-slate-900/90');
  });

  it("Guard that Clerk handlers still exist unchanged", () => {
    expect(authPageSource).toContain('signIn.create');
    expect(authPageSource).toContain('signUp.create');
    expect(authPageSource).toContain('authenticateWithRedirect');
    expect(authPageSource).toContain('prepareEmailAddressVerification');
  });
});
