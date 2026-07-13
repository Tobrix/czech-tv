# TV — živá televize (statická verze, bez serveru)

Tohle je čistě statická verze appky — žádný Node.js, žádný server, jen HTML/CSS/JS
soubory. Stačí je nahrát na jakýkoliv webhosting nebo otevřít lokálně.

## Důležité: musí běžet přes obyčejné http (ne https)

Část kanálů ve tvém playlistu (Sport1, Sport2, Nicktoons a pár dalších) běží na
obyčejném **http://**. Pokud appku pustíš na **https://** stránce, prohlížeč
tyhle kanály kvůli tzv. mixed content politice automaticky zablokuje — a bez
serveru to nejde ničím obejít, protože je to bezpečnostní pravidlo prohlížeče,
ne appky.

Pokud appku hostuješ přes **http://** (ne https), tahle blokace vůbec nenastane
a všechny kanály by měly fungovat stejně, jako by šly přes VLC.

### Jak appku pustit přes http

**Lokálně / v domácí síti** (nejjednodušší, nic se nikam nenahrává):
```bash
cd tv-app-static
python3 -m http.server 8080
```
Pak na počítači otevřeš `http://localhost:8080`, na iPhonu/iPadu ve stejné
Wi-Fi síti `http://IP-ADRESA-POČÍTAČE:8080` (IP zjistíš např. přes `ipconfig`
na Windows nebo `ifconfig`/Nastavení Wi-Fi na Macu).

**Domácí NAS/router** — pokud máš Synology, QNAP nebo router s USB diskem a
webovým serverem (Web Station apod.), stačí tuhle složku nahrát tam a
zpřístupnit přes http.

**Veřejný hosting přes http** — dnes už většina hostingů (GitHub Pages,
Netlify, Vercel...) automaticky přesměrovává na https a http variantu
nedovolí vypnout, takže pro tenhle účel se moc nehodí. Pro veřejně dostupnou
appku, která zvládne i http kanály a zároveň běží na https, je potřeba buď
proxy server (viz appka s Node.js, kterou jsem dělal předtím), nebo hosting,
kde si https vypnout/nevynutit můžeš (vlastní VPS bez automatického
přesměrování, домácí server apod.).

## Instalace na iPhone/iPad

I přes http otevřeš appku v Safari → tlačítko Sdílet → **Přidat na plochu**.
Appka se přidá jako ikona na ploše a spustí se na celou obrazovku bez
adresního řádku. (Poznámka: service worker — tj. cache appky pro rychlejší
načtení — vyžaduje https nebo localhost, takže na http se prostě nezaregistruje;
appka ale funguje úplně stejně, jen bez téhle drobné optimalizace.)

## Known limitation: kanály s vlastním User-Agentem

24 kanálů v playlistu má nastavenou vlastní `http-user-agent` hlavičku (server
ji vyžaduje, aby stream vůbec pustil). Prohlížeč z bezpečnostních důvodů
nedovolí JavaScriptu tuhle hlavičku měnit — takže tyhle konkrétní kanály
mohou nefungovat i po vyřešení http/https problému, protože stream server
uvidí normální hlavičku prohlížeče místo té očekávané. Tohle už bez serveru
(který hlavičku umí nastavit sám) obejít nejde.

## Struktura

```
index.html     hlavní appka
styles.css     Apple design systém
app.js         logika appky (kategorie, vyhledávání, přehrávač, oblíbené)
channels.js    kanály vygenerované z tvého m3u souboru
manifest.json  PWA manifest (instalace na iOS/macOS)
sw.js          service worker (funguje jen na https/localhost)
icons/         ikony appky
```
