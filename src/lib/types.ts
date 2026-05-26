// src/lib/types.ts

export interface ProjectFile {
  name: string;
  ext: string;
  thumbId: string | null;  // SHA-256-Hash des Dateipfads, für /api/thumb/:id
  filePath: string;         // Absoluter Pfad zur Datei
  datum: string;
  search: string;
  textContent?: string;     // Extrahierter Text (PDF/INDD), nur server-seitig für den Suchindex
}

export interface Project {
  id: string;              // Projektnummer z.B. "P260031"
  folder: string;          // Absoluter Pfad zum Projektordner
  meta: {
    projekt_nr: string;
    jahr: string;
    client: string;
    name: string;
    name_raw: string;
  };
  files: ProjectFile[];
  isArchiv: boolean;
  missingLinks: boolean;
}

export interface InddLinkEntry {
  indd: string;
  proj: string;
  name: string;
  folder: string;
}

export interface InddEntry {
  proj: string;
  name: string;
  folder: string;
  links: string[];
}

export interface AppUser {
  id: number;
  email: string;
}

export interface AppConfig {
  volume: string;
  smbUrl?: string;
  clients: Array<{
    folder: string;
  }>;
}
