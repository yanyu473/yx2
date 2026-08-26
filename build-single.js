/* build-single.js — 将多模块项目打包成单个自包含 HTML
 *   用法： node build-single.js
 *   生成： 坦克大战-星际守护者.html （内联全部 CSS/JS，零依赖）
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CSS = fs.readFileSync(path.join(DIR, 'css', 'style.css'), 'utf8');
const JS_ORDER = ['utils', 'audio', 'particle', 'bullet', 'powerup', 'enemy',
  'boss', 'player', 'achievement', 'ui', 'game', 'main'];
let js = '';
for (const name of JS_ORDER) {
  js += '\n/* ===== ' + name + '.js ===== */\n' +
        fs.readFileSync(path.join(DIR, 'js', name + '.js'), 'utf8') + '\n';
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<meta name="theme-color" content="#05060f" />
<title>坦克大战 · 星际守护者</title>
<style>
${CSS}
</style>
</head>
<body>
<canvas id="game"></canvas>
<div id="ui-root"></div>
<script>
${js}
<\/script>
</body>
</html>`;

const out = path.join(DIR, '坦克大战-星际守护者.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成单文件：' + out + '  (' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB)');
