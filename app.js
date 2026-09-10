(function (global) {
  'use strict';

  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function blankCard() {
    return { id: uid(), title: '', desc: '', tag: '', due: '' };
  }

  function blankColumn(title) {
    return { id: uid(), title: title, cards: [] };
  }

  function newBoard() {
    return {
      columns: [
        blankColumn('Por hacer'),
        blankColumn('En curso'),
        blankColumn('Hecho')
      ]
    };
  }

  function findColumn(board, colId) {
    return board.columns.find(function (c) { return c.id === colId; });
  }

  function addCard(board, colId, card) {
    var col = findColumn(board, colId);
    if (!col) return null;
    card.id = card.id || uid();
    col.cards.push(card);
    return card;
  }

  function updateCard(board, colId, cardId, patch) {
    var col = findColumn(board, colId);
    if (!col) return false;
    var card = col.cards.find(function (c) { return c.id === cardId; });
    if (!card) return false;
    Object.keys(patch).forEach(function (k) {
      if (k !== 'id') card[k] = patch[k];
    });
    return true;
  }

  function deleteCard(board, colId, cardId) {
    var col = findColumn(board, colId);
    if (!col) return false;
    var i = col.cards.findIndex(function (c) { return c.id === cardId; });
    if (i === -1) return false;
    col.cards.splice(i, 1);
    return true;
  }

  function addColumn(board, title) {
    var col = blankColumn(title || 'Nueva columna');
    board.columns.push(col);
    return col;
  }

  function renameColumn(board, colId, title) {
    var col = findColumn(board, colId);
    if (col) col.title = title;
    return !!col;
  }

  function deleteColumn(board, colId) {
    var i = board.columns.findIndex(function (c) { return c.id === colId; });
    if (i === -1) return false;
    board.columns.splice(i, 1);
    return true;
  }

  // Move a card from one column to another at a given index (or end if index not provided)
  function moveCard(board, fromColId, cardId, toColId, index) {
    var from = findColumn(board, fromColId);
    if (!from) return false;
    var i = from.cards.findIndex(function (c) { return c.id === cardId; });
    if (i === -1) return false;
    var card = from.cards.splice(i, 1)[0];

    if (fromColId === toColId && typeof index === 'number') {
      var adjust = index > i ? index - 1 : index;
      insertAt(from.cards, card, adjust);
      return true;
    }

    var to = findColumn(board, toColId);
    if (!to) return false;
    insertAt(to.cards, card, typeof index === 'number' ? index : to.cards.length);
    return true;
  }

  function insertAt(arr, item, index) {
    if (index < 0) index = 0;
    if (index >= arr.length) { arr.push(item); return; }
    arr.splice(index, 0, item);
  }

  function serialize(board) {
    if (!board || !Array.isArray(board.columns)) {
      throw new Error('Tablero inválido');
    }
    return JSON.stringify(board);
  }

  // ---- Estadísticas ----
  // doneLike detecta columnas que representan "terminado"
  // ponytail: regex de nombres; agrega más palabras al patrón si alguien lo usa con otro idioma
  var DONE_RE = /hecho|done|listo|terminad|completad|finalizad|fin/i;

  function isDoneColumn(title) {
    return DONE_RE.test(String(title || ''));
  }

  function recordEvent(events, cardId, fromCol, toCol, ts) {
    ts = ts || Date.now();
    var evt = { id: cardId, from: fromCol || '', to: toCol || '', ts: ts };
    events.push(evt);
    return evt;
  }

  // Agrupa eventos por día (timestamp local) y devuelve los últimos `days` días
  // incluyendo días sin actividad (cuenta 0), ordenado de más viejo a más nuevo
  function completionsPerDay(events, days) {
    days = days || 14;
    var now = new Date();
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var count = 0;
      events.forEach(function (e) {
        var ed = new Date(e.ts);
        var edate = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
        var tdate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (edate.getTime() === tdate.getTime() && isDoneColumn(e.to) && !isDoneColumn(e.from)) count++;
      });
      out.push({ key: key, count: count });
    }
    return out;
  }

  function totalCompletions(events) {
    return events.filter(function (e) { return isDoneColumn(e.to) && !isDoneColumn(e.from); }).length;
  }

  function deserialize(raw) {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || !Array.isArray(parsed.columns)) {
      throw new Error('El archivo no parece un tablero Kanban');
    }
    // Sanitize: every column needs an id/title/cards array
    parsed.columns.forEach(function (c) {
      if (typeof c.id !== 'string' || !c.id) c.id = uid();
      if (typeof c.title !== 'string') c.title = 'Columna';
      if (!Array.isArray(c.cards)) c.cards = [];
      c.cards.forEach(function (card) {
        if (typeof card.id !== 'string' || !card.id) card.id = uid();
        card.title = card.title || '';
        card.desc = card.desc || '';
        card.tag = card.tag || '';
        card.due = card.due || '';
      });
    });
    return parsed;
  }

  var api = {
    uid: uid,
    blankCard: blankCard,
    blankColumn: blankColumn,
    newBoard: newBoard,
    findColumn: findColumn,
    addCard: addCard,
    updateCard: updateCard,
    deleteCard: deleteCard,
    addColumn: addColumn,
    renameColumn: renameColumn,
    deleteColumn: deleteColumn,
    moveCard: moveCard,
    serialize: serialize,
    deserialize: deserialize,
    isDoneColumn: isDoneColumn,
    recordEvent: recordEvent,
    completionsPerDay: completionsPerDay,
    totalCompletions: totalCompletions
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.KanbanModel = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);