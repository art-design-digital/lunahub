import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const THUMB_SIZE = 500;

export function getThumbPath(cacheDir: string, id: string): string {
  return join(cacheDir, `${id}.jpg`);
}

export async function generateThumb(filePath: string, thumbPath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase();
  mkdirSync(join(thumbPath, '..'), { recursive: true });

  if (existsSync(thumbPath)) return true;

  try {
    if (ext === '.pdf') {
      return await generatePdfThumb(filePath, thumbPath);
    } else if (['.psd', '.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(ext)) {
      return await generateImageThumb(filePath, thumbPath);
    } else if (['.ai', '.eps'].includes(ext)) {
      return await generateGhostscriptThumb(filePath, thumbPath);
    }
  } catch { /* ignorieren, kein Thumb */ }

  return false;
}

async function generatePdfThumb(pdfPath: string, thumbPath: string): Promise<boolean> {
  await execFileAsync('gs', [
    '-dNOPAUSE', '-dBATCH', '-dSAFER',
    '-sDEVICE=jpeg',
    `-sOutputFile=${thumbPath}`,
    `-dDEVICEWIDTHPOINTS=${THUMB_SIZE}`,
    `-dDEVICEHEIGHTPOINTS=${Math.round(THUMB_SIZE * 1.414)}`,
    '-dFITBOX', '-dFirstPage=1', '-dLastPage=1',
    '-r144',
    pdfPath,
  ], { timeout: 30_000 });
  return existsSync(thumbPath);
}

async function generateImageThumb(filePath: string, thumbPath: string): Promise<boolean> {
  await sharp(filePath)
    .resize(THUMB_SIZE, Math.round(THUMB_SIZE * 1.414), { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toFile(thumbPath);
  return existsSync(thumbPath);
}

async function generateGhostscriptThumb(filePath: string, thumbPath: string): Promise<boolean> {
  await execFileAsync('gs', [
    '-dNOPAUSE', '-dBATCH', '-dSAFER',
    '-sDEVICE=jpeg',
    `-sOutputFile=${thumbPath}`,
    `-dDEVICEWIDTHPOINTS=${THUMB_SIZE}`,
    `-dDEVICEHEIGHTPOINTS=${Math.round(THUMB_SIZE * 1.414)}`,
    '-dFITBOX', '-r144',
    filePath,
  ], { timeout: 30_000 });
  return existsSync(thumbPath);
}
