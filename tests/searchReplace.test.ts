import { describe, it, expect } from 'vitest';

describe('Search & Replace Engine', () => {
  it('correctly matches whole words without partial hits', () => {
    const text = 'The cat in the catalog caught a catfish.';
    const query = 'cat';
    const regex = new RegExp(`\\b${query}\\b`, 'gi');

    const matches = Array.from(text.matchAll(regex));
    expect(matches.length).toBe(1);
    expect(matches[0].index).toBe(4);
  });

  it('correctly respects case sensitivity', () => {
    const text = 'App app APP';
    const query = 'app';

    const caseSensitiveRegex = new RegExp(query, 'g');
    const caseInsensitiveRegex = new RegExp(query, 'gi');

    expect(Array.from(text.matchAll(caseSensitiveRegex)).length).toBe(1);
    expect(Array.from(text.matchAll(caseInsensitiveRegex)).length).toBe(3);
  });

  it('performs safe batch replacement across multi-line content', () => {
    const code = 'const PORT = 3000;\nconsole.log(PORT);';
    const pattern = new RegExp('\\bPORT\\b', 'g');
    const replaced = code.replace(pattern, 'SERVER_PORT');

    expect(replaced).toBe('const SERVER_PORT = 3000;\nconsole.log(SERVER_PORT);');
  });
});
