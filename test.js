'use strict';
const assert = require('assert');
const K = require('./app.js');

// ---- Pack1: núcleo funcional ----
const b = K.newBoard();
assert.strictEqual(b.columns.length, 3, 'tablero arranca con 3 columnas');

const col0 = b.columns[0];
const c = K.addCard(b, col0.id, { title: 'Definir MVP', desc: 'qué entra', tag: 'tag3', due: '2026-09-15' });
assert.ok(c.id, 'tarjeta tiene id');

K.addCard(b, col0.id, K.blankCard());
assert.strictEqual(col0.cards.length, 2, 'tarjeta en blanco se agrega');

K.updateCard(b, col0.id, c.id, { desc: 'qué entra y qué no' });
assert.strictEqual(col0.cards[0].desc, 'qué entra y qué no', 'updateCard edita campos');

const col1 = b.columns[1];
K.moveCard(b, col0.id, c.id, col1.id);
assert.strictEqual(col0.cards.length, 1, 'moveCard quita de columna origen');
assert.strictEqual(col1.cards.length, 1, 'moveCard agrega a columna destino');
assert.strictEqual(col1.cards[0].id, c.id, 'la tarjeta movida es la correcta');

const json = K.serialize(b);
const b2 = K.deserialize(json);
const json2 = K.serialize(b2);
assert.strictEqual(json, json2, 'export -> import -> export es idéntico (round-trip estable)');

K.deleteCard(b, col1.id, c.id);
assert.strictEqual(col1.cards.length, 0, 'deleteCard elimina');

const col2 = K.addColumn(b, 'Aprobado');
assert.strictEqual(b.columns.length, 4, 'addColumn agrega');
K.renameColumn(b, col2.id, 'Listo');
assert.strictEqual(col2.title, 'Listo', 'renameColumn renombra');
K.deleteColumn(b, col2.id);
assert.strictEqual(b.columns.length, 3, 'deleteColumn elimina');

assert.throws(() => K.deserialize('{"columns":null}'), /Tablero|no parece/, 'deserialize rechaza datos corruptos');

// ---- Pack2: estadísticas ----
const events = [];
K.recordEvent(events, 'c1', 'Por hacer', 'Hecho', Date.now());
K.recordEvent(events, 'c2', 'En curso', 'Hecho', Date.now());
K.recordEvent(events, 'c3', 'Por hacer', 'En curso', Date.now());
K.recordEvent(events, 'c1', 'Hecho', 'En curso', Date.now()); // reabierta: no cuenta
assert.strictEqual(K.totalCompletions(events), 2, 'totalCompletions solo cuenta entradas a columna done');
assert.ok(K.isDoneColumn('Hecho'), 'Hecho es columna done');
assert.ok(K.isDoneColumn('Done!'), 'Done es columna done');
assert.ok(!K.isDoneColumn('Por hacer'), 'Por hacer no es done');

const perDay = K.completionsPerDay(events, 7);
assert.strictEqual(perDay.length, 7, 'completionsPerDay devuelve exactamente N días');
assert.strictEqual(perDay[perDay.length - 1].count, 2, 'el día de hoy cuenta las 2 completadas');
K.totalCompletions([{ ts: 'xxx', to: 'Hecho', from: '' }]); // ts corrupto: no explota

