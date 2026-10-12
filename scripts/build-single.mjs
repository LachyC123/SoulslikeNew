// Bundles the production build into one self-contained HTML fragment (inline CSS + JS),
// suitable for hosting as a single page. Run after `vite build`.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', dist), 'utf8');
const assets = readdirSync(new URL('assets/', dist));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(new URL(`assets/${f}`, dist), 'utf8')).join('\n');
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(`assets/${f}`, dist), 'utf8')).join('\n');
if (js.includes('</script')) throw new Error('bundle contains a closing script tag');

const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[^>]*src=[^>]*><\/script>/g, '').trim();
const out = `<title>Pixel Dungeon</title>
<meta name="theme-color" content="#0b120c" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&display=swap" />
<style>
${css}
</style>
${body}
<script type="module">
${js}
</script>
`;
writeFileSync(new URL('pixel-dungeon.html', dist), out);
console.log(`dist/pixel-dungeon.html ${(out.length / 1024).toFixed(0)} KB`);
