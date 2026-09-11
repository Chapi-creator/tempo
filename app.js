(function (global) {
  'use strict';

  // ---- Constantes de límites (schema) ----
  var LIMITS = {
    title: 80,
    desc: 2000,
    colTitle: 30,
    maxColumns: 20,
    maxCardsPerCol: 500,
    maxImportBytes: 512 * 1024
  };
  var VALID_TAGS = ['', 'tag1','tag2','tag3','tag4','tag5','tag6','tag7','tag8'];
  var DUE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // ponytail: blocklist clásica anti prototype pollution
  var FORBIDDEN_KEYS = { __proto__: 1, constructor: 1, prototype: 1 };

  function randomHex() {
    var arr = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      // fallback no-crypto (Node sin WebCrypto global)
      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    var s = '';
    for (var j = 0; j < arr.length; j++) s += ('0' + arr[j].toString(16)).slice(-2);
    return s;
  }

  function uid() {
    return 'c' + randomHex() + Date.now().toString(36);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\//g, '&#47;');
  }

  function blankCard() {
    return { id: uid(), title: '', desc: '', tag: '', due: '' };
  }

  function blankColumn(title) {
    return { id: uid(), title: sanitizeTitle(title || ''), cards: [] };
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
    col.cards.push(sanitizeCard(card));
    return col.cards[col.cards.length - 1];
  }

  function updateCard(board, colId, cardId, patch) {
    var col = findColumn(board, colId);
    if (!col) return false;
    var card = col.cards.find(function (c) { return c.id === cardId; });
    if (!card) return false;
    var clean = sanitizeCard(patch);
    Object.keys(clean).forEach(function (k) {
      if (k === 'id') return;
      if (FORBIDDEN_KEYS[k]) return;
      card[k] = clean[k];
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
    if (col) col.title = sanitizeTitle(title);
    return !!col;
  }

  function deleteColumn(board, colId) {
    var i = board.columns.findIndex(function (c) { return c.id === colId; });
    if (i === -1) return false;
    board.columns.splice(i, 1);
    return true;
  }

  // Mueve una columna a otra posición (índice destino) para reordenar el tablero.
  function moveColumn(board, colId, toIndex) {
    var from = board.columns.findIndex(function (c) { return c.id === colId; });
    if (from === -1) return false;
    toIndex = Math.max(0, Math.min(toIndex, board.columns.length - 1));
    if (toIndex === from) return false;
    var col = board.columns.splice(from, 1)[0];
    board.columns.splice(toIndex, 0, col);
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

  // ---- Export visual: HTML autocontenido (sin dependencias externas) ----
  var TAG_COLORS = {
    '': '#8b93a5', tag1: '#ff6b6b', tag2: '#ffa94d', tag3: '#ffd43b',
    tag4: '#69db7c', tag5: '#38d9a9', tag6: '#4dabf7', tag7: '#9775fa', tag8: '#f783ac'
  };

  // eslint-disable-next-line no-unused-vars
  function boardToHTML(board, meta) {
    if (!board || !Array.isArray(board.columns)) throw new Error('Tablero inválido');
    var name = (meta && meta.name) ? String(meta.name) : 'Tempo';
    var today = new Date();
    var iso = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    var dateStr = today.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
    var total = 0;

    var colsHtml = board.columns.map(function (col) {
      var done = isDoneColumn(col.title);
      var cardsHtml = col.cards.map(function (c) {
        total++;
        var overdue = c.due && !done && c.due < iso;
        var dueEsc = c.due ? '<div class="due' + (overdue ? ' overdue' : '') + '">⏰ ' + esc(formatDue(c.due)) + '</div>' : '';
        var tagDot = c.tag ? '<span class="tag" style="background:' + TAG_COLORS[c.tag] + '"></span>' : '';
        return '<div class="card' + (overdue ? ' overdue' : '') + '">' +
          '<div class="card-head">' + (tagDot || '') +
          '<h3>' + esc(c.title || 'Sin título') + '</h3></div>' +
          (c.desc ? '<p>' + esc(c.desc).replace(/\n/g, '<br>') + '</p>' : '') +
          dueEsc + '</div>';
      }).join('');

      return '<div class="column"><div class="col-head"><div class="col-title">' +
        esc(col.title || '(' + 'Sin nombre' + ')') +
        '</div><span class="col-count">' + col.cards.length + '</span></div>' +
        '<div class="cards">' + (cardsHtml || '<div class="empty">Sin tarjetas</div>') + '</div></div>';
    }).join('');

    return '<!DOCTYPE html>\n<html lang="es"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>' + esc(name) + ' — exportado ' + dateStr + '</title>' +
      '<style>' + EXPORT_CSS + '</style></head><body>' +
      '<header><h1>' + esc(name) + '</h1><span>' + total + ' tareas · ' + dateStr + '</span></header>' +
      '<main>' + colsHtml + '</main></body></html>';
  }

  function formatDue(d) {
    var p = d.split('-');
    if (p.length !== 3) return d;
    var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var m = +p[1];
    if (!(m >= 1 && m <= 12)) return d;
    return (+p[2]) + ' ' + MONTHS[m - 1];
  }

  var EXPORT_CSS =
    '* { box-sizing: border-box; margin: 0; }' +
    'body { background: #0f1115; color: #e6e9ef; font-family: system-ui, Segoe UI, Roboto, sans-serif; min-height: 100vh; }' +
    'header { display: flex; align-items: baseline; gap: 16px; padding: 18px 22px; background: #171a21; border-bottom: 1px solid #2a303c; position: sticky; top: 0; }' +
    'header h1 { font-size: 20px; font-weight: 700; }' +
    'header span { font-size: 12px; color: #8b93a5; margin-left: auto; }' +
    'main { padding: 20px; display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; scrollbar-width: thin; scrollbar-color: #2a303c transparent; }' +
    '.column { background: #171a21; border: 1px solid #2a303c; border-radius: 12px; width: 280px; min-width: 280px; display: flex; flex-direction: column; max-height: calc(100vh - 140px); }' +
    '.col-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #2a303c; }' +
    '.col-title { font-weight: 700; font-size: 14px; }' +
    '.col-count { font-size: 12px; color: #8b93a5; background: #1e232d; border-radius: 20px; padding: 2px 8px; }' +
    '.cards { padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #2a303c transparent; }' +
    '.card { background: #1e232d; border: 1px solid #2a303c; border-radius: 10px; padding: 10px 12px; font-size: 13px; }' +
    '.card-head { display: flex; align-items: center; gap: 6px; }' +
    '.card h3 { font-size: 13px; font-weight: 600; }' +
    '.card p { color: #8b93a5; font-size: 12px; white-space: pre-wrap; margin: 6px 0 0; }' +
    '.tag { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }' +
    '.due { font-size: 11px; color: #8b93a5; margin-top: 6px; }' +
    '.card.overdue { border-color: #ff6b6b; } .card.overdue h3 { color: #ff6b6b; }' +
    '.due.overdue { color: #ff6b6b; font-weight: 700; }' +
    '.empty { font-size: 12px; color: #8b93a5; padding: 8px; text-align: center; }';

  // ---- Sanitización (borde de confianza) ----
  function sanitizeTitle(v) {
    if (typeof v !== 'string') return '';
    return v.slice(0, LIMITS.colTitle);
  }

  function sanitizeCard(card) {
    var out = {
      id: typeof card.id === 'string' && card.id ? card.id.slice(0, 64) : uid(),
      title: typeof card.title === 'string' ? card.title.slice(0, LIMITS.title) : '',
      desc: typeof card.desc === 'string' ? card.desc.slice(0, LIMITS.desc) : '',
      tag: '',
      due: ''
    };
    if (card.tag !== null && typeof card.tag === 'string' && VALID_TAGS.indexOf(card.tag) !== -1) {
      out.tag = card.tag;
    }
    if (card.due && typeof card.due === 'string' && DUE_RE.test(card.due.slice(0, 16))) {
      out.due = card.due;
    }
    return out;
  }

  // ---- Estadísticas ----
  // doneLike detecta columnas que representan "terminado"
  // ponytail: regex de nombres; agrega más palabras al patrón si alguien lo usa con otro idioma
  var DONE_RE = /hecho|done|listo|terminad|completad|finalizad|fin/i;

  function isDoneColumn(title) {
    return DONE_RE.test(String(title || ''));
  }

  function recordEvent(events, cardId, fromCol, toCol, ts) {
    ts = typeof ts === 'number' && isFinite(ts) ? ts : Date.now();
    var evt = {
      id: String(cardId || '').slice(0, 64),
      from: String(fromCol || '').slice(0, 30),
      to: String(toCol || '').slice(0, 30),
      ts: ts
    };
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

  // ---- Deserialización con schema estricto ----
  // Acepta un string JSON o un objeto ya parseado. NUNCA muta el board pasado;
  // devuelve un board nuevo y limpio o lanza Error con mensaje claro.
  function deserialize(raw) {
    if (typeof raw === 'string') {
      if (raw.length > LIMITS.maxImportBytes) {
        throw new Error('Archivo demasiado grande (máx. ' + Math.round(LIMITS.maxImportBytes / 1024) + ' KB)');
      }
      raw = JSON.parse(raw);
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) {
      throw new Error('El archivo no parece un tablero Kanban');
    }
    if (raw.columns.length > LIMITS.maxColumns) {
      throw new Error('Demasiadas columnas (máx. ' + LIMITS.maxColumns + ')');
    }

    var seenIds = {};
    var safeCols = [];
    raw.columns.forEach(function (c) {
      if (safeCols.length >= LIMITS.maxColumns) return;
      var colCards = [];
      if (Array.isArray(c.cards)) {
        c.cards.forEach(function (card) {
          if (colCards.length >= LIMITS.maxCardsPerCol) return;
          var c2 = (card && typeof card === 'object') ? sanitizeCard(card) : sanitizeCard({});
          // ids únicos a nivel global del tablero
          if (seenIds[c2.id]) c2.id = uid();
          seenIds[c2.id] = true;
          colCards.push(c2);
        });
      }
      safeCols.push({
        id: typeof c.id === 'string' && c.id && !seenIds[c.id] ? c.id.slice(0, 64) : uid(),
        title: sanitizeTitle(c.title),
        cards: colCards
      });
    });
    return { columns: safeCols };
  }

  var api = {
    LIMITS: LIMITS,
    uid: uid,
    esc: esc,
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
    moveColumn: moveColumn,
    moveCard: moveCard,
    serialize: serialize,
    deserialize: deserialize,
    boardToHTML: boardToHTML,
    sanitizeCard: sanitizeCard,
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