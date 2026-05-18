// src/lib/types.ts

export interface ProjectFile {
  name: string;
  ext: string;
  thumbId: string | null;  // SHA-256-Hash des Dateipfads, für /api/thumb/:id
  datum: string;
  search: string;
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
  clients: Array<{
    folder: string;
    pattern: 'P-nummer';
  }>;
}
