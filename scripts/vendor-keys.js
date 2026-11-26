#!/usr/bin/env node
/**
 * 第三方免费层凭据的编码 / 轮换工具（算法与 src/js/10-api.js 的 slVendorValue 一致）。
 *
 * 用法：
 *   node scripts/vendor-keys.js --verify
 *      校验当前 SL_VENDOR_CFG 的编码值可正确解码；仅输出长度与短校验和，不输出明文。
 *   FINNHUB_KEY=xxx FMP_KEY=yyy node scripts/vendor-keys.js --write
 *      用环境变量（或项目根目录 .env.local）中的明文重新生成编码值并写回 10-api.js。
 *
 * 边界：编码只提高静态扫描门槛，不是加密，也不构成安全隔离。浏览器运行时必然还原
 * 明文，且请求 URL 中必然携带明文参数；若历史提交中曾出现明文，应轮换 Key。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const apiFile = path.join(root, 'src', 'js', '10-api.js');
const PAIRS = [
  { id: 'fh', env: 'FINNHUB_KEY', label: 'Finnhub' },
  { id: 'fmp', env: 'FMP_KEY', label: 'FMP' },
];

function maskAt(j) {
  return (j * 37 + 0x5a) & 0xff;
}
function encode(plain) {
  let hex = '';
  for (let i = 0; i < plain.length; i += 1) {
    hex += ((plain.charCodeAt(i) ^ maskAt(i)) & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
}
function decode(hex) {
  let out = '';
  for (let i = 0, j = 0; i < hex.length; i += 2, j += 1) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ maskAt(j));
  }
  return out;
}
function fingerprint(plain) {
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex').slice(0, 8);
}
function readConfig() {
  const src = fs.readFileSync(apiFile, 'utf8');
  const cfg = {};
  PAIRS.forEach(({ id, label }) => {
    const m = src.match(new RegExp('\\b' + id + ":\\s*'([0-9a-f]*)'"));
    if (!m) throw new Error(`未找到 SL_VENDOR_CFG.${id}（${label}）编码值`);
    cfg[id] = m[1];
  });
  return { src, cfg };
}
function loadEnvLocal() {
  const file = path.join(root, '.env.local');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || process.env[m[1]]) return;
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
}
function verify() {
  const { cfg } = readConfig();
  PAIRS.forEach(({ id, label }) => {
    const hex = cfg[id];
    if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
      throw new Error(`SL_VENDOR_CFG.${id} 不是合法的偶数位十六进制串`);
    }
    const plain = decode(hex);
    console.log(
      `  ✓ ${label.padEnd(8)} ${id.padEnd(3)} ${String(plain.length).padStart(2)} 字符 | sha256[:8]=${fingerprint(plain)}`
    );
  });
  console.log('  ✓ 编码格式与解码往返均正常（未输出明文）');
}
function write() {
  loadEnvLocal();
  let { src } = readConfig();
  PAIRS.forEach(({ id, env, label }) => {
    const plain = process.env[env];
    if (!plain) throw new Error(`缺少 ${env}，请用环境变量或 .env.local 提供 ${label} 明文`);
    const hex = encode(plain);
    if (decode(hex) !== plain) throw new Error(`${label} 编码往返校验失败`);
    const re = new RegExp('(\\b' + id + ":\\s*')[0-9a-f]*(')");
    if (!re.test(src)) throw new Error(`无法定位 SL_VENDOR_CFG.${id}`);
    src = src.replace(re, (m, a, b) => a + hex + b);
    console.log(
      `  ✓ ${label.padEnd(8)} 已更新 | ${String(plain.length).padStart(2)} 字符 | sha256[:8]=${fingerprint(plain)}`
    );
  });
  fs.writeFileSync(apiFile, src);
  console.log('\n已写回 src/js/10-api.js；请执行 node scripts/build.js 重建产物，再运行 npm run check。');
}

try {
  const arg = process.argv[2] || '--verify';
  if (arg === '--write') write();
  else if (arg === '--verify') verify();
  else throw new Error('未知参数：' + arg + '（可用 --verify / --write）');
} catch (err) {
  console.error('✗ ' + (err.message || err));
  process.exit(1);
}

module.exports = { encode, decode };
