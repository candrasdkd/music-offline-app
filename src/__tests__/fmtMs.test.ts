import { describe, it, expect } from 'vitest';
import { fmtMs } from '../lib/fmt';

describe('fmtMs', () => {
  it('returns empty for undefined', () => {
    expect(fmtMs(undefined as any)).toBe('');
  });
  it('formats under one minute', () => {
    expect(fmtMs(0)).toBe('0:00');
    expect(fmtMs(7000)).toBe('0:07');
    expect(fmtMs(59999)).toBe('0:59');
  });
  it('formats minutes and seconds', () => {
    expect(fmtMs(60000)).toBe('1:00');
    expect(fmtMs(61000)).toBe('1:01');
    expect(fmtMs(125000)).toBe('2:05');
  });
});
