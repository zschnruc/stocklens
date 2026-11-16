#!/usr/bin/env node
/**
 * 把 src 下的模板、CSS、JS 内联成单文件 index.html。
 * 运行：node scripts/build.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildTime = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });

function readDir(base, dir, ext) {
  const full = path.join(base, dir);
  if (!fs.existsSync(full)) return '';
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `/* ===== ${dir}/${f} ===== */\n${fs.readFileSync(path.join(full, f), 'utf8')}`)
    .join('\n\n');
}

const template = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
const css = readDir(src, 'css', '.css');
const js = readDir(src, 'js', '.js');
const vendor = readDir(root, 'vendor', '.js');

if (!css || !js) {
  console.error('缺少 CSS 或 JS 源文件');
  process.exit(1);
}
if (!vendor) {
  console.error('缺少 vendor 源文件（klinecharts）');
  process.exit(1);
}

const html = template
  .replace('/*__STYLES__*/', () => css)
  .replace('/*__VENDOR__*/', () => vendor)
  .replace('/*__APP__*/', () => js)
  .replace(/__SL_VERSION__/g, 'v' + pkg.version)
  .replace(/__SL_BUILD_TIME__/g, buildTime);

if (html.includes('__SL_VERSION__') || html.includes('__SL_BUILD_TIME__')) {
  console.error('模板中存在未替换的版本占位符');
  process.exit(1);
}

fs.writeFileSync(path.join(root, 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ index.html 已生成 (${kb} KB)`);
