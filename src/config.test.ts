import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DRIME_API_TOKEN = 'test-token';
    delete process.env.DRIME_READ_ONLY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should default to read-only when DRIME_READ_ONLY is unset', () => {
    expect(loadConfig().readOnly).toBe(true);
  });

  it('should be read-only when DRIME_READ_ONLY is empty', () => {
    process.env.DRIME_READ_ONLY = '';
    expect(loadConfig().readOnly).toBe(true);
  });

  it('should enable writes only when DRIME_READ_ONLY is exactly "false"', () => {
    process.env.DRIME_READ_ONLY = 'false';
    expect(loadConfig().readOnly).toBe(false);
  });

  it('should enable writes for "FALSE" (case-insensitive)', () => {
    process.env.DRIME_READ_ONLY = 'FALSE';
    expect(loadConfig().readOnly).toBe(false);
  });

  it('should stay read-only on a typo (e.g. "fasle")', () => {
    process.env.DRIME_READ_ONLY = 'fasle';
    expect(loadConfig().readOnly).toBe(true);
  });

  it('should stay read-only when set to "true"', () => {
    process.env.DRIME_READ_ONLY = 'true';
    expect(loadConfig().readOnly).toBe(true);
  });
});
