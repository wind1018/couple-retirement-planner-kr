import fs from 'node:fs/promises';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('usage: inline-standalone INPUT_HTML OUTPUT_HTML');

const inputDirectory = path.dirname(inputPath);
let html = await fs.readFile(inputPath, 'utf8');

html = await replaceAsync(html, /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, async (_match, href) => {
  const css = await fs.readFile(path.resolve(inputDirectory, href), 'utf8');
  return `<style>${css}</style>`;
});
html = await replaceAsync(html, /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, async (_match, src) => {
  const javascript = await fs.readFile(path.resolve(inputDirectory, src), 'utf8');
  return `<script type="module">${javascript}</script>`;
});

if (/<(script|link)\b[^>]*(src|href)="\.\/assets\//.test(html)) throw new Error('외부 빌드 자산이 남아 있어 단일 HTML을 만들 수 없습니다.');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html, 'utf8');

async function replaceAsync(source, pattern, replacer) {
  const matches = [...source.matchAll(pattern)];
  for (const match of matches.reverse()) {
    const replacement = await replacer(...match);
    source = source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
  }
  return source;
}
