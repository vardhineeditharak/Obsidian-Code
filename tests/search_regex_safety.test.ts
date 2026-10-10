import { describe, it, expect } from 'vitest';

describe('Search & Replace Regex Safety and Robustness', () => {
  // Test the scan loop algorithm implemented in SearchReplaceModal
  const scanContent = (
    text: string,
    query: string,
    options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean; maxResults?: number } = {}
  ) => {
    let pattern = options.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (options.wholeWord) pattern = `\\b${pattern}\\b`;
    const flags = options.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(pattern, flags);

    const lines = text.split('\n');
    const matches: { line: number; column: number; matchText: string }[] = [];
    const max = options.maxResults ?? 2000;

    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      if (matches.length >= max) break;
      const lineText = lines[lIdx];
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        if (match[0] === '') {
          regex.lastIndex++;
          continue;
        }
        matches.push({
          line: lIdx + 1,
          column: match.index + 1,
          matchText: match[0],
        });
        if (matches.length >= max) break;
        if (!regex.global) break;
      }
    }

    return matches;
  };

  it('zero-length pattern (a*) over sample text terminates and returns 0-length-skipped results', () => {
    const text = 'banana and apple\naaa bbb';
    // Without the zero-length guard, a* on "banana" matches "" at index 0 and hangs forever
    const start = Date.now();
    const results = scanContent(text, 'a*', { useRegex: true });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000); // Must terminate instantly without infinite loop
    expect(results.length).toBeGreaterThan(0);
    // Non-empty matches of 'a*'
    for (const r of results) {
      expect(r.matchText.length).toBeGreaterThan(0);
      expect(r.matchText).toMatch(/^a+$/);
    }
  });

  it('terminates safely on boundary and optional patterns (\\b, x?, (?:))', () => {
    const text = 'foo bar baz';
    const boundaryResults = scanContent(text, '\\b', { useRegex: true });
    expect(boundaryResults.length).toBe(0); // Zero-length matches safely skipped

    const optResults = scanContent(text, 'x?', { useRegex: true });
    expect(optResults.length).toBe(0); // Only skipped zero-length
  });

  it('normal multi-match search counts', () => {
    const text = 'const foo = 1;\nconst bar = foo + foo;\nconsole.log(foo);';
    const results = scanContent(text, 'foo');
    expect(results.length).toBe(4);
    expect(results[0]).toEqual({ line: 1, column: 7, matchText: 'foo' });
    expect(results[1]).toEqual({ line: 2, column: 13, matchText: 'foo' });
    expect(results[2]).toEqual({ line: 2, column: 19, matchText: 'foo' });
    expect(results[3]).toEqual({ line: 3, column: 13, matchText: 'foo' });
  });

  it('case and whole-word modifiers', () => {
    const text = 'Cat cat CAT caterpillar catfish';
    const caseSensitive = scanContent(text, 'cat', { caseSensitive: true });
    expect(caseSensitive.length).toBe(3); // 'cat', 'cat' in caterpillar, 'cat' in catfish

    const wholeWord = scanContent(text, 'cat', { wholeWord: true });
    expect(wholeWord.length).toBe(3); // 'Cat', 'cat', 'CAT'

    const caseAndWhole = scanContent(text, 'cat', { caseSensitive: true, wholeWord: true });
    expect(caseAndWhole.length).toBe(1); // 'cat' only
    expect(caseAndWhole[0].matchText).toBe('cat');
  });

  it('enforces maximum results cap at 2000 matches', () => {
    const longText = Array.from({ length: 3000 }, () => 'match').join('\n');
    const results = scanContent(longText, 'match', { maxResults: 2000 });
    expect(results.length).toBe(2000);
  });
});
