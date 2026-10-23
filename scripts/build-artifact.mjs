// Builds the game into one self-contained HTML page (JS and CSS inlined) so it can be
// shared as a single file or published as a claude.ai artifact.
// Usage: node scripts/build-artifact.mjs [output.html]

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'dist', 'frostline.html'));

execSync('npx vite build --config client/vite.config.ts', { cwd: root, stdio: 'inherit' });

const dist = join(root, 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const jsPath = /<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/.exec(html)?.[1];
const cssPath = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/.exec(html)?.[1];
if (!jsPath || !cssPath) throw new Error('Could not find the built JS/CSS in dist/index.html');
const read = (p) => readFileSync(join(dist, p.replace(/^\.?\//, '')), 'utf8');
// A literal "</script" inside the bundle would end the inline script early.
const js = read(jsPath).replace(/<\/script/gi, '<\\/script');
const css = read(cssPath);
const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? '';
const markup = body.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/, '').trim();

// The artifact host supplies the doctype, head and body; the page starts with its title.
const page = `<title>FROSTLINE</title>
<style>
${css}
</style>
${markup}
<script type="module">
${js}
</script>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(0)} kB)`);
