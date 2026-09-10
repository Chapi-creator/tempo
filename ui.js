/* Tempo UI — render por DOM API + textContent (sin innerHTML dinámico).
   Toda interpolación de datos del usuario pasa por textContent/atributos de
   API DOM, que no ejecutan HTML. */
(function () {
  'use strict';
  var M = KanbanModel;
  var BS = BoardStore;

  var $ = function (id) { return document.getElementById(id); };
  var boardEl = $('board');

  var TAGS = ['', 'tag1','tag2','tag3','tag4','tag5','tag6','tag7','tag8'];
  var TAG_LABEL = { tag1:'Rojo', tag2:'Naranja', tag3:'Amarillo', tag4:'Verde', tag5:'Turquesa', tag6:'Azul', tag7:'Morado', tag8:'Rosa' };

  var state = {
    boardId: null,
    board: M.newBoard(),
    colId: null, cardId: null, editingTab: null,
    query: '', tag: '',
    undo: [], redo: []
  };
  var events = [];

  function persist() {
    BS.saveBoard(state.boardId, state.board);
    BS.saveEvents(state.boardId, events);
  }

  function load() {
    BS.migrate();
    var hadIndex = BS.loadIndex() !== null;
    var idx = hadIndex ? BS.loadIndex() : [];
    state.boardId = BS.ensureDefault(idx);       // crea (y persiste) "Tablero 1" si no hay nada
    var b = BS.loadBoard(state.boardId);
    if (b) {
      try { state.board = M.deserialize(b); } catch (e) { state.board = M.newBoard(); }
    } else {
      state.board = M.newBoard();               // index existe pero sin datos: arranque limpio
    }
    events = BS.loadEvents(state.boardId) || [];
    return { fresh: !hadIndex };
  }

  var fresh = load().fresh;
  if (fresh) seedDemo();

  function seedDemo() {
    var b = state.board;
    var c0 = b.columns[0], c1 = b.columns[1], c2 = b.columns[2];
    M.addCard(b, c0.id, { title:'Definir el MVP', desc:'Qué entra y qué no entra en la versión 1', tag:'tag3', due:'' });
    M.addCard(b, c0.id, { title:'Elegir plantillas', desc:'3 estilos de portafolio', tag:'tag6', due:'' });
    M.addCard(b, c1.id, { title:'Estructura de datos', desc:'localStorage + export JSON', tag:'tag4', due:'' });
    M.addCard(b, c2.id, { title:'Vista previa en vivo', desc:'Listo', tag:'tag8', due:new Date().toISOString().slice(0,10) });
  }

  buildBoardSelect();
  buildTagChips();
  persist();
  render();
  renderStats();

  // ---- Tableros ----
  function buildBoardSelect() {
    var sel = $('boardSel');
    sel.innerHTML = '';
    BS.loadIndex().forEach(function (b) {
      var o = document.createElement('option');
      o.value = b.id; o.textContent = b.name; o.selected = b.id === state.boardId;
      sel.appendChild(o);
    });
    $('boardCount').textContent = '(' + BS.loadIndex().length + ')';
  }
  function switchBoard(id) {
    closeEditor();
    persist();
    state.boardId = id;
    BS.setActive(id);
    state.board = M.deserialize(BS.loadBoard(id) || M.newBoard());
    events = BS.loadEvents(id) || [];
    state.query = ''; state.tag = '';
    $('searchInput').value = '';
    state.undo = []; state.redo = [];
    buildBoardSelect(); buildTagChips(); render();
  }
  $('boardSel').addEventListener('change', function (e) { switchBoard(e.target.value); });
  $('newBoardBtn').addEventListener('click', function () {
    var name = prompt('Nombre del tablero:', 'Tablero');
    if (name === null) return;
    var id = BS.createBoard(BS.loadIndex(), name || 'Tablero');
    BS.saveBoard(id, M.serialize(M.newBoard()));
    BS.saveEvents(id, []);
    switchBoard(id);
  });
  $('renameBoardBtn').addEventListener('click', function () {
    var meta = BS.loadIndex().find(function (x) { return x.id === state.boardId; });
    var name = prompt('Nombre del tablero:', meta ? meta.name : '');
    if (name === null) return;
    BS.renameBoard(BS.loadIndex(), state.boardId, name);
    buildBoardSelect(); render();
  });
  $('deleteBoardBtn').addEventListener('click', function () {
    var idx = BS.loadIndex();
    if (idx.length <= 1) { alert('No se puede borrar el único tablero'); return; }
    if (!confirm('¿Borrar este tablero?')) return;
    var rest = idx.filter(function (x) { return x.id !== state.boardId; });
    BS.deleteBoard(BS.loadIndex(), state.boardId);
    switchBoard(rest[0].id);
  });

  // ---- Filtros ----
  function matchesFilter(card) {
    var q = state.query;
    if (q && card.title.toLowerCase().indexOf(q) === -1 && card.desc.toLowerCase().indexOf(q) === -1) return false;
    if (state.tag && card.tag !== state.tag) return false;
    return true;
  }
  function buildTagChips() {
    var box = $('tagChips');
    box.innerHTML = '';
    box.appendChild(chip('', 'Todos', 'Todos'));
    TAGS.slice(1).forEach(function (t) {
      box.appendChild(chip(t, TAG_LABEL[t], ''));
    });
  }
  function chip(tag, label, dotLabel) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (state.tag === tag ? ' active' : '') + (tag === '' ? ' all' : '');
    b.title = label;
    if (tag) { b.style.background = 'var(--' + tag + ')'; b.textContent = ''; }
    else b.textContent = label;
    b.addEventListener('click', function () {
      state.tag = (state.tag === tag) ? '' : tag;
      buildTagChips(); render();
    });
    return b;
  }
  $('searchInput').addEventListener('input', function (e) {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });

  // ---- Undo / Redo ----
  function snapshot() {
    var before = M.serialize(state.board);
    state.undo.push({ b: before, e: JSON.stringify(events) });
    if (state.undo.length > 50) state.undo.shift();
    state.redo = [];
  }
  // B5: snapshot solo si el contenido cambió (evita undo "huérfano")
  function snapshotIfChanged(before) {
    if (M.serialize(state.board) === before) return;
    state.undo.push({ b: before, e: JSON.stringify(events) });
    if (state.undo.length > 50) state.undo.shift();
    state.redo = [];
  }
  function restore(snap) {
    state.board = M.deserialize(snap.b);
    events = JSON.parse(snap.e) || [];
    persist(); render();
  }
  function undo() {
    if (!state.undo.length) return;
    state.redo.push({ b: M.serialize(state.board), e: JSON.stringify(events) });
    restore(state.undo.pop());
  }
  function redo() {
    if (!state.redo.length) return;
    state.undo.push({ b: M.serialize(state.board), e: JSON.stringify(events) });
    restore(state.redo.pop());
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeEditor(); return; }
    var t = e.target;
    var inField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key.toLowerCase() === 'z')) {
      if (!inField) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      if (!inField) { e.preventDefault(); redo(); }
      return;
    }
    if (inField) return;
    if (e.key.toLowerCase() === 'n' && state.board.columns.length > 0) {
      addCardTo(state.board.columns[0].id);
    }
  });

  // ---- Render (DOM API, sin HTML interpolado) ----
  function render() {
    boardEl.innerHTML = '';
    var filtering = !!(state.query || state.tag);
    state.board.columns.forEach(function (col) {
      var colEl = document.createElement('div');
      colEl.className = 'column';
      colEl.dataset.col = col.id;

      var head = document.createElement('div');
      head.className = 'col-head';

      var titleSpan = document.createElement('span');
      titleSpan.className = 'col-title';
      titleSpan.textContent = col.title;

      var visible = col.cards.filter(matchesFilter);

      var countSpan = document.createElement('span');
      countSpan.className = 'col-count';
      countSpan.textContent = filtering ? (visible.length + '/' + col.cards.length) : String(col.cards.length);

      var grow = document.createElement('span');
      grow.className = 'grow';

      var renameBtn = iconButton('✎', 'Renombrar');
      renameBtn.addEventListener('click', function () { renameColumn(col.id); });
      var delBtn = iconButton('🗑', 'Borrar columna');
      delBtn.addEventListener('click', function () { deleteColumn(col.id); });

      head.appendChild(titleSpan);
      head.appendChild(countSpan);
      head.appendChild(grow);
      head.appendChild(renameBtn);
      head.appendChild(delBtn);
      colEl.appendChild(head);

      var cardsEl = document.createElement('div');
      cardsEl.className = 'cards';

      if (visible.length === 0) {
        var e = document.createElement('div');
        e.className = 'empty';
        e.textContent = filtering ? 'Sin coincidencias' : 'Suelta tarjetas aquí';
        cardsEl.appendChild(e);
      }

      visible.forEach(function (card) {
        cardsEl.appendChild(renderCard(card));
      });

      addDropHandlers(cardsEl, col.id);

      var addBtn = document.createElement('button');
      addBtn.className = 'add-card';
      addBtn.textContent = '+ Tarjeta';
      addBtn.addEventListener('click', function () { addCardTo(col.id); });
      colEl.appendChild(cardsEl);
      colEl.appendChild(addBtn);
      boardEl.appendChild(colEl);
    });
    renderStatus();
  }

  function iconButton(label, title) {
    var b = document.createElement('button');
    b.className = 'icon-btn';
    b.textContent = label;
    b.title = title;
    return b;
  }

  function renderCard(card) {
    var el = document.createElement('div');
    el.className = 'card';
    el.draggable = true;
    el.dataset.card = card.id;

    var title = document.createElement('h3');
    if (card.title) {
      title.textContent = card.title;
    } else {
      title.textContent = '(sin título)';
      title.style.color = 'var(--muted)';
    }
    el.appendChild(title);

    if (card.desc) {
      var desc = document.createElement('p');
      desc.textContent = card.desc;
      el.appendChild(desc);
    }

    var meta = document.createElement('div');
    meta.className = 'meta';
    if (card.tag) {
      var tagDot = document.createElement('span');
      tagDot.className = 'tag';
      tagDot.style.background = 'var(--' + card.tag + ')';
      meta.appendChild(tagDot);
    }
    if (card.due) {
      var due = document.createElement('span');
      due.className = 'due';
      due.textContent = '📅 ' + fmtDue(card.due);
      meta.appendChild(due);
    }
    if (card.tag || card.due) el.appendChild(meta);

    el.addEventListener('click', function () { openEditor(card); });
    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', card.id);
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function () { el.classList.remove('dragging'); });
    return el;
  }

  function addDropHandlers(container, colId) {
    container.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    container.addEventListener('dragleave', function () { container.classList.remove('dragover'); });
    container.addEventListener('dragenter', function (e) { e.preventDefault(); container.classList.add('dragover'); });
    container.addEventListener('drop', function (e) {
      e.preventDefault();
      container.classList.remove('dragover');
      var cardId = e.dataTransfer.getData('text/plain');
      if (!cardId) return;
      var sourceCol = findCardColumn(cardId);
      if (!sourceCol) return;
      var toCol = state.board.columns.find(function (c) { return c.id === colId; });
      if (!toCol) return;
      snapshot();
      var dropIndex = computeDropIndex(container, e.clientY);
      M.moveCard(state.board, sourceCol.id, cardId, colId, dropIndex);
      M.recordEvent(events, cardId, sourceCol.title, toCol.title);
      persist(); render();
    });
  }

  function computeDropIndex(container, mouseY) {
    var children = [].slice.call(container.querySelectorAll('.card'));
    var idx = children.length;
    children.forEach(function (child, i) {
      var r = child.getBoundingClientRect();
      if (mouseY > r.top + r.height / 2) idx = i + 1;
    });
    return idx;
  }

  function findCardColumn(cardId) {
    return state.board.columns.find(function (c) {
      return c.cards.some(function (x) { return x.id === cardId; });
    });
  }

  // ---- Acciones ----
  function addCardTo(colId) {
    snapshot();
    var card = M.addCard(state.board, colId, M.blankCard());
    persist(); render();
    openEditor(card, true);
  }
  function renameColumn(colId) {
    var col = state.board.columns.find(function (c) { return c.id === colId; });
    var name = prompt('Nombre de la columna:', col ? col.title : '');
    if (name && name.trim()) {
      snapshot();
      M.renameColumn(state.board, colId, name.trim());
      persist(); render();
    }
  }
  function deleteColumn(colId) {
    if (!confirm('¿Borrar esta columna y sus tarjetas?')) return;
    snapshot();
    M.deleteColumn(state.board, colId);
    persist(); render();
  }

  // ---- Editor modal ----
  var editing = null;
  var freshCard = false;
  var editingTag = '';
  function openEditor(card, isNew) {
    editing = card;
    freshCard = !!isNew;
    editingTag = card.tag;                         // B3: copia local; no muta hasta guardar
    $('editorTitle').textContent = freshCard ? 'Nueva tarjeta' : 'Editar tarjeta';
    $('edTitle').value = card.title;
    $('edDesc').value = card.desc;
    $('edDue').value = card.due || '';
    buildTagSelect(editingTag);
    $('delBtn').style.visibility = 'visible';      // B2: siempre visible
    $('overlay').classList.add('open');
    $('edTitle').focus();
  }
  function closeEditor() { if ($('overlay')) $('overlay').classList.remove('open'); editing = null; }

  function buildTagSelect(selected) {
    var box = $('tagSelect');
    box.innerHTML = '';
    TAGS.forEach(function (t) {
      var b = document.createElement('div');
      b.className = 'tag-opt' + (t === '' ? ' none' : '') + (selected === t ? ' selected' : '');
      if (t) b.style.background = 'var(--' + t + ')';
      b.title = t ? TAG_LABEL[t] : 'Sin etiqueta';
      b.addEventListener('click', function () {
        editingTag = t; buildTagSelect(t);
      });
      box.appendChild(b);
    });
  }

  $('saveBtn').addEventListener('click', function () {
    if (!editing) return;
    var before = M.serialize(state.board);
    editing.title = $('edTitle').value.trim();
    editing.desc = $('edDesc').value.trim();
    editing.due = $('edDue').value;
    editing.tag = editingTag;                      // B3: aplica solo al guardar
    var col = findCardColumn(editing.id);
    if (col) M.updateCard(state.board, col.id, editing.id, editing);
    snapshotIfChanged(before);                     // B5: sin cambios = sin undo
    persist(); render(); closeEditor();
  });
  $('cancelBtn').addEventListener('click', closeEditor);
  $('delBtn').addEventListener('click', function () {
    if (!editing || !confirm('¿Borrar esta tarjeta?')) return;
    snapshot();
    var col = findCardColumn(editing.id);
    if (col) { M.deleteCard(state.board, col.id, editing.id); }
    persist(); render(); closeEditor();
  });

  // ---- Header actions ----
  $('addColBtn').addEventListener('click', function () {
    if (state.board.columns.length >= M.LIMITS.maxColumns) { alert('Límite de columnas alcanzado'); return; }
    var name = prompt('Nombre de la columna:', 'Nueva columna');
    if (name === null) return;                     // cancelar: no crear nada
    snapshot();
    var col = M.addColumn(state.board, name.trim() || 'Nueva columna');
    persist(); render();
  });
  $('themeBtn').addEventListener('click', function () {
    var light = document.body.classList.toggle('light');
    $('themeBtn').textContent = light ? '☀️' : '🌙';
  });
  $('exportBtn').addEventListener('click', function () {
    var meta = BS.loadIndex().find(function (x) { return x.id === state.boardId; }) || {};
    var safe = (meta.name || 'kanban').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kanban';
    var fileContent = M.serialize(state.board);
    var defaultName = safe + '-' + new Date().toISOString().slice(0,10) + '.json';
    if (window.tempoApp) {
      window.tempoApp.saveFile({ defaultName: defaultName, content: fileContent });
      return;
    }
    var blob = new Blob([fileContent], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click(); URL.revokeObjectURL(a.href);
  });
  function importAsNewBoard(content) {
    var board = M.deserialize(content);           // valida schema/límites XSS-safe
    var name = 'Importado ' + new Date().toISOString().slice(0,10);
    var id = BS.createBoard(BS.loadIndex(), name);
    BS.saveBoard(id, board);
    BS.saveEvents(id, []);
    switchBoard(id);
  }
  $('importBtn').addEventListener('click', function () {
    if (window.tempoApp) {
      window.tempoApp.openFile().then(function (res) {
        if (!res) return;
        try { importAsNewBoard(res.content); persist(); render(); }
        catch (err) { alert('Archivo inválido: ' + err.message); }
      });
      return;
    }
    $('fileInput').click();
  });
  $('fileInput').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { importAsNewBoard(r.result); persist(); render(); }
      catch (err) { alert('Archivo inválido: ' + err.message); }
    };
    r.readAsText(f);
    e.target.value = '';
  });

  // ---- Imprimir / PDF ----
  $('printBtn').addEventListener('click', function () {
    var meta = BS.loadIndex().find(function (x) { return x.id === state.boardId; }) || {};
    $('printTitle').textContent = (meta.name || 'Tempo');
    $('printDate').textContent = new Date().toLocaleDateString('es');
    $('printStats').textContent = String(M.totalCompletions(events)) + ' completadas';
    window.print();
  });

  // ---- Online/offline ----
  function renderStatus() {
    var on = navigator.onLine;
    $('statusDot').className = 'dot' + (on ? '' : ' offline');
    $('statusText').textContent = on ? 'online — datos guardados localmente' : 'offline — edita normal, guarda en el navegador';
  }
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);

  function fmtDue(d) {
    if (typeof d !== 'string') return '';
    var p = d.split('-');
    if (p.length !== 3) return d;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  // ---- Estadísticas ----
  function renderStats() {
    var perDay = M.completionsPerDay(events, 14);
    var max = perDay.reduce(function (a, d) { return Math.max(a, d.count); }, 1);
    var chart = $('statsChart');
    chart.innerHTML = '';
    perDay.forEach(function (d) {
      var wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = 'center';
      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = (d.count === 0 ? 2 : Math.round(d.count / max * 70) + 2) + 'px';
      var n = document.createElement('span');
      n.textContent = String(d.count);
      bar.appendChild(n);
      var day = document.createElement('div');
      day.className = 'bar-day';
      var dt = new Date(d.key + 'T12:00:00');
      day.textContent = isNaN(dt.getTime()) ? '' : String(dt.getDate());
      wrap.appendChild(bar);
      wrap.appendChild(day);
      chart.appendChild(wrap);
    });
    $('statsTotal').textContent = String(M.totalCompletions(events));
  }
  $('statsBtn').addEventListener('click', function () {
    var isOpen = $('statsPanel').classList.toggle('open');
    if (isOpen) renderStats();
  });

  renderStats();
})();