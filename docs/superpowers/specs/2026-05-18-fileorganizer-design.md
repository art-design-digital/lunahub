# Fileorganizer — Design Spec
**Datum:** 2026-05-18  
**Status:** Approved

---

## Überblick

Web-App die den bestehenden statischen `_INDEX.html`-Ansatz ersetzt. Läuft als Docker-Container auf dem NAS, ist über Cloudflare Tunnel von überall erreichbar, erfordert individuelle Logins und ist vollständig read-only.

---

## Architektur

```
[Browser] ←→ [Cloudflare Tunnel] ←→ [Docker: SvelteKit/Node auf NAS]
                                              ↓
                                     [NAS Dateisystem: /Projekte/…]
```

Zwei Docker-Container via `docker-compose`:
- `fileorganizer` — SvelteKit-App (Node-Adapter)
- `cloudflared` — Cloudflare Tunnel

Die App liest die Projektdateien direkt vom NAS-Dateisystem via Docker-Volume-Mount. Kein SMB, kein externes Volume-Mounting nötig.

---

## Tech Stack

| Komponente | Technologie |
|---|---|
| Framework | SvelteKit (Node-Adapter) |
| Auth | `express-session` + `bcrypt` |
| User-Store | SQLite (`better-sqlite3`) |
| File-Scanning | Node `fs` (direkt) |
| PDF-Thumbnails | `sharp` + `ghostscript` |
| PSD-Thumbnails | ImageMagick |
| INDD-Thumbnails | Platzhalter-Icons |
| Volltext-Suche | `MiniSearch` (in-memory) |
| Deployment | Docker + docker-compose |
| HTTPS/Domain | Cloudflare Tunnel |

---

## Konfiguration

Die zu scannenden Kundenordner werden in einer `config.json` im Projekt-Root definiert:

```json
{
  "volume": "/data/projekte",
  "clients": [
    { "folder": "BUESCH", "pattern": "P-nummer" },
    { "folder": "EMV",    "pattern": "P-nummer" }
  ]
}
```

`pattern: "P-nummer"` bedeutet: Projektordner müssen mit `P` + mind. 5 Ziffern beginnen (z.B. `P260031_BUESCH_Name`). Weitere Muster können später ergänzt werden.

---

## Daten-Layer

### Scan-Zyklus
- Vollständiger Scan beim App-Start
- Automatischer Hintergrund-Rescan alle 30 Minuten
- Manueller Refresh via Button in der UI (POST `/api/refresh`)
- Ergebnis liegt im RAM — keine Datenbank für den Index nötig

### Was gescannt wird
- Projektordner (nach konfiguriertem Muster)
- Design-Dateien: `.pdf`, `.indd`, `.ai`, `.eps`, `.psd`
- Thumbnails: lazy generiert beim ersten Abruf, dann auf Disk gecacht
- INDD-Verlinkungen: via `strings` (ASCII + UTF-16 LE) — best-effort
- PDF-Volltext: via `pdftotext`, in MiniSearch-Index
- INDD-Volltext: via `strings` — best-effort für kurze Strings wie Produktnummern

### Fehlende Links Detection
Beim Scan jeder INDD: extrahierte Verlinkungen werden gegen das Dateisystem geprüft. Fehlt eine Datei → Projekt bekommt ein `missingLinks: true`-Flag.

### API-Endpunkte
```
GET  /api/projects        Projektliste mit Dateien + Flags
GET  /api/links           Rückwärts-Index: Bild → INDDs
GET  /api/indd            Vorwärts-Index: INDD → Bilder
GET  /api/search?q=...    Volltext-Suche (MiniSearch)
GET  /api/thumb/:id       Thumbnail-Bild (gecacht)
POST /api/refresh         Scan neu starten (nur auth)
GET  /api/status          Letzter Scan-Zeitstempel
```

---

## Authentifizierung

- Jede Route außer `/login` erfordert eine gültige Session
- Login via E-Mail + Passwort
- Sessions: 8 Stunden (Standard), 30 Tage mit "Eingeloggt bleiben"
- Passwörter: `bcrypt`-gehasht in SQLite
- Brute-Force-Schutz: 5 Fehlversuche → 15 Minuten gesperrt
- HTTPS via Cloudflare (kein selbstverwaltetes Zertifikat)

### User-Verwaltung (CLI)
```bash
docker exec fileorganizer node cli.js add-user "anna@art-design.de"
docker exec fileorganizer node cli.js remove-user "anna@art-design.de"
docker exec fileorganizer node cli.js reset-password "anna@art-design.de"
```

---

## Frontend

### Routen
- `/login` — E-Mail + Passwort
- `/` — Hauptseite (SSR beim ersten Load, danach SPA)

### Header (sticky)
- Logo / App-Name
- Tab-Navigation: Dateien · Verlinkungen · Textsuche
- Kontextuelles Suchfeld (je nach aktivem Tab)
- "Zuletzt aktualisiert: vor X Minuten" + Refresh-Button
- Logout

### Tab 1: Dateien
- **Suche:** Freitext (Projektname, Projektnummer, Dateiname)
- **Filter:**
  - Dateityp: PDF / INDD / AI / EPS / PSD (Toggle-Buttons)
  - Jahr: 2026 / 2025 / 2024 / älter (aus Projektnummer extrahiert)
  - Archiv: ein/ausblenden (Standard: ausgeblendet)
- **Sortierung:** Neueste zuerst (Standard) / Älteste / Alphabetisch
- **Grid:** Karten mit Thumbnail, Projektnummer, Projektname, Dateityp-Badge, Datum
- **Karte:** Klick öffnet Projektordner via `file://`-URL
- **Badge:** Rotes Warnsymbol wenn INDD fehlende Links hat
- **Zuletzt angesehen:** letzte 5 geöffneten Projekte oben angeheftet (localStorage)

### Tab 2: Verlinkungen
Zwei Sub-Tabs:
- **Bild → INDDs:** Bildname eingeben → welche INDDs verwenden es
- **INDD → Bilder:** INDD-Name eingeben → welche Bilder sind verlinkt

Jedes Ergebnis zeigt Projektnummer, Projektname, INDD-Dateiname und "Ordner öffnen"-Link.

### Tab 3: Textsuche
- Einzelnes Suchfeld
- Sucht in: PDF-Text (zuverlässig) + INDD-Strings (best-effort)
- Ergebnisse: Dateiname, Projektname, Dateityp-Badge, "Ordner öffnen"-Link
- Hinweis in der UI: "INDD-Ergebnisse sind eventuell unvollständig"

---

## Deployment

### docker-compose.yml (Struktur)
```yaml
services:
  fileorganizer:
    build: .
    volumes:
      - /volume1/Projekte:/data/projekte:ro   # NAS-Pfad anpassen
      - ./data:/app/data                       # SQLite + Thumb-Cache
    ports:
      - "3000:3000"
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
```

### Voraussetzungen auf dem NAS
- Docker + docker-compose (Synology: Container Manager / QNAP: Container Station)
- Cloudflare-Account (kostenlos)
- Domain oder Subdomain (z.B. `index.art-design.de`)

---

## Was diese App nicht macht
- Keine Datei-Operationen (kein Upload, Download, Umbenennen, Löschen)
- Kein Admin-Interface im Browser
- Kein E-Mail-Versand
- Keine Echtzeit-Kollaboration

---

## Offene Punkte (für später)
- INDD-Verlinkungen via ExtendScript statt `strings` (genauere Ergebnisse)
- Weitere Kunden-Schemas in `config.json` ergänzen
- Admin-Interface für User-Verwaltung im Browser
- Favoriten / Projekte anpinnen
