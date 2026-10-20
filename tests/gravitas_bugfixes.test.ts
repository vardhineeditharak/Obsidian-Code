import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { ROOM_NAME_REGEX } from '../server/websocket/yjsServer';
import { detectLanguage as serverDetectLanguage } from '../server/routes/fileRoutes';
import { detectLanguage as clientDetectLanguage } from '../src/lib/language';
import { analyzeCode } from '../src/lib/diagnostics/codeDiagnostics';

describe('Gravitas Bug Fixes & Codebase Inconsistencies', () => {
  describe('Fix 1: Yjs WebSocket Room Name Regex with Hyphenated IDs', () => {
    it('correctly matches room names containing hyphens in projectId and fileId', () => {
      const room1 = 'obsidian-project-proj-123-abc-file-file-xyz';
      const match1 = room1.match(ROOM_NAME_REGEX);
      expect(match1).not.toBeNull();
      expect(match1![1]).toBe('proj-123-abc');
      expect(match1![2]).toBe('file-xyz');

      const uuidRoom = 'obsidian-project-550e8400-e29b-41d4-a716-446655440000-file-readme-md';
      const match2 = uuidRoom.match(ROOM_NAME_REGEX);
      expect(match2).not.toBeNull();
      expect(match2![1]).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(match2![2]).toBe('readme-md');
    });

    it('rejects invalid or malformed room names', () => {
      expect('invalid-room-name'.match(ROOM_NAME_REGEX)).toBeNull();
      expect('obsidian-project--file-'.match(ROOM_NAME_REGEX)).toBeNull();
      expect('obsidian-project-abc'.match(ROOM_NAME_REGEX)).toBeNull();
    });

    it('cleans up awareness states when a client disconnects', () => {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      
      awareness.setLocalStateField('user', { name: 'Alice' });
      // Simulate remote client state
      awarenessProtocol.applyAwarenessUpdate(
        awareness,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID]),
        null
      );

      // Verify controlled client state exists
      const controlledClients = new Set<number>([awareness.clientID]);
      expect(awareness.getStates().has(awareness.clientID)).toBe(true);

      // On socket close, removeAwarenessStates is invoked
      awarenessProtocol.removeAwarenessStates(awareness, Array.from(controlledClients), null);

      expect(awareness.getStates().has(awareness.clientID)).toBe(false);
    });
  });

  describe('Fix 2: Server File Language Detection Parity', () => {
    it('accurately detects compiled and scripting languages in server/routes/fileRoutes.ts', () => {
      expect(serverDetectLanguage('main.c')).toBe('c');
      expect(serverDetectLanguage('header.h')).toBe('c');
      expect(serverDetectLanguage('program.cpp')).toBe('cpp');
      expect(serverDetectLanguage('App.java')).toBe('java');
      expect(serverDetectLanguage('server.go')).toBe('go');
      expect(serverDetectLanguage('script.rb')).toBe('ruby');
      expect(serverDetectLanguage('index.php')).toBe('php');
      expect(serverDetectLanguage('deploy.sh')).toBe('bash');
      expect(serverDetectLanguage('schema.sql')).toBe('sql');
      expect(serverDetectLanguage('config.cjs')).toBe('javascript');
    });

    it('maintains parity with client/src/lib/language.ts', () => {
      const testFiles = [
        'main.c', 'app.cpp', 'Service.java', 'main.go',
        'script.rb', 'index.php', 'build.sh', 'query.sql', 'app.cjs'
      ];
      for (const file of testFiles) {
        expect(serverDetectLanguage(file)).toBe(clientDetectLanguage(file));
      }
    });
  });

  describe('Fix 3: Code Diagnostics Delimiters, Multi-Language Comments & Quote Resets', () => {
    it('ignores delimiters inside single-line and multi-line comments in C/C++/Java/Go/PHP', () => {
      const cCodeWithComments = `
        #include <stdio.h>
        // Delimiters inside comment: { ( [
        /* Block comment with delimiters:
           { ( [
        */
        int main() {
          return 0;
        }
      `;
      const diagnostics = analyzeCode(cCodeWithComments, 'file-c', 'main.c', 'c');
      const delimiterErrors = diagnostics.filter((d) => d.message.includes('delimiter'));
      expect(delimiterErrors).toHaveLength(0);
    });

    it('ignores delimiters inside hash comments for Python/Ruby/Bash', () => {
      const pyCodeWithHashComment = `
        # Delimiters in comment: ( [ {
        def test():
          return 1
      `;
      const diagnostics = analyzeCode(pyCodeWithHashComment, 'file-py', 'test.py', 'python');
      const delimiterErrors = diagnostics.filter((d) => d.message.includes('delimiter'));
      expect(delimiterErrors).toHaveLength(0);
    });

    it('resets unclosed single/double quotes at end of line so subsequent errors are still caught', () => {
      const codeWithUnclosedQuoteOnLine1 = `
        const x = "unclosed quote on this line;
        function broken() {
          const y = (1 + 2;
        }
      `;
      const diagnostics = analyzeCode(codeWithUnclosedQuoteOnLine1, 'file-js', 'test.js', 'javascript');
      // Line 4 has unclosed '(' which must still be detected rather than swallowed by quote bleed
      const unclosedParen = diagnostics.find((d) => d.message.includes("Unclosed delimiter '('"));
      expect(unclosedParen).toBeDefined();
      expect(unclosedParen?.line).toBe(4);
    });
  });
});
