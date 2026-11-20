#!/usr/bin/env node
/**
 * 构建门禁：占位符 / 外链资源 / 内联脚本语法 / 源码与产物一致性 / 产物体积。
 * 运行：node scripts/check.js（先运行 node scripts/build.js）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildHtml, root } = require('./build.js');

const file = path.join(root, 'index.html');
const SIZE_WARN = 600 * 1024;
const SIZE_FAIL = 900 * 1024;

if (!fs.existsSync(file)) {
  console.error('index.html 不存在，请先运行 npm run build');
  process.exit(1);
}

const html = fs.readFileSync(file, 'utf8');
const problems = [];
const warnings = [];

if (html.includes('/*__STYLES__*/') || html.includes('/*__APP__*/')) {
  problems.push('仍有未替换的构建占位符');
}
if (/<script[^>]+src=/i.test(html)) problems.push('存在外部 script 引用');
if (/<link[^>]+rel=["']stylesheet/i.test(html)) problems.push('存在外部样式表引用');
if (!/<meta name="viewport"/i.test(html)) problems.push('缺少 viewport');

/* 内联脚本语法校验：语法错误会导致整页白屏，必须在构建阶段拦住 */
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
scripts.forEach((m, i) => {
  if (/\bsrc\s*=/i.test(m[1]) || !m[2].trim()) return;
  try {
    new vm.Script(m[2], { filename: `index.html#inline-script-${i + 1}` });
  } catch (err) {
    problems.push(`内联脚本语法错误：${err.message}`);
  }
});

/* 产物一致性：用同一份源码重建（沿用现有构建时间），逐字节比对 */
const builtAt = (html.match(/构建于 ([^<]*)<\/p>/) || [])[1];
if (!builtAt) {
  problems.push('未找到构建时间标记，无法校验产物一致性');
} else {
  let expected = null;
  try {
    expected = buildHtml({ buildTime: builtAt.trim() });
  } catch (err) {
    problems.push(`源码重建失败：${err.message}`);
  }
  if (expected && expected !== html) {
    let at = 0;
    while (at < expected.length && expected[at] === html[at]) at++;
    problems.push(`index.html 与 src 源码不一致（首个差异在第 ${at} 个字符），请运行 node scripts/build.js 重建`);
  }
}

const size = Buffer.byteLength(html);
if (size > SIZE_FAIL) problems.push(`index.html 体积 ${(size / 1024).toFixed(1)} KB 超过 ${SIZE_FAIL / 1024} KB 上限`);
else if (size > SIZE_WARN) warnings.push(`index.html 体积 ${(size / 1024).toFixed(1)} KB 接近单文件上限`);

console.log(`index.html: ${(size / 1024).toFixed(1)} KB`);
console.log(`内联 <style>: ${(html.match(/<style/g) || []).length}`);
console.log(`内联 <script>: ${(html.match(/<script/g) || []).length}`);
console.log(`内联脚本语法: ${scripts.length ? '已校验' : '未找到内联脚本'}`);

if (warnings.length) {
  console.warn('\n提示:');
  warnings.forEach((w) => console.warn('- ' + w));
}
if (problems.length) {
  console.error('\n发现问题:');
  problems.forEach((p) => console.error('- ' + p));
  process.exit(1);
}
console.log('\n✓ 检查通过：单文件、无外部静态依赖、语法与产物一致');
