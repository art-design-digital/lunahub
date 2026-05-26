#!/bin/bash
# seed-demo.sh -- Erzeugt realistische Testdaten im DummyNAS
# Usage: bash scripts/seed-demo.sh

NAS="/Users/johannesosterkamp/DummyNAS/DEMO"

echo "Erzeuge Testdaten in $NAS ..."

# ── Projekt 1: Broschüre mit INDD + verlinkten Bildern ──────────
P1="$NAS/P250010_BUESCH-Backstuben-Imagebroschuere"
mkdir -p "$P1/Material"

# Fake INDD: Binärdatei mit eingebetteten Dateinamen (strings erkennt die)
python3 -c "
import os, struct, random
content = b'\x00' * 100
# Eingebettete Link-Referenzen die der Scanner findet
links = [
    'hero_backstube_aussen.jpg',
    'portrait_meister_buesch.tif',
    'produkt_vollkornbrot.jpg',
    'logo_buesch_cmyk.eps',
    'hintergrund_mehl_textur.png',
    'team_gruppenfoto_2025.jpg',
    'filiale_duesseldorf.tif',
]
for link in links:
    content += b'\x00' * 20 + link.encode('utf-8') + b'\x00' * 20
# Auch Text-Strings die die Textsuche findet
texts = [
    'Backstuben seit 1952',
    'Traditionelles Handwerk',
    'Vollkornbrot Sauerteig',
    'Bio-Baeckerei Duesseldorf',
    'Filialkonzept 2025',
]
for t in texts:
    content += b'\x00' * 10 + t.encode('utf-8') + b'\x00' * 10
with open('$P1/BUESCH_Imagebroschuere_v3.indd', 'wb') as f:
    f.write(content)
with open('$P1/BUESCH_Imagebroschuere_v2.indd', 'wb') as f:
    f.write(content[:500])
"

# Bilder die als Links referenziert werden (manche fehlen absichtlich fuer Link Health)
for img in hero_backstube_aussen.jpg portrait_meister_buesch.tif produkt_vollkornbrot.jpg; do
  convert -size 800x600 xc:"#$(openssl rand -hex 3)" -gravity center \
    -pointsize 24 -fill white -annotate 0 "$img" "$P1/Material/$img" 2>/dev/null \
    || python3 -c "
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (800, 600), '#$(openssl rand -hex 3)')
d = ImageDraw.Draw(img)
d.text((50, 280), '$img', fill='white')
img.save('$P1/Material/$img')
" 2>/dev/null \
    || touch "$P1/Material/$img"
done
# logo_buesch_cmyk.eps und andere FEHLEN absichtlich -> missingLinks = true

# PDF mit Text
if command -v python3 &>/dev/null; then
  python3 -c "
# Minimales PDF mit Text
content = '''%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
4 0 obj<</Length 178>>
stream
BT /F1 16 Tf 50 780 Td (BUESCH Backstuben - Imagebroschuere) Tj
0 -30 Td /F1 12 Tf (Tradition seit 1952 - Handwerkliche Backkunst aus Duesseldorf) Tj
0 -20 Td (Bio-Baeckerei mit 12 Filialen im Rheinland) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000306 00000 n
0000000236 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
536
%%EOF'''
with open('$P1/BUESCH_Imagebroschuere_final.pdf', 'w') as f:
    f.write(content)
with open('$P1/BUESCH_Imagebroschuere_v2.pdf', 'w') as f:
    f.write(content.replace('Imagebroschuere', 'Entwurf v2'))
"
fi

echo "  P250010 Buesch Imagebroschuere (INDD + PDF + Bilder + fehlende Links)"

# ── Projekt 2: Anzeigenkampagne mit mehreren INDDs ──────────────
P2="$NAS/P250020_STADTWERKE-Anzeigenkampagne-Sommer"
mkdir -p "$P2/Material"

python3 -c "
links_a = ['keyvisual_sommer_pool.jpg', 'logo_stadtwerke_4c.eps', 'badge_oekostrom.png', 'foto_solarpanel.tif']
links_b = ['keyvisual_sommer_pool.jpg', 'logo_stadtwerke_4c.eps', 'infografik_energiemix.png']
texts = ['Stadtwerke Duesseldorf', 'Oekostrom Kampagne', 'Sommer-Angebote 2025', 'Energiewende']

def make_indd(path, links, texts):
    content = b'\x00' * 50
    for l in links: content += b'\x00' * 15 + l.encode() + b'\x00' * 15
    for t in texts: content += b'\x00' * 10 + t.encode() + b'\x00' * 10
    with open(path, 'wb') as f: f.write(content)

make_indd('$P2/AZ_Oekostrom_210x297_RZ.indd', links_a, texts)
make_indd('$P2/AZ_Sommer_148x210_v2.indd', links_b, texts)
make_indd('$P2/AZ_Sommer_148x210_v1.indd', links_b, ['Entwurf', 'Stadtwerke'])
"

# Nur manche Bilder vorhanden
touch "$P2/Material/keyvisual_sommer_pool.jpg"
touch "$P2/Material/foto_solarpanel.tif"

