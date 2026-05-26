// src/lib/server/config.ts
import { readFileSync } from 'fs';
import { isAbsolute } from 'path';
import type { AppConfig } from '../types';

export function loadConfig(path: string): AppConfig {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (!raw.volume || !Array.isArray(raw.clients) || raw.clients.length === 0) {
    throw new Error('Invalid config: volume and clients are required');
  }
  if (!isAbsolute(raw.volume)) {
    throw new Error(`Invalid config: volume must be an absolute path, got "${raw.volume}"`);
  }
  return raw as AppConfig;
}

const configPath = process.env.CONFIG_PATH ?? 'config.json';

let loaded: AppConfig;
try {
  loaded = loadConfig(configPath);
} catch (e) {
  console.warn(`[config] Could not load ${configPath}: ${e instanceof Error ? e.message : e}. Using fallback.`);
  loaded = { volume: '/data/projekte', clients: [] };
}

// Allow VOLUME_PATH env to override config.json (useful for Docker)
if (process.env.VOLUME_PATH) {
  loaded.volume = process.env.VOLUME_PATH;
}

export const config: AppConfig = loaded;
