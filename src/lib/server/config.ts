// src/lib/server/config.ts
import { readFileSync } from 'fs';
import type { AppConfig } from '../types.js';

export function loadConfig(path: string): AppConfig {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (!raw.volume || !Array.isArray(raw.clients) || raw.clients.length === 0) {
    throw new Error('Invalid config: volume and clients are required');
  }
  return raw as AppConfig;
}

const configPath = process.env.CONFIG_PATH ?? 'config.json';
export const config: AppConfig = loadConfig(configPath);
