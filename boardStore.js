(function (global) {
  'use strict';

  // Almacén de tableros: index + datos/eventos por tablero en localStorage.
  // storage se inyecta con _use() para poder testear en Node sin DOM.
  // ponytail: sin capa de abstracción; los keys planos bastan mientras sean < ~5MB.
  var LS = null;
  function _use(storage) { LS = storage || null; }

  var K_INDEX = 'board.index';
  var K_ACTIVE = 'board.active';
  var K_DATA = 'board.data.';
  var K_EVENTS = 'board.events.';
  var K_LEGACY_DATA = 'board.data';
  var K_LEGACY_EVENTS = 'board.events';
  var NAME_MAX = 40;

  function sanitizeName(name) {
    return typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '';
  }

  function uid() {
    // copia local mínima (el modelo tiene la propia; aquí no queremos acoplarlo)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var a = new Uint8Array(8);
      crypto.getRandomValues(a);
      var s = '';
      for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
      return 'b' + s + Date.now().toString(36);
    }
    return 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getItem(key) {
    try { return LS ? LS.getItem(key) : null; } catch (e) { return null; }
  }

  function setItem(key, value) {
    try {
      if (LS) LS.setItem(key, value);
      return true;
    } catch (e) { return false; }
  }

  function removeItem(key) {
    try { if (LS) LS.removeItem(key); } catch (e) {}
  }

  function parseIndex(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(function (b) { return b && typeof b.id === 'string' && b.id; })
      .map(function (b) { return { id: b.id, name: sanitizeName(b.name || 'Tablero') }; });
  }

  function loadIndex() {
    var raw = getItem(K_INDEX);
    if (!raw) return null; // null = no hay index todavía (revisar migración)
    try { return parseIndex(JSON.parse(raw)); } catch (e) { return []; }
  }

  function saveIndex(list) {
    setItem(K_INDEX, JSON.stringify(list));
  }

  function loadBoard(id) {
    var raw = getItem(K_DATA + id);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function saveBoard(id, data) {
    return setItem(K_DATA + id, JSON.stringify(data));
  }

  function loadEvents(id) {
    var raw = getItem(K_EVENTS + id);
    if (!raw) return null;
    try {
      var e = JSON.parse(raw);
      return Array.isArray(e) ? e : [];
    } catch (e) { return []; }
  }

  function saveEvents(id, events) {
    setItem(K_EVENTS + id, JSON.stringify(events || []));
  }

  // Migra el formato v1 (claves board.data y board.events, tablero único)
  // a v2 (index + tableros). Devuelve el tablero migrado o null si no había nada.
  function migrate() {
    var legacy = getItem(K_LEGACY_DATA);
    if (!legacy) return null;
    if (loadIndex() !== null) return null; // ya en v2
    var board = null;
    try { board = JSON.parse(legacy); } catch (e) { board = null; }
    if (!board || !Array.isArray(board.columns)) {
      removeItem(K_LEGACY_DATA);
      removeItem(K_LEGACY_EVENTS);
      saveIndex([]);
      return null;
    }
    var id = uid();
    var name = (typeof board.name === 'string' && board.name.trim()) ? board.name.trim() : 'Tablero 1';
    saveIndex([{ id: id, name: sanitizeName(name) }]);
    saveBoard(id, board);
    var evts = getItem(K_LEGACY_EVENTS);
    if (evts) saveEvents(id, evts);
    removeItem(K_LEGACY_DATA);
    removeItem(K_LEGACY_EVENTS);
    return id;
  }

  // Construye el estado inicial si no hay nada: devuelve el id activo
  // (el último usado, o el primero del index).
  function ensureDefault(index) {
    index = Array.isArray(index) ? index : [];
    var active = getItem(K_ACTIVE);
    if (active === null) active = index.length > 0 ? index[0].id : null;
    var found = index.some(function (x) { return x.id === active; });
    if (!found) active = index.length > 0 ? index[0].id : null;
    if (active) return active;
    var id = uid();
    saveIndex([{ id: id, name: 'Tablero 1' }]);
    return id;
  }

  function createBoard(index, name) {
    var id = uid();
    index.push({ id: id, name: sanitizeName(name || 'Tablero') });
    saveIndex(index);
    return id;
  }

  function renameBoard(index, id, name) {
    var b = index.find(function (x) { return x.id === id; });
    if (!b) return false;
    b.name = sanitizeName(name || 'Tablero');
    saveIndex(index);
    return true;
  }

  function deleteBoard(index, id) {
    var i = index.findIndex(function (x) { return x.id === id; });
    if (i === -1) return false;
    index.splice(i, 1);
    saveIndex(index);
    removeItem(K_DATA + id);
    removeItem(K_EVENTS + id);
    if (getItem(K_ACTIVE) === id) removeItem(K_ACTIVE);
    return true;
  }

  function setActive(id) {
    setItem(K_ACTIVE, id);
  }

  var api = {
    sanitizeName: sanitizeName,
    loadIndex: loadIndex,
    saveIndex: saveIndex,
    loadBoard: loadBoard,
    saveBoard: saveBoard,
    loadEvents: loadEvents,
    saveEvents: saveEvents,
    migrate: migrate,
    ensureDefault: ensureDefault,
    setActive: setActive,
    createBoard: createBoard,
    renameBoard: renameBoard,
    deleteBoard: deleteBoard,
    _use: _use,
    _uid: uid
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BoardStore = api;
    _use(typeof localStorage !== 'undefined' ? localStorage : null);
  }
})(typeof window !== 'undefined' ? window : globalThis);