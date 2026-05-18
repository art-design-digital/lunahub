import { execFileSync } from 'child_process';

export function extractPdfText(pdfPath: string): string {
  try {
    return execFileSync('pdftotext', [pdfPath, '-'], {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    }).toString('utf-8');
  } catch {
    return '';
  }
}

export function extractInddText(inddPath: string): string {
  try {
    return execFileSync('strings', [inddPath], {
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    }).toString('utf-8');
  } catch {
    return '';
  }
}
