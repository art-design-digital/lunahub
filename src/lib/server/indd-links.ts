import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const LINK_EXTENSIONS = new Set(['.jpg', '.jpeg', '.tif', '.tiff', '.png', '.eps', '.ai', '.psd', '.svg']);
const MIN_NAME_LENGTH = 5;

export async function extractInddLinks(inddPath: string): Promise<string[]> {
  const found = new Set<string>();

  // On macOS use plain strings; on Linux also try -encoding l for UTF-16 LE
  const encodingVariants: string[][] = process.platform === 'linux'
    ? [[], ['-encoding', 'l']]
    : [[]];

  for (const encodingArgs of encodingVariants) {
    try {
      const { stdout } = await execFileAsync('strings', [...encodingArgs, inddPath], {
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const output = stdout.slice(0, 1_000_000);

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
