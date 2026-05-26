import MiniSearch from 'minisearch';
import type { Project } from '../types';

export interface SearchDoc {
  id: string;
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

  for (const project of projects) {
    for (let i = 0; i < project.files.length; i++) {
      const file = project.files[i];
      const fullPath = project._filePaths[i];
      index.add({
        id: fullPath,
        fileName: file.name,
        projectName: project.meta.name,
        projektnr: project.meta.projekt_nr,
        folder: project.folder,
        ext: file.ext,
        text: [file.search, file.textContent ?? ''].join(' '),
      });
    }
  }

  return index;
}
