import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const stylesheet = html.match(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/);
if (!script || !stylesheet) throw new Error('Run the Vite build before packaging the demo.');
const asset = path => resolve(root, 'dist', path.replace(/^\//, ''));
const js = (await readFile(asset(script[1]), 'utf8')).replace(/<\/script/gi, '<\\/script');
const css = (await readFile(asset(stylesheet[1]), 'utf8'))
  .replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*;?/g, '')
  .replace(/<\/style/gi, '<\\/style');
html = html.replace(script[0], () => `<script type="module">${js}</script>`)
  .replace(stylesheet[0], () => `<style>${css}</style>`);
await mkdir(resolve(root, 'deploy'), { recursive: true });
await writeFile(resolve(root, 'deploy/ateliera-demo.html'), html);
await writeFile(resolve(root, 'dist/ateliera-demo.html'), html);
console.log('Packaged deploy/ateliera-demo.html: inline app, Three.js and styles; no font/network assets.');
