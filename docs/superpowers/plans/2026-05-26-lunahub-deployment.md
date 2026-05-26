# LunaHub Deployment Plan — Coolify + Tailscale

## Übersicht

LunaHub wird auf dem Hetzner-Server "art design apis" via Coolify deployed.
Das Büro-NAS (Synology, 192.168.115.122) wird per Tailscale-VPN angebunden,
damit der Container die Projektdateien lesen kann.

**Domain:** `lunahub.ad.digital`
**Coolify-Projekt:** art design apis
**GitHub-Repo:** `art-design-digital/lunahub` (neu)

---

## Schritte

### 1. GitHub-Repo anlegen

- Repo `art-design-digital/lunahub` erstellen (private)
- Lokales Projekt pushen (main branch)
- Sicherstellen: `.env` ist in `.gitignore`

**Wer:** Claude (lokal)

---

### 2. Tailscale auf dem Synology NAS installieren

- Synology Package Center → Tailscale installieren
- Alternativ: manuell via SSH (falls Package nicht verfügbar)
- Im Tailscale Admin Console die NAS-Maschine authorisieren
- Tailscale-IP der NAS notieren (100.x.x.x)

**Wer:** Johannes (braucht Zugang zum NAS-Admin)

---

### 3. Tailscale auf dem Hetzner-Server installieren

```bash
# SSH zum Hetzner-Server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

- Server im Tailscale Admin Console authorisieren
- Testen: `ping <NAS-Tailscale-IP>` vom Hetzner-Server

**Wer:** Johannes (SSH-Zugang zum Hetzner-Server nötig)

---

### 4. SMB-Mount auf dem Hetzner-Server einrichten

```bash
# cifs-utils installieren
sudo apt-get install -y cifs-utils

# Mount-Punkt erstellen
sudo mkdir -p /mnt/nas-projekte

# Credentials-Datei anlegen (sicherer als CLI-Argumente)
sudo tee /etc/smbcredentials-nas <<'EOF'
username=<NAS_SMB_USER>
password=<NAS_SMB_PASS>
EOF
sudo chmod 600 /etc/smbcredentials-nas

# Testen: manueller Mount über Tailscale-IP
sudo mount -t cifs //<NAS-TAILSCALE-IP>/Projekte /mnt/nas-projekte \
  -o credentials=/etc/smbcredentials-nas,ro,vers=3.0,uid=1000,gid=1000

# Persistent machen via /etc/fstab
echo '//<NAS-TAILSCALE-IP>/Projekte /mnt/nas-projekte cifs credentials=/etc/smbcredentials-nas,ro,vers=3.0,uid=1000,gid=1000,_netdev,nofail 0 0' | sudo tee -a /etc/fstab
```

**Wer:** Johannes (SSH + NAS-Credentials nötig)

---

### 5. DNS-Eintrag anlegen

- DNS-Provider für `ad.digital` öffnen
- A-Record anlegen: `lunahub.ad.digital` → IP des Hetzner-Servers
- TTL: 300 (zum Testen), später 3600

**Wer:** Johannes (DNS-Zugang nötig)

---

### 6. Coolify: Neues Projekt/Service anlegen

Im Coolify Dashboard:

1. Projekt "art design apis" öffnen (oder neuen Service hinzufügen)
2. **Source:** GitHub → `art-design-digital/lunahub` (main branch)
3. **Build:** Dockerfile (erkennt Coolify automatisch)
4. **Ports:** 3000
5. **Domain:** `lunahub.ad.digital` (Coolify generiert SSL via Let's Encrypt)
6. **Volumes:**
   - `/mnt/nas-projekte:/data/projekte:ro` (Host-Mount vom NAS)
   - Persistent Volume für `/app/data` (SQLite-DB, Thumbnails)
7. **Environment Variables:**
   ```
   NODE_ENV=production
   DATA_DIR=/app/data
   CONFIG_PATH=/app/config.json
   AZURE_TENANT_ID=<wert>
   AZURE_CLIENT_ID=<wert>
   AZURE_CLIENT_SECRET=<wert>
   ORIGIN=https://lunahub.ad.digital
   ```

**Wer:** Johannes (Coolify-Zugang nötig)

---

### 7. Azure OAuth Redirect URI anpassen

- Azure Portal → App Registration → Authentication
- Redirect URI hinzufügen: `https://lunahub.ad.digital/auth/callback`
- Alte localhost-URI kann bleiben (für lokale Entwicklung)

**Wer:** Johannes (Azure-Portal-Zugang nötig)

---

### 8. config.json für Produktion anpassen

Die `config.json` im Repo muss den Container-Pfad verwenden:

```json
{
  "volume": "/data/projekte",
  "clients": [
    { "folder": "BUESCH" },
    { "folder": "Wannenwetsch" },
    { "folder": "Angermueller" }
  ]
}
```

> Aktuell steht dort `/Volumes/Projekte` (macOS-Pfad).
> Im Docker-Container wird das NAS nach `/data/projekte` gemountet.
> Der macOS-Pfad wird nur lokal gebraucht.

**Lösung:** Dockerfile kopiert `config.json` → im Container gilt der dortige Pfad.
Entweder:
- (a) `config.json` auf `/data/projekte` ändern und lokal per `.env` überschreiben
- (b) Oder `CONFIG_PATH` env var nutzen und eine separate `config.prod.json` bereitstellen

**Empfehlung:** Option (a) — Volume-Pfad per Environment Variable konfigurierbar machen.

---

### 9. Deployment testen

1. Push nach `main` → Coolify baut automatisch
2. `https://lunahub.ad.digital` aufrufen
3. Microsoft-Login testen
4. Prüfen: Projekte werden geladen (NAS-Zugriff funktioniert)
5. Prüfen: Thumbnails werden generiert
6. Prüfen: Textsuche funktioniert

---

## Reihenfolge / Abhängigkeiten

```
1. GitHub Repo ──────────────────────────────┐
2. Tailscale NAS ──┐                         │
3. Tailscale Hetzner┤                        │
4. SMB-Mount ───────┘                        │
5. DNS-Eintrag ──────────────────────────────┤
6. Coolify Setup ←───────────────────────────┘
7. Azure OAuth Redirect
8. config.json anpassen
9. Testen
```

Schritte 1-5 können größtenteils parallel laufen.
Schritt 6 (Coolify) braucht: Repo (1), Mount (4), DNS (5).
Schritt 9 braucht alles.

---

## Was Claude erledigen kann

- [x] GitHub-Repo anlegen und Code pushen (Schritt 1)
- [x] config.json produktionsfähig machen (Schritt 8)

## Was Johannes manuell machen muss

- [ ] Tailscale auf NAS installieren (Schritt 2)
- [ ] Tailscale auf Hetzner installieren (Schritt 3)
- [ ] SMB-Mount einrichten (Schritt 4)
- [ ] DNS-Eintrag anlegen (Schritt 5)
- [ ] Coolify-Service konfigurieren (Schritt 6)
- [ ] Azure Redirect URI anpassen (Schritt 7)
