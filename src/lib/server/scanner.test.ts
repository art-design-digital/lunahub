// src/lib/server/scanner.test.ts
import { describe, it, expect } from 'vitest';
import { parseFolderName, parseDateFromFilename } from './scanner.js';

describe('parseFolderName', () => {
  it('parses P-Nummer folder name correctly', () => {
    const result = parseFolderName('P260031_BUESCH_Aktion-Stullen-Spice');
    expect(result.projekt_nr).toBe('P260031');
    expect(result.client).toBe('BUESCH');
    expect(result.name).toBe('Aktion Stullen Spice');
    expect(result.jahr).toBe('2026');
  });

  it('returns folder name as name for unrecognized format', () => {
    const result = parseFolderName('UnbekannterOrdner');
    expect(result.name).toBe('UnbekannterOrdner');
    expect(result.projekt_nr).toBe('');
  });
});

describe('parseDateFromFilename', () => {
  it('extracts date from stem with _YY-MM_ pattern', () => {
    expect(parseDateFromFilename('Layout_26-03_A4')).toBe('03/2026');
  });

  it('returns empty string if no date found', () => {
    expect(parseDateFromFilename('Layout_final')).toBe('');
  });
});
