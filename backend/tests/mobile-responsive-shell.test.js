'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('se quitó la guía rápida del encabezado y se conserva Ayuda', () => {
  const shell = read('frontend', 'js', 'multipage.js');
  assert.doesNotMatch(shell, /injectGuideButton/);
  assert.doesNotMatch(shell, /id = 'btn-guide'/);
  assert.match(shell, /function injectHelpButton/);
  assert.match(shell, /btn\.id = 'btn-help'/);
  assert.match(shell, /window\.location\.href = 'ayuda\.html'/);
  assert.match(shell, /injectHelpButton\(\);/);
});

test('en celular Notificaciones y Salir siguen visibles sin scroll horizontal', () => {
  const css = read('frontend', 'css', 'base.css');
  assert.match(css, /@supports \(overflow: clip\)[\s\S]*overflow-x: clip/);
  assert.match(css, /La barra superior se parte en dos filas[\s\S]*\.topnav-inner \{[\s\S]*flex-wrap: wrap/);
  assert.match(css, /\.topnav-right \{[\s\S]*flex: 1 1 100%[\s\S]*flex-wrap: wrap/);
  assert.match(css, /\.topnav-right \.icon-btn,[\s\S]*\.topnav-right \.link-danger/);
  assert.match(css, /#btn-help::before/);
  assert.doesNotMatch(css, /#btn-notifications\s*\{[^}]*display\s*:\s*none/);
  assert.doesNotMatch(css, /#btn-logout\s*\{[^}]*display\s*:\s*none/);
  assert.match(css, /\.table-wrapper \{[\s\S]*overscroll-behavior-x: contain/);
});
