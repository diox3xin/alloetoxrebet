#!/usr/bin/env node
/**
 * Простой бандлер для ST — собирает все модули в один IIFE-файл.
 * Убирает import/export, оборачивает в IIFE, добавляет все классы в глобал.
 */

const fs = require('fs');
const path = require('path');

const base = __dirname;
const modules = [
  'apps/phone-core.js',
  'apps/storage.js',
  'apps/image-gen.js',
  'apps/messages.js',
  'apps/gallery.js',
  'apps/spicy.js',
  'apps/creator.js',
  'index.js',
];

const chunks = [];
chunks.push('(function() {\n"use strict";\n');

for (const mod of modules) {
  const filePath = path.join(base, mod);
  let code = fs.readFileSync(filePath, 'utf8');
  
  // Убираем import/export
  code = code.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
  code = code.replace(/^export\s+(class|const|function|let|var)\s+/gm, '$1 ');
  code = code.replace(/^export\s+\{[^}]+\};?\s*$/gm, '');
  code = code.replace(/^export\s+default\s+/gm, '');
  
  chunks.push(`\n/* ═══════════════ ${mod} ═══════════════ */\n`);
  chunks.push(code);
}

chunks.push('\n})();\n');

const bundle = chunks.join('');
fs.writeFileSync(path.join(base, 'astral-phone.js'), bundle, 'utf8');

console.log(`✓ Bundle: ${bundle.length} bytes → astral-phone.js`);
