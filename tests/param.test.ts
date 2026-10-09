import { describe, it, expect } from 'vitest';
import { param } from '../server/middleware/auth';

describe('param helper', () => {
  it('param() with a plain string', () => {
    expect(param('hello')).toBe('hello');
    expect(param('12345')).toBe('12345');
    expect(param('')).toBe('');
  });

  it('param() with an array', () => {
    expect(param(['first', 'second'])).toBe('first');
    expect(param(['single'])).toBe('single');
    expect(param([])).toBe('');
  });

  it('param() with undefined', () => {
    expect(param(undefined)).toBe('');
  });
});
