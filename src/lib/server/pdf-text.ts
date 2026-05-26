import { execFile } from 'child_process';
import { promisify } from 'util';
import { stat } from 'fs/promises';

const execFileAsync = promisify(execFile);

interface CacheEntry {
  mtimeMs: number;
  text: string;
}

const pdfCache = new Map<string, CacheEntry>();
const inddCache = new Map<string, CacheEntry>();

async function getCachedOrExtract(
  filePath: string,
  cache: Map<string, CacheEntry>,
  extractor: (path: string) => Promise<string>
): Promise<string> {
  try {
    const mtime = (await stat(filePath)).mtimeMs;
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === mtime) {
      return cached.text;
    }
    const text = await extractor(filePath);
    cache.set(filePath, { mtimeMs: mtime, text });
    return text;
  } catch {
    return '';
  }
}

async function doExtractPdfText(pdfPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-f', '1', '-l', '2', pdfPath, '-'], {
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.slice(0, 100_000);
  } catch {
    return '';
  }
}

async function doExtractInddText(inddPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('strings', ['-n', '4', inddPath], {
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.split('\n')
      .filter(l => { const t = l.trim(); return t.length >= 3 && t.length <= 60; })
      .join('\n')
      .slice(0, 200_000);
  } catch {
    return '';
  }
}

export async function extractPdfText(pdfPath: string): Promise<string> {
  return getCachedOrExtract(pdfPath, pdfCache, doExtractPdfText);
}

export async function extractInddText(inddPath: string): Promise<string> {
  return getCachedOrExtract(inddPath, inddCache, doExtractInddText);
}
