import { execFileSync } from 'child_process';

const LINK_EXTENSIONS = new Set(['.jpg', '.jpeg', '.tif', '.tiff', '.png', '.eps', '.ai', '.psd', '.svg']);
const MIN_NAME_LENGTH = 5;

export function extractInddLinks(inddPath: string): string[] {
  const found = new Set<string>();

  for (const encodingArgs of [[], ['-encoding', 'l']] as string[][]) {
    try {
      const output = execFileSync('strings', [...encodingArgs, inddPath], {
        timeout: 60_000,
        maxBuffer: 50 * 1024 * 1024,
      }).toString('utf-8', 0, 50 * 1024 * 1024);

      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        const name = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx < 1) continue;
        const ext = name.slice(dotIdx).toLowerCase();
        const stem = name.slice(0, dotIdx);
        if (LINK_EXTENSIONS.has(ext) && stem.length >= MIN_NAME_LENGTH - ext.length) {
          found.add(name);
        }
      }
    } catch { /* strings fehlgeschlagen — ignorieren */ }
  }

  return [...found].sort();
}
