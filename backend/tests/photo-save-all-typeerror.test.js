'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'frontend', 'js', 'components', 'photoGallery.js'), 'utf8');

function loadGallery({ canShare, share } = {}) {
  const canShareCalls = [];
  const shareCalls = [];
  const downloads = [];
  const sandbox = {
    window: { AppConfig: { resolveUrl: (url) => url } },
    location: { href: 'https://inmobles.test/app/' },
    navigator: {
      share: share || (async (data) => { shareCalls.push(data); }),
      canShare: canShare || ((data) => { canShareCalls.push(data); return true; }),
    },
    Blob,
    File: class File extends Blob {
      constructor(parts, name, options) {
        super(parts, options);
        this.name = name;
      }
    },
    URL,
    document: {
      createElement: () => ({
        style: {},
        click() { downloads.push(this.download); },
        remove() {},
      }),
      body: { appendChild() {} },
    },
    setTimeout: () => 0,
    fetch: async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }),
    UI: { toast() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { gallery: sandbox.window.PhotoGallery, canShareCalls, shareCalls, downloads };
}

test('saveMany envía un array plano de archivos a canShare y share', async () => {
  const { gallery, canShareCalls, shareCalls } = loadGallery();
  const fotos = [
    new Blob(['uno'], { type: 'image/jpeg' }),
    new Blob(['dos'], { type: 'image/jpeg' }),
  ];

  const result = await gallery.saveMany(fotos, { names: ['uno.jpg', 'dos.jpg'], baseName: 'prop' });

  assert.equal(result, 'shared');
  assert.equal(canShareCalls.length, 1, 'se validó una sola vez');
  assert.equal(canShareCalls[0].files.length, 2, 'canShare recibe los dos archivos, no un array anidado');
  assert.equal(canShareCalls[0].files[0].name, 'uno.jpg');
  assert.equal(shareCalls.length, 1, 'se abrió una sola hoja para todo el jalón');
  assert.equal(shareCalls[0].files.length, 2);
});

test('si canShare lanza TypeError, guardar todas descarga las fotos sin tirar el error', async () => {
  const { gallery, downloads } = loadGallery({
    canShare: () => { throw new TypeError('Failed to construct sequence<File>'); },
  });
  const fotos = [
    new Blob(['uno'], { type: 'image/jpeg' }),
    new Blob(['dos'], { type: 'image/jpeg' }),
  ];

  const result = await gallery.saveMany(fotos, { names: ['uno.jpg', 'dos.jpg'], baseName: 'prop' });

  assert.equal(result, 'downloaded');
  assert.deepEqual(downloads, ['uno.jpg', 'dos.jpg']);
});

test('saveMany reutiliza la URL resuelta con token de la precarga', () => {
  assert.match(source, /function resolveSource\(source\)/, 'falta resolver la URL con token');
  assert.match(source, /window\.AppConfig\.resolveUrl/);
  assert.match(source, /const resolved = resolveSource\(source\);[\s\S]*fetch\(resolved/);
  assert.match(source, /downloads\.forEach/, 'el respaldo usa los nombres originales');
});
