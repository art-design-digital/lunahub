// src/lib/server/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';
import { writeFileSync, unlinkSync } from 'fs';

describe('loadConfig', () => {
  it('loads and validates a valid config', () => {
    const path = '/tmp/test-config.json';
    writeFileSync(path, JSON.stringify({
      volume: '/data/projekte',
      clients: [{ folder: 'BUESCH', pattern: 'P-nummer' }]
    }));
    const cfg = loadConfig(path);
    expect(cfg.volume).toBe('/data/projekte');
    expect(cfg.clients).toHaveLength(1);
    unlinkSync(path);
  });

  it('throws if config is missing required fields', () => {
    const path = '/tmp/test-config-bad.json';
    writeFileSync(path, JSON.stringify({ volume: '/data' }));
    expect(() => loadConfig(path)).toThrow();
    unlinkSync(path);
  });
});
