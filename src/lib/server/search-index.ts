import MiniSearch from 'minisearch';
import { extname } from 'path';
import type { Project } from '../types.js';
import { extractPdfText, extractInddText } from './pdf-text.js';

export interface SearchDoc {
  id: string;           // eindeutig: filePath
  fileName: string;
  projectName: string;
  projektnr: string;
  folder: string;
  ext: string;
  text: string;
}

export function buildSearchIndex(projects: (Project & { _filePaths: string[] })[]): MiniSearch<SearchDoc> {
  const index = new MiniSearch<SearchDoc>({
    fields: ['text', 'fileName', 'projectName', 'projektnr'],
    storeFields: ['fileName', 'projectName', 'projektnr', 'folder', 'ext'],
    searchOptions: { prefix: true, fuzzy: 0.15 },
  });

  const docs: SearchDoc[] = [];

  for (const project of projects) {
    for (const filePath of project._filePaths ?? []) {
      const ext = extname(filePath).toLowerCase();
      let text = '';
      if (ext === '.pdf') text = extractPdfText(filePath);
      else if (ext === '.indd') text = extractInddText(filePath);
      else continue; // AI/EPS/PSD — kein Text

      if (!text.trim()) continue;

      docs.push({
        id: filePath,
        fileName: filePath.split('/').pop()!,
        projectName: project.meta.name,
        projektnr: project.meta.projekt_nr,
        folder: project.folder,
        ext,
        text,
      });
    }
  }

  index.addAll(docs);
  return index;
}
