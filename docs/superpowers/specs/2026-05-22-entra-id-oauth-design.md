# Microsoft Entra ID OAuth -- Fileorganizer

**Datum:** 2026-05-22
**Status:** Approved
**Scope:** Passwort-Auth durch Microsoft Entra ID OAuth 2.0 / OIDC ersetzen

## Motivation

Alle Mitarbeiter bei art&design haben Exchange-Konten mit `@art-design.de` Adressen. Statt separate Passwörter in der App zu verwalten, soll Microsoft als Identity Provider dienen. Vorteile: kein Passwort-Management, MFA von Microsoft gratis, SSO-Erlebnis.

## Auth-Flow

```
1. User klickt "Mit Microsoft anmelden"
2. GET /auth/login → generiert state-Token, setzt state-Cookie, redirect zu Microsoft
3. Microsoft authenticate → redirect zu /auth/callback?code=xxx&state=yyy
4. GET /auth/callback:
   a. state aus Cookie mit state aus Query vergleichen (CSRF)
   b. POST an Microsoft token-endpoint: code → id_token
   c. id_token (JWT) decodieren → email extrahieren
   d. Prüfen: email endet auf @art-design.de UND tenant_id matcht
   e. findOrCreateUser(email) in SQLite
   f. Session-Cookie setzen (bestehende Logik)
   g. Redirect zu /
5. Bei Fehler → Redirect zu /login?error=<message>
```

## Microsoft-Endpunkte

- **Authorize:** `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
- **Token:** `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- **Scopes:** `openid email profile`

## Dateien

### Neu

| Datei | Beschreibung |
|---|---|
| `src/routes/auth/login/+server.ts` | Baut Auth-URL mit state, client_id, redirect_uri, scope. Setzt state-Cookie. Redirect zu Microsoft. |
| `src/routes/auth/callback/+server.ts` | Empfängt code + state. Validiert state gegen Cookie. Tauscht code gegen Token. Prüft email-Domain + tenant. Erstellt/findet User. Setzt Session-Cookie. Redirect zu `/`. |
| `.env.example` | Dokumentiert benötigte Env-Vars. |

### Geaendert

| Datei | Aenderung |
|---|---|
| `src/routes/login/+page.svelte` | Email/Passwort-Form entfernen. Einzelner "Mit Microsoft anmelden"-Button, Link zu `/auth/login`. Fehleranzeige via `?error` Query-Param. |
| `src/lib/server/auth.ts` | `hashPassword` und `verifyPassword` entfernen. `createSession`, `destroySession`, `getSessionUser` bleiben unveraendert. |
| `src/lib/server/db.ts` | `password_hash` aus users-Schema entfernen. `rate_limits`-Tabelle entfernen. `createUser(email, hash)` ersetzen durch `findOrCreateUser(email)` (INSERT OR IGNORE + SELECT). Rate-Limit-Funktionen entfernen. |
| `src/hooks.server.ts` | Routes `/auth/*` und `/login` vom Session-Check ausnehmen. |
| `package.json` | `bcryptjs` und `@types/bcryptjs` entfernen. |

### Geloescht

| Datei | Grund |
|---|---|
| `src/routes/login/+page.server.ts` | Kein Form-Handler mehr noetig -- Login laeuft ueber OAuth-Redirect. |

## DB-Schema (nach Migration)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Entfernt: `password_hash`-Spalte, `rate_limits`-Tabelle.

Da SQLite kein DROP COLUMN zuverlaessig kann und die DB jung ist: Tabellen neu erstellen (DROP + CREATE). Bestehende Sessions werden dabei invalidiert (User muss sich einmal neu einloggen -- kein Problem da OAuth).

## Umgebungsvariablen

```
AZURE_TENANT_ID=<euer-tenant-id>
AZURE_CLIENT_ID=<app-registration-client-id>
AZURE_CLIENT_SECRET=<app-registration-client-secret>
ORIGIN=https://eure-domain.de
```

`ORIGIN` wird fuer die redirect_uri benoetigt (`${ORIGIN}/auth/callback`).

## Login-Page Design

- art&design Logo-Header (dunkelgrau) bleibt
- "Projekt-Index" Subtitle bleibt
- Statt Formular: ein Button "Mit Microsoft anmelden" im bestehenden Farbschema (`#890813`)
- Optional: kleines Microsoft-Icon im Button
- Fehlermeldung bei `?error` Query-Param (gleicher Stil wie bisheriger Error-Banner)
- Footer "art&design werbeagentur GmbH" bleibt

## Sicherheit

1. **Single-Tenant:** Authorize-URL nutzt `/{tenant}/` statt `/common/` -- nur euer Tenant
2. **Domain-Check:** Email muss auf `@art-design.de` enden (Defense in Depth)
3. **Tenant-Check:** `tid` Claim im Token muss mit `AZURE_TENANT_ID` uebereinstimmen
4. **CSRF:** `state`-Parameter (random hex) in Cookie gespeichert, im Callback verglichen
5. **Sessions:** httpOnly, secure, sameSite=lax Cookie-Logik bleibt
6. **Server-Side Only:** Client-Secret nie im Frontend

## Was wegfaellt

- `bcryptjs` + `@types/bcryptjs` Dependencies
- Rate-Limiting-Logik (Microsoft uebernimmt Brute-Force-Schutz)
- Passwort-Hashing und -Verifikation
- Manuelle User-Erstellung (User werden beim ersten Login automatisch angelegt)

## Voraussetzungen (Azure Portal)

1. App Registration in Microsoft Entra ID erstellen
2. Redirect URI setzen: `https://<domain>/auth/callback`
3. Client Secret generieren
4. Platform: Web
5. Supported Account Types: "Accounts in this organizational directory only" (Single Tenant)
6. API Permissions: `openid`, `email`, `profile` (Default, kein Admin Consent noetig)
