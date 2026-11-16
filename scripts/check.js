#!/usr/bin/env node
/**
 * 轻量构建检查：内联产物大小、占位符、明显的外链资源。
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'index.html');

if (!fs.existsSync(file)) {
  console.error('index.html 不存在，请先运行 npm run build');
  process.exit(1);
}

const html = fs.readFileSync(file, 'utf8');
const problems = [];

if (html.includes('/*__STYLES__*/') || html.includes('/*__APP__*/')) {
  problems.push('仍有未替换的构建占位符');
}
if (/<script[^>]+src=/i.test(html)) problems.push('存在外部 script 引用');
if (/<link[^>]+rel=["']stylesheet/i.test(html)) problems.push('存在外部样式表引用');
if (!/<meta name="viewport"/i.test(html)) problems.push('缺少 viewport');

const size = Buffer.byteLength(html);
console.log(`index.html: ${(size / 1024).toFixed(1)} KB`);
console.log(`内联 <style>: ${(html.match(/<style/g) || []).length}`);
console.log(`内联 <script>: ${(html.match(/<script/g) || []).length}`);

if (problems.length) {
  console.error('\n发现问题:');
  problems.forEach((p) => console.error('- ' + p));
  process.exit(1);
}
console.log('\n✓ 检查通过：单文件、无外部静态依赖');
