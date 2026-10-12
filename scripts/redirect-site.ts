/**
 * The old address, once the site has moved (docs/HOSTING.md): every page there forwards to the same
 * place at the new address, bringing the player's save along the first time (src/game/move.ts),
 * because a save lives in the storage of the address it was made on. Pull links, profile links and
 * link-preview pages all keep working.
 *
 *   npx tsx scripts/redirect-site.ts <new-url> <out-dir>     (deploy, when the site lives elsewhere)
 *
 * Writes index.html and 404.html (GitHub Pages serves 404.html for every other path) and copies
 * hall-of-fame.json, which the Hall of Fame scripts read from the old address.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const [newUrl, outDir] = process.argv.slice(2);
if (!/^https?:\/\//.test(newUrl ?? '') || !newUrl.endsWith('/') || !outDir) {
  console.error('Usage: npx tsx scripts/redirect-site.ts https://new.example/ <out-dir>');
  process.exit(2);
}
const OLD_BASE = process.env.OLD_BASE_PATH ?? '/BrainrotTCG/';

// Plain ES2017 so it runs on anything that could have run the game. The save rides in the '#',
// which browsers never send to a server; the new address takes it in only from this origin.
const script = `(async function () {
  var NEW = ${JSON.stringify(newUrl)}, BASE = ${JSON.stringify(OLD_BASE)};
  var path = location.pathname.indexOf(BASE) === 0 ? location.pathname.slice(BASE.length) : '';
  if (path === 'index.html' || path === '404.html') path = '';
  var then = path + location.hash;
  try {
    var save = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('brainrot-') === 0 && key !== 'brainrot-reopened-v1') save[key] = localStorage.getItem(key);
    }
    if (save['brainrot-player-v1']) {
      var bytes = new TextEncoder().encode(JSON.stringify(save)), kind = 'j';
      if (typeof CompressionStream === 'function') {
        bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
        kind = 'z';
      }
      var binary = '';
      for (var j = 0; j < bytes.length; j += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x8000));
      var packed = btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      if (packed.length < 1500000) {
        location.replace(NEW + '#/move/' + kind + packed + '~' + encodeURIComponent(then));
        return;
      }
    }
  } catch (e) {}
  location.replace(NEW + then);
})();`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="origin">
<meta name="robots" content="noindex">
<title>Brainrot TCG has moved</title>
<link rel="canonical" href="${newUrl}">
<script>${script}</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121114;color:#f2efe9;font:16px system-ui,sans-serif;text-align:center}a{color:#ffd23f}</style>
</head>
<body><p>Brainrot TCG has moved to <a href="${newUrl}">${newUrl.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>.</p></body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/index.html`, page);
writeFileSync(`${outDir}/404.html`, page);
const hof = `${ROOT}dist/hall-of-fame.json`;
if (existsSync(hof)) copyFileSync(hof, `${outDir}/hall-of-fame.json`);
console.log(`${outDir}: redirects to ${newUrl}`);
