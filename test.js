'use strict';
const assert = require('assert');
const K = require('./app.js');

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

// Ciclo local: serializar -> deserializar -> estado idéntico
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

// Estadísticas
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

console.log('Kanban model: OK (round-trip, moves, CRUD, validación, estadísticas)');