python3 -c "
content = '''%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
4 0 obj<</Length 150>>
stream
BT /F1 18 Tf 50 780 Td (Stadtwerke Duesseldorf - Oekostrom) Tj
0 -30 Td /F1 12 Tf (Wechseln Sie jetzt zu 100% erneuerbarer Energie) Tj
0 -20 Td (Sommer-Aktion: 3 Monate gratis) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000306 00000 n
0000000236 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
506
%%EOF'''
with open('$P2/AZ_Freigabe_Oekostrom.pdf', 'w') as f: f.write(content)
"

echo "  P250020 Stadtwerke Anzeigenkampagne (3 INDDs + PDF + fehlende Links)"

# ── Projekt 3: Corporate Design Manual ──────────────────────────
P3="$NAS/P250030_MUELLERCO-Corporate-Design-Manual"
mkdir -p "$P3/Material"

python3 -c "
links = ['logo_mueller_primary.eps', 'logo_mueller_secondary.eps', 'icon_set_corporate.ai',
         'moodboard_brand_2025.jpg', 'farbpalette_pantone.tif', 'visitenkarte_mockup.psd']
texts = ['Mueller und Co GmbH', 'Corporate Design Manual', 'Pantone 286 C', 'Helvetica Neue',
         'Primaerfarben', 'Sekundaerfarben', 'Typografie', 'Bildsprache', 'Logo-Anwendung']

content = b'\x00' * 50
for l in links: content += b'\x00' * 15 + l.encode() + b'\x00' * 15
for t in texts: content += b'\x00' * 10 + t.encode() + b'\x00' * 10
with open('$P3/CD_Manual_MuellerCo_final.indd', 'wb') as f: f.write(content)

content2 = b'\x00' * 50
for l in links[:3]: content2 += b'\x00' * 15 + l.encode() + b'\x00' * 15
with open('$P3/Visitenkarte_MuellerCo_RZ.indd', 'wb') as f: f.write(content2)
"

touch "$P3/Material/moodboard_brand_2025.jpg"
touch "$P3/Material/farbpalette_pantone.tif"

python3 -c "
content = '''%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
4 0 obj<</Length 200>>
stream
BT /F1 20 Tf 50 780 Td (Mueller und Co - Corporate Design Manual) Tj
0 -30 Td /F1 12 Tf (Dieses Handbuch definiert die visuelle Identitaet) Tj
0 -20 Td (Pantone 286 C als Primaerfarbe) Tj
0 -20 Td (Helvetica Neue als Hausschrift) Tj
0 -20 Td (Logo-Schutzzone: mindestens 10mm) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000306 00000 n
0000000236 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
558
%%EOF'''
with open('$P3/CD_Manual_MuellerCo_Ansicht.pdf', 'w') as f: f.write(content)
with open('$P3/Visitenkarte_MuellerCo_Proof.pdf', 'w') as f:
    f.write(content.replace('Corporate Design Manual', 'Visitenkarte'))
"

echo "  P250030 Mueller Corporate Design (2 INDDs + 2 PDFs + fehlende Links)"

# ── Projekt 4: Messestand mit vielen Bildern ────────────────────
P4="$NAS/P250040_TECHFLOW-Messestand-Hannover"
mkdir -p "$P4/Material"

python3 -c "
links = ['rendering_stand_front.jpg', 'rendering_stand_seite.jpg', 'logo_techflow_weiss.png',
         'produkt_sensor_x100.tif', 'produkt_sensor_x200.tif', 'messeteam_foto.jpg',
         'grundriss_stand_12x8.pdf', 'banner_rueckwand_6000x2500.tif']
texts = ['TechFlow GmbH', 'Hannover Messe 2025', 'Halle 9 Stand C42', 'Sensor X-100',
         'IoT Loesungen', 'Industrie 4.0', 'Smart Factory']

content = b'\x00' * 50
for l in links: content += b'\x00' * 15 + l.encode() + b'\x00' * 15
for t in texts: content += b'\x00' * 10 + t.encode() + b'\x00' * 10
with open('$P4/Messestand_Techflow_HM25_RZ.indd', 'wb') as f: f.write(content)
"

# Alle Bilder vorhanden -> keine fehlenden Links
for img in rendering_stand_front.jpg rendering_stand_seite.jpg logo_techflow_weiss.png \
           produkt_sensor_x100.tif produkt_sensor_x200.tif messeteam_foto.jpg \
           banner_rueckwand_6000x2500.tif; do
  touch "$P4/Material/$img"
done

python3 -c "
content = '''%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
4 0 obj<</Length 180>>
stream
BT /F1 18 Tf 50 780 Td (TechFlow - Messestand Hannover Messe) Tj
0 -30 Td /F1 12 Tf (Halle 9 Stand C42 - 96qm Eckstand) Tj
0 -20 Td (Sensor X-100 und X-200 Produktpraesentationen) Tj
0 -20 Td (LED-Rueckwand 6m x 2.5m) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000306 00000 n
0000000236 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
538
%%EOF'''
with open('$P4/Grundriss_Stand_HM25.pdf', 'w') as f: f.write(content)
"

echo "  P250040 TechFlow Messestand (1 INDD + PDF + alle Links vorhanden)"

echo ""
echo "Fertig! 4 neue Projekte mit INDDs, PDFs und Testdaten."
echo "Starte einen Scan (Refresh-Button) um die Daten zu laden."