// ---- Pack3: SEGURIDAD ----
// 3.1 XSS: tag/due se neutralizan en el borde (eran los sinks a atributos).
//     title/desc se conservan como texto plano: su seguridad la garantiza el
//     render con textContent/DOM API en ui.js (no el sanitizador).
function prepare(xssCard) {
  const board = K.newBoard();
  return K.deserialize(JSON.stringify({ columns: [{ id: 'x', title: 'C', cards: [xssCard] }] })).columns[0].cards[0];
}
const XS = [
  { tag: 'tag1"><img src=x onerror=alert(1)>', due: '' },
  { tag: '', due: '<img src=x onerror=alert(1)>' },
  { tag: 'tag1" onmouseover="alert(1)', due: '' },
  { title: '<script>alert(1)</script>', tag: '', due: '' },
  { desc: '"><img src=x onerror=alert(1)>', tag: '', due: '' },
  { title: '" onclick="alert(1)', tag: '', due: '' }
];
XS.forEach((payload, i) => {
  const clean = prepare(payload);
  assert.ok(!/[<>"']/.test(clean.tag), 'XSS tag no sobrevive #' + i);
  assert.ok(!/[<>"']/.test(clean.due), 'XSS due no sobrevive #' + i);
});
// title/desc maliciosos se conservan enteros (textContent los hará inertes)
const kept = prepare({ title: '<script>alert(1)</script>', tag: '', due: '' });
assert.strictEqual(kept.title, '<script>alert(1)</script>', 'title se conserva (inocuo via textContent)');

// 3.2 escapeHtml escapa el juego completo de caracteres peligrosos
const esc = K.esc('<img src=x onerror=alert(1)>"&\'');
assert.strictEqual(esc, '&lt;img src=x onerror=alert(1)&gt;&quot;&amp;&#39;', 'esc cubre < > " & \'');
assert.strictEqual(K.esc("a/b"), 'a&#47;b', 'esc cubre /');

// 3.3 Prototype pollution: __proto__/constructor/prototype no contaminan
const pBoard = K.deserialize('{"columns":[{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}},"id":"__proto__","title":"__proto__?!","cards":[{"__proto__":{"polluted3":1},"id":"evil","title":"t","tag":"__proto__","due":"__proto__"}]}]}');
assert.strictEqual({}.polluted, undefined, '__proto__ no contamina Object.prototype');
assert.strictEqual({}.polluted2, undefined, 'constructor.prototype no contamina');
assert.strictEqual({}.polluted3, undefined, 'tarjeta __proto__ no contamina');
assert.ok(pBoard.columns[0].title, 'titulo __proto__ se sanitiza a string válido');
assert.strictEqual(pBoard.columns[0].cards[0].tag, '', '__proto__ como tag se descarta');
assert.strictEqual(pBoard.columns[0].cards[0].due, '', '__proto__ como due se descarta');

// 3.4 Schema: tag whitelist + due formato + límites
assert.strictEqual(prepare({ title: 'ok', tag: 'tag99', due: '' }).tag, '', 'tag fuera de whitelist se descarta');
assert.strictEqual(prepare({ title: 'ok', tag: 'tag4', due: '26-09-15' }).due, '', 'due sin formato válido se descarta');
assert.strictEqual(prepare({ title: 'ok', tag: 'tag4', due: '2026-09-15' }).due, '2026-09-15', 'due válido se conserva');

// 3.5 Límites: tamaño de import, columnas, cards por columna
assert.ok(K.deserialize({ columns: [] }) && K.deserialize({ columns: [{ title: '' }] }), 'colección mínima válida');
const manyCols = { columns: [] };
for (let i = 0; i < 30; i++) manyCols.columns.push({ id: 'c' + i, title: 'c' + i, cards: [] });
assert.throws(() => K.deserialize(JSON.stringify(manyCols)), /Demasiadas columnas/, 'límite de 20 columnas se impone');

const maxCards = [];
for (let j = 0; j < 600; j++) maxCards.push({ title: 't' + j });
const bigCol = K.deserialize(JSON.stringify({ columns: [{ title: 'C', cards: maxCards }] }));
assert.strictEqual(bigCol.columns[0].cards.length, 500, 'límite de 500 cards por columna se impone');

const bigByte = '{"columns":[]}          ' + new Array(600 * 1024).join(' ');
assert.throws(() => K.deserialize(bigByte), /grande|KB/, 'límite de 512 KB se impone');

// 3.6 ids únicos tras import (no colisiones que rompan drag&drop)
const dup = K.deserialize(JSON.stringify({ columns: [
  { title: 'A', cards: [{ id: 'same', title: '1' }, { id: 'same', title: '2' }] }
]}));
const ids = dup.columns[0].cards.map(x => x.id);
assert.strictEqual(new Set(ids).size, 2, 'ids duplicados se regeneran');

// 3.7 uid() no colisiona en masa
const seen = new Set();
for (let i = 0; i < 500; i++) seen.add(K.uid());
assert.strictEqual(seen.size, 500, '500 uid únicos');

// ---- Pack4: boardStore (multi-tablero) ----
const BS = require('./boardStore.js');

// localStorage falsificado para correr sin navegador
const store = { d: {} };
BS._use({
  getItem: k => (k in store.d ? store.d[k] : null),
  setItem: (k, v) => { store.d[k] = String(v); },
  removeItem: k => { delete store.d[k]; }
});

// 4.1 migración v1 -> v2
const v1data = JSON.stringify({ columns: [{ id: 'c1', title: 'Por hacer', cards: [{ id: 't', title: 'x', tag: '', due: '' }] }] });
store.d['board.data'] = v1data;
store.d['board.events'] = '[]';
const migrated = BS.migrate();
assert.ok(migrated, 'migrate detecta tablero v1');
let idx = BS.loadIndex();
assert.strictEqual(idx.length, 1, 'index arranca con 1 tablero');
assert.strictEqual(idx[0].name, 'Tablero 1', 'nombre por defecto en migración');
assert.deepStrictEqual(BS.loadBoard(migrated), JSON.parse(v1data), 'datos v1 preservados');
assert.strictEqual('board.data' in store.d, false, 'clave v1 removida');
assert.strictEqual(BS.migrate(), null, 'migrate no re-migra');

// 4.2 ensureDefault / create / rename / multi-tablero aislado
BS.ensureDefault(BS.loadIndex());
idx = BS.loadIndex();
const id2 = BS.createBoard(BS.loadIndex(), '  Trabajo  ');
assert.ok(id2 !== migrated, 'nuevo tablero con id distinto');
idx = BS.loadIndex();
assert.strictEqual(idx.length, 2, 'createBoard agrega al index');
assert.strictEqual(idx.filter(x => x.id === id2)[0].name, 'Trabajo', 'nombre se sanitiza (trim)');

BS.saveBoard(id2, JSON.parse(v1data));
BS.saveEvents(id2, [{ ts: 1, from: '', to: 'Hecho', id: 'e1' }]);
assert.deepStrictEqual(BS.loadBoard(id2), JSON.parse(v1data), 'board se guarda/lee por id');
assert.strictEqual(BS.loadEvents(migrated).length, 0, 'eventos v1 migrados vacíos');
assert.strictEqual(BS.loadEvents(id2).length, 1, 'eventos aislados por tablero');

assert.strictEqual(BS.sanitizeName('a'.repeat(100)).length, 40, 'límite de 40 chars en nombre');
assert.ok(BS.renameBoard(BS.loadIndex(), id2, '  Personal  '), 'renameBoard ok');
assert.strictEqual(BS.loadIndex().filter(x => x.id === id2)[0].name, 'Personal', 'renameBoard aplica el nuevo nombre');

assert.ok(BS.deleteBoard(BS.loadIndex(), id2), 'deleteBoard ok');
idx = BS.loadIndex();
assert.strictEqual(idx.length, 1, 'deleteBoard quita del index');
assert.ok('board.data.' + id2 in store.d === false, 'deleteBoard limpia los datos del tablero');
assert.deepStrictEqual(BS.loadBoard(migrated), JSON.parse(v1data), 'el otro tablero sigue intacto');

console.log('Todos los tests pasan: funcional + estadísticas + seguridad (XSS, pollution, schema, límites, ids) + boardStore');