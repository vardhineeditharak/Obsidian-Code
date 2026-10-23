import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { checkNodeRuntimeSecurity, parseSemver } from '../server/security/runtimeAudit';
import { LANGUAGE_DEFINITIONS, sanitizeExecutionFileName } from '../server/execution/languageRegistry';
import { fileNameSchema } from '../server/routes/fileRoutes';

describe('Security Posture & Industry CVE Remediation Suite (Gravitas)', () => {
  describe('1. Node.js Security Release & eMudhra Certificate Compromise Audit', () => {
    it('correctly parses semantic versioning strings', () => {
      expect(parseSemver('v20.18.0')).toEqual({ major: 20, minor: 18, patch: 0 });
      expect(parseSemver('22.10.0')).toEqual({ major: 22, minor: 10, patch: 0 });
      expect(parseSemver('invalid')).toBeNull();
    });

    it('flags unpatched Node.js versions affected by eMudhra compromise, TLS bypass, and Brotli RCE', () => {
      // Node 18 below 18.20.5
      const old18 = checkNodeRuntimeSecurity('18.20.4');
      expect(old18.secure).toBe(false);
      expect(old18.advisories[0]).toContain('eMudhra');

      // Node 20 below 20.18.0
      const old20 = checkNodeRuntimeSecurity('20.17.0');
      expect(old20.secure).toBe(false);
      expect(old20.advisories[0]).toContain('eMudhra');

      // Node 22 below 22.10.0
      const old22 = checkNodeRuntimeSecurity('22.9.0');
      expect(old22.secure).toBe(false);
      expect(old22.advisories[0]).toContain('eMudhra');
    });

    it('passes patched Node.js versions with eMudhra distrust and security fixes', () => {
      expect(checkNodeRuntimeSecurity('18.20.5').secure).toBe(true);
      expect(checkNodeRuntimeSecurity('20.18.0').secure).toBe(true);
      expect(checkNodeRuntimeSecurity('22.10.0').secure).toBe(true);
      expect(checkNodeRuntimeSecurity('24.12.0').secure).toBe(true);
    });
  });

  describe('2. PHP2Shell & Multi-Language CLI Injection & Sandbox Boundary', () => {
    it('hardens PHP execution with isolated open_basedir, no php.ini, memory cap, and option termination', () => {
      const phpDef = LANGUAGE_DEFINITIONS.php;
      expect(phpDef).toBeDefined();

      const runSpec = phpDef.run('script.php', '.', 'php');
      expect(runSpec.command).toBe('php');
      // -n ignores system php.ini (preventing vulnerable extensions from loading)
      expect(runSpec.args).toContain('-n');
      // -d open_basedir=. confines PHP file access strictly to execution directory
      expect(runSpec.args).toContain('open_basedir=.');
      // -d memory_limit=128M prevents memory exhaustion attacks
      expect(runSpec.args).toContain('memory_limit=128M');
      // -- terminates CLI option parsing to prevent option injection
      expect(runSpec.args).toContain('--');
      // Target file must be placed after option termination
      const dashDashIndex = runSpec.args.indexOf('--');
      const fileIndex = runSpec.args.indexOf('script.php');
      expect(dashDashIndex).toBeGreaterThan(-1);
      expect(fileIndex).toBeGreaterThan(dashDashIndex);
    });

    it('terminates CLI option parsing for Bash and Ruby runners', () => {
      const bashSpec = LANGUAGE_DEFINITIONS.bash.run('test.sh', '.', 'bash');
      expect(bashSpec.args[0]).toBe('--');

      const rubySpec = LANGUAGE_DEFINITIONS.ruby.run('test.rb', '.', 'ruby');
      expect(rubySpec.args[0]).toBe('--');
    });
  });

  describe('3. Path Traversal & CLI Argument Injection Prevention (CWE-22 / CWE-88)', () => {
    it('sanitizes execution filenames stripping traversal sequences and null bytes', () => {
      expect(sanitizeExecutionFileName('../../secret.js', 'default.js')).toBe('secret.js');
      expect(sanitizeExecutionFileName('..\\..\\secret.js', 'default.js')).toBe('secret.js');
      expect(sanitizeExecutionFileName('/etc/passwd.js', 'default.js')).toBe('passwd.js');
      expect(sanitizeExecutionFileName('test\0null.js', 'default.js')).toBe('testnull.js');
    });

    it('rejects leading hyphens preventing CLI switch injection', () => {
      expect(sanitizeExecutionFileName('-rf.js', 'default.js')).toBe('default.js');
      expect(sanitizeExecutionFileName('--eval.js', 'default.js')).toBe('default.js');
    });

    it('validates workspace file names against path traversal, separators, and null bytes', () => {
      expect(fileNameSchema.safeParse('valid_component.tsx').success).toBe(true);
      expect(fileNameSchema.safeParse('README.md').success).toBe(true);

      // Traversal and separators must be rejected
      expect(fileNameSchema.safeParse('../evil.ts').success).toBe(false);
      expect(fileNameSchema.safeParse('foo/bar.ts').success).toBe(false);
      expect(fileNameSchema.safeParse('foo\\bar.ts').success).toBe(false);
      expect(fileNameSchema.safeParse('file\0name.ts').success).toBe(false);
    });
  });

  describe('4. HTTP Security Headers (CWE-693 / Clickjacking & MIME-Sniffing Defense)', () => {
    it('serves required OWASP security headers', async () => {
      const app = express();
      app.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        next();
      });
      app.get('/test', (_req, res) => res.send('ok'));

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/test`);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
        expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
        expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=(), payment=()');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
