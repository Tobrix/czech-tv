/* ═══════════════════════════════════════════
   ONEPRIMETV — epg-client.js
   Stahuje a parsuje EPG (XMLTV, gzip) přímo v prohlížeči.
   Nahrazuje starý server-side /epg-data endpoint — appka je
   teď čistě statická, žádný Node.js backend není potřeba.
═══════════════════════════════════════════ */
'use strict';

const EPG_SOURCE_URL = 'https://raw.githubusercontent.com/kozmali/sk-cz-epg/refs/heads/main/epg.xml.gz';
const EPG_REFRESH_MS = 60 * 60 * 1000; // stejný interval jako mělo staré server.js

const EPG = {
  byChannel: new Map(),
  ready: null,
};
window.EPG = EPG;

// ── XML HELPERS ───────────────────────────
function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
          .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCodePoint(parseInt(n, 16)));
}
function attrOf(str, name) {
  const m = new RegExp(name + '="([^"]*)"').exec(str);
  return m ? m[1] : '';
}

// ── STAŽENÍ + DEKOMPRESE (.xml.gz → text) ─
async function decompressGzipUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('EPG stažení selhalo: ' + res.status);

  if (typeof DecompressionStream !== 'undefined') {
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  }

  // Fallback pro starší prohlížeče bez nativního DecompressionStream (viz pako v HTML)
  const buf = await res.arrayBuffer();
  if (window.pako) return window.pako.ungzip(new Uint8Array(buf), { to: 'string' });
  throw new Error('Prohlížeč nepodporuje gzip dekompresi a pako.js není načteno.');
}

// ── PARSER XMLTV → Map(channelId -> [pořady]) ─
function parseXMLTV(xml) {
  const progRegex = /<programme([^>]*)>([\s\S]*?)<\/programme>/g;
  const titleRe = /<title[^>]*>([^<]*)<\/title>/;
  const descRe  = /<desc[^>]*>([^<]*)<\/desc>/;
  const iconRe  = /<icon\s+src="([^"]*)"/;

  const byChannel = new Map();
  let m;
  while ((m = progRegex.exec(xml)) !== null) {
    const [, attrs, body] = m;
    const channel = attrOf(attrs, 'channel');
    if (!channel) continue;
    const t = titleRe.exec(body);
    const d = descRe.exec(body);
    const i = iconRe.exec(body);
    const prog = {
      start: attrOf(attrs, 'start'),
      stop:  attrOf(attrs, 'stop'),
      title: t ? decodeEntities(t[1]) : '',
      desc:  d ? decodeEntities(d[1]) : '',
      image: i ? i[1] : '',
    };
    let arr = byChannel.get(channel);
    if (!arr) { arr = []; byChannel.set(channel, arr); }
    arr.push(prog);
  }
  byChannel.forEach(arr => arr.sort((a, b) => a.start.localeCompare(b.start)));
  return byChannel;
}

// ── NAČTENÍ ────────────────────────────────
async function loadEpg() {
  console.log('⏳ Stahuji EPG...');
  const xml = await decompressGzipUrl(EPG_SOURCE_URL);
  EPG.byChannel = parseXMLTV(xml);
  console.log(`✅ EPG: ${EPG.byChannel.size} kanálů`);
}

EPG.ready = loadEpg().catch(err => console.error('❌ EPG:', err.message));
setInterval(() => { loadEpg().catch(err => console.error('❌ EPG refresh:', err.message)); }, EPG_REFRESH_MS);

// ── VEŘEJNÉ API (nahrazuje /epg-data) ─────
// Aktuální nebo nejbližší nadcházející pořad — Europe/Prague čas (stejně jako staré server.js)
EPG.getCurrent = function (channelId) {
  const list = EPG.byChannel.get(channelId);
  if (!list || !list.length) return { title: 'Program není k dispozici' };

  const parts = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const t = {};
  parts.forEach(({ type, value }) => t[type] = value);
  const nowStr = `${t.year}${t.month}${t.day}${t.hour}${t.minute}${t.second}`;

  const current = list.find(p => {
    const s = p.start.split(' ')[0], e = p.stop.split(' ')[0];
    return nowStr >= s && nowStr <= e;
  });
  if (current) return current;
  const upcoming = list.find(p => p.start.split(' ')[0] > nowStr);
  return upcoming || { title: 'Program není k dispozici' };
};

// Celý den pořadů pro kanál (dateStr ve formátu YYYYMMDD, nepovinné)
EPG.getFull = function (channelId, dateStr) {
  const list = EPG.byChannel.get(channelId);
  if (!list) return [];
  if (!dateStr) return list;
  return list.filter(p => p.start.startsWith(dateStr) || p.stop.startsWith(dateStr));
};
