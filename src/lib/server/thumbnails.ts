import { existsSync, mkdirSync, renameSync } from 'fs';
import { join, extname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const THUMB_SIZE = 500;

// ── Concurrency limiter ───────────────────────────────────────
const MAX_CONCURRENT_THUMBS = 4;
let activeThumbJobs = 0;
const thumbQueue: Array<{ resolve: (v: boolean) => void; fn: () => Promise<boolean> }> = [];
const inProgress = new Set<string>();

function enqueueThumb(fn: () => Promise<boolean>): Promise<boolean> {
  return new Promise((resolve) => {
    thumbQueue.push({ resolve, fn });
    processThumbQueue();
  });
}

async function processThumbQueue() {
  while (thumbQueue.length > 0 && activeThumbJobs < MAX_CONCURRENT_THUMBS) {
    const job = thumbQueue.shift()!;
    activeThumbJobs++;
    job.fn()
      .then(job.resolve)
      .catch(() => job.resolve(false))
      .finally(() => {
        activeThumbJobs--;
        processThumbQueue();
      });
  }
}

export function getThumbPath(cacheDir: string, id: string): string {
  return join(cacheDir, `${id}.jpg`);
}

async function doGenerateThumb(filePath: string, thumbPath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase();
  mkdirSync(join(thumbPath, '..'), { recursive: true });

  if (existsSync(thumbPath)) return true;

  try {
    if (ext === '.pdf') {
      return await generatePdfThumb(filePath, thumbPath);
    } else if (['.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(ext)) {
      return await generateImageThumb(filePath, thumbPath);
    } else if (ext === '.psd') {
      return await generatePsdThumb(filePath, thumbPath);
    } else if (['.ai', '.eps'].includes(ext)) {
      return await generateVectorThumb(filePath, thumbPath);
    }
  } catch { /* ignorieren, kein Thumb */ }

  return false;
}

export async function generateThumb(filePath: string, thumbPath: string): Promise<boolean> {
  // Fast path: already cached
  if (existsSync(thumbPath)) return true;
  // Deduplicate concurrent requests for the same thumb
  if (inProgress.has(thumbPath)) return false;
  inProgress.add(thumbPath);
  try {
    return await enqueueThumb(() => doGenerateThumb(filePath, thumbPath));
  } finally {
    inProgress.delete(thumbPath);
  }
}

// PDF: pdftoppm (poppler) — Seite 1, funktioniert auf macOS + Linux
async function generatePdfThumb(pdfPath: string, thumbPath: string): Promise<boolean> {
  const prefix = thumbPath.replace(/\.jpg$/, '');
  await execFileAsync('pdftoppm', [
    '-jpeg', '-f', '1', '-l', '1',
    '-scale-to', String(THUMB_SIZE),
    pdfPath, prefix,
  ], { timeout: 30_000 });
  // pdftoppm erzeugt prefix-1.jpg
  const out = `${prefix}-1.jpg`;
  if (existsSync(out)) {
    renameSync(out, thumbPath);
    return true;
  }
  return false;
}

// Bilder: sharp (cross-platform)
async function generateImageThumb(filePath: string, thumbPath: string): Promise<boolean> {
  await sharp(filePath)
    .resize(THUMB_SIZE, Math.round(THUMB_SIZE * 1.414), { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toFile(thumbPath);
  return existsSync(thumbPath);
}

// PSD: macOS → sips, Linux → magick
async function generatePsdThumb(filePath: string, thumbPath: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    await execFileAsync('sips', [
      '-z', String(Math.round(THUMB_SIZE * 1.414)), String(THUMB_SIZE),
      '--setProperty', 'format', 'jpeg',
      filePath, '--out', thumbPath,
    ], { timeout: 30_000 });
  } else {
    await execFileAsync('magick', [
      `${filePath}[0]`,
      '-resize', `${THUMB_SIZE}x${Math.round(THUMB_SIZE * 1.414)}>`,
      '-quality', '85',
      thumbPath,
    ], { timeout: 30_000 });
  }
  return existsSync(thumbPath);
}

// AI/EPS: macOS → sips, Linux → gs
async function generateVectorThumb(filePath: string, thumbPath: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    await execFileAsync('sips', [
      '-z', String(Math.round(THUMB_SIZE * 1.414)), String(THUMB_SIZE),
      '--setProperty', 'format', 'jpeg',
      filePath, '--out', thumbPath,
    ], { timeout: 30_000 });
  } else {
    await execFileAsync('gs', [
      '-dNOPAUSE', '-dBATCH', '-dSAFER',
      '-sDEVICE=jpeg',
      `-sOutputFile=${thumbPath}`,
      `-dDEVICEWIDTHPOINTS=${THUMB_SIZE}`,
      `-dDEVICEHEIGHTPOINTS=${Math.round(THUMB_SIZE * 1.414)}`,
      '-dFITBOX', '-r144',
      filePath,
    ], { timeout: 30_000 });
  }
  return existsSync(thumbPath);
}
