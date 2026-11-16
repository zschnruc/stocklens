#!/usr/bin/env node
/**
 * 把 src 下的模板、CSS、JS 内联成单文件 index.html。
 * 运行：node scripts/build.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');

function readDir(dir, ext) {
  const full = path.join(src, dir);
  if (!fs.existsSync(full)) return '';
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `/* ===== ${dir}/${f} ===== */\n${fs.readFileSync(path.join(full, f), 'utf8')}`)
    .join('\n\n');
}

const template = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
const css = readDir('css', '.css');
const js = readDir('js', '.js');

if (!css || !js) {
  console.error('缺少 CSS 或 JS 源文件');
  process.exit(1);
}

const html = template
  .replace('/*__STYLES__*/', () => css)
  .replace('/*__APP__*/', () => js)
  .replace('__BUILD_TIME__', new Date().toISOString());

fs.writeFileSync(path.join(root, 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ index.html 已生成 (${kb} KB)`);
