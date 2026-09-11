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

  // ---- Modal genérico (sin prompt/confirm/alert nativos: Browser Guard los marca) ----
  // openModal({ title, text, input, okLabel, onOk, onCancel })
  var modalOnCancel = null;
  function openModal(o) {
    $('modalTitle').textContent = o.title || (o.input ? 'Nuevo' : 'Aviso');
    $('modalText').textContent = o.text || '';
    var wrap = $('modalInputWrap');
    wrap.hidden = !o.input;
    if (o.input) { $('modalInput').value = o.input; $('modalInput').focus(); }
    $('modalOk').textContent = o.okLabel || 'Aceptar';
    $('modalOk').disabled = false;
    modalOnCancel = o.onCancel || null;
    $('modalOverlay').classList.add('open');
    $('modalOk').onclick = function () {
      $('modalOverlay').classList.remove('open');
      var cb = o.onOk; o.onOk = null;
      if (cb) cb();
    };
    $('modalCancel').onclick = function () { closeModal(); };
  }
  function closeModal() {
    $('modalOverlay').classList.remove('open');
    var c = modalOnCancel; modalOnCancel = null;
    if (c) c();
  }
  // Enter = Ok en el campo de texto; Escape = cerrar
  $('modalInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('modalOk').click();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('modalOverlay').classList.contains('open')) closeModal();
  });

  function load() {
    BS.migrate();
    var hadIndex = BS.loadIndex() !== null;
    var idx = hadIndex ? BS.loadIndex() : [];
    state.boardId = BS.ensureDefault(idx);       // crea (y persiste) "Tablero 1" si no hay nada
    var b = BS.loadBoard(state.boardId);
    var reseeded = false;
    if (b) {
      try { state.board = M.deserialize(b); } catch (e) { state.board = M.newBoard(); }
      if (LEGACY_DEMO.has(state.board)) {         // tablero de ejemplo de v1.x: se re-siembra
        state.board = M.newBoard();
        reseeded = true;
      }
    } else {
      state.board = M.newBoard();               // index existe pero sin datos: arranque limpio
    }
    events = BS.loadEvents(state.boardId) || [];
    if (window.tempoApp && window.tempoApp.saveBackup) {
      // F1.4: backup del tablero actual a disco %APPDATA%\Tempo\backups (al arrancar)
      window.tempoApp.saveBackup(M.serialize(state.board) + '\n' + JSON.stringify(events));
    }
    return { fresh: !hadIndex || reseeded };
  }

  var fresh = load().fresh;
  if (fresh) seedDemo();

  // Tablero inicial neutral: un mini-tutorial de cómo usar Tempo.
  function seedDemo() {
    var b = state.board;
    var c0 = b.columns[0], c1 = b.columns[1], c2 = b.columns[2];
    M.addCard(b, c0.id, { title:'Agrega una tarjeta', desc:'Usa el botón + de la columna (o la tecla N). Se guarda solo, sin registro.', tag:'tag4', due:'' });
    M.addCard(b, c0.id, { title:'Arrástrala de columna', desc:'Mové las tarjetas con el mouse para cambiar su estado.', tag:'tag6', due:'' });
    M.addCard(b, c1.id, { title:'Etiquetas y fecha límite', desc:'Color por etiqueta (ícono 🏷) y fecha de vencimiento. Las vencidas se ponen en rojo.', tag:'tag3', due:'' });
    M.addCard(b, c1.id, { title:'Buscar y filtrar', desc:'La caja de búsqueda filtra al instante; los chips de abajo filtran por etiqueta.', tag:'tag8', due:'' });
    M.addCard(b, c2.id, { title:'Exportar, imprimir o HTML', desc:'⬇ Exportar/Importar copias en JSON, imprime a PDF, o guarda una vista HTML con ⬇ HTML.', tag:'tag5', due:'' });
  }

  // Demo viejo sembrado en versiones anteriores (tareas de desarrollo): se descarta
  // para no ensuciar el tablero de quien ya lo tenía. Ponytail: match exacto por títulos.
  var LEGACY_DEMO = {
    has: function (b) {
      var titles = [];
      b.columns.forEach(function (c) { c.cards.forEach(function (card) { titles.push(card.title); }); });
      return titles.length === 4 && titles.indexOf('Definir el MVP') !== -1 &&
        titles.indexOf('Elegir plantillas') !== -1 && titles.indexOf('Estructura de datos') !== -1 &&
        titles.indexOf('Vista previa en vivo') !== -1;
    }
  };

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
    openModal({ title: 'Nuevo tablero', input: 'Tablero', onOk: function () {
      var name = $('modalInput').value.trim() || 'Tablero';
      var id = BS.createBoard(BS.loadIndex(), name);
      BS.saveBoard(id, M.serialize(M.newBoard()));
      BS.saveEvents(id, []);
      switchBoard(id);
    } });
  });
  $('renameBoardBtn').addEventListener('click', function () {
    var meta = BS.loadIndex().find(function (x) { return x.id === state.boardId; });
    openModal({ title: 'Renombrar tablero', input: meta ? meta.name : '', onOk: function () {
      var name = $('modalInput').value.trim();
      if (!name) return;
      BS.renameBoard(BS.loadIndex(), state.boardId, name);
      buildBoardSelect(); render();
    } });
  });
  $('deleteBoardBtn').addEventListener('click', function () {
    var idx = BS.loadIndex();
    if (idx.length <= 1) { openModal({ title: 'Aviso', text: 'No se puede borrar el único tablero' }); return; }
    openModal({ title: 'Borrar tablero', text: '¿Borrar este tablero?', okLabel: 'Borrar', onOk: function () {
      var rest = idx.filter(function (x) { return x.id !== state.boardId; });
      BS.deleteBoard(BS.loadIndex(), state.boardId);
      switchBoard(rest[0].id);
    } });
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
    if (mod && e.key.toLowerCase() === 'd' && editing) {
      e.preventDefault();
      $('dupBtn').click();
      return;
    }
    if (inField) return;
    if (e.key.toLowerCase() === 'n' && state.board.columns.length > 0) {
      addCardTo(state.board.columns[0].id);
    }
    if (e.key.toLowerCase() === 't') toggleTheme();
  });

  function toggleTheme() {
    var light = document.body.classList.toggle('light');
    $('themeBtn').textContent = light ? '☀️' : '🌙';
  }

  function toggleTheme() {
    var light = document.body.classList.toggle('light');
    $('themeBtn').textContent = light ? '☀️' : '🌙';
  }

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

      var mvLeft = iconButton('◀', 'Mover columna a la izquierda');
      mvLeft.addEventListener('click', function () { moveCol(col.id, -1); });
      var mvRight = iconButton('▶', 'Mover columna a la derecha');
      mvRight.addEventListener('click', function () { moveCol(col.id, 1); });
      var renameBtn = iconButton('✎', 'Renombrar');
      renameBtn.addEventListener('click', function () { renameColumn(col.id); });
      var delBtn = iconButton('🗑', 'Borrar columna');
      delBtn.addEventListener('click', function () { deleteColumn(col.id); });

      head.appendChild(titleSpan);
      head.appendChild(countSpan);
      head.appendChild(grow);
      head.appendChild(mvLeft);
      head.appendChild(mvRight);
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
        cardsEl.appendChild(renderCard(card, col));
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

  function renderCard(card, col) {
    var el = document.createElement('div');
    el.className = 'card';
    el.draggable = true;
    el.dataset.card = card.id;
    var overdue = isOverdue(card, col);
    if (overdue) el.classList.add('overdue');

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
      due.className = 'due' + (overdue ? ' overdue' : '');
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
    openModal({ title: 'Renombrar columna', input: col ? col.title : '', onOk: function () {
      var name = $('modalInput').value.trim();
      if (name) {
        snapshot();
        M.renameColumn(state.board, colId, name);
        persist(); render();
      }
    } });
  }
  function deleteColumn(colId) {
    openModal({ title: 'Borrar columna', text: '¿Borrar esta columna y sus tarjetas?', okLabel: 'Borrar', onOk: function () {
      snapshot();
      M.deleteColumn(state.board, colId);
      persist(); render();
    } });
  }
  function moveCol(colId, delta) {
    var from = state.board.columns.findIndex(function (c) { return c.id === colId; });
    if (from === -1) return;
    var to = from + delta;
    if (to < 0 || to >= state.board.columns.length) return;
    snapshot();
    M.moveColumn(state.board, colId, to);
    persist(); render();
  }

  // ---- Editor modal ----
  var editing = null;
  var freshCard = false;
  var editingTag = '';
  var editingColId = null;
  function openEditor(card, isNew) {
    editing = card;
    freshCard = !!isNew;
    editingTag = card.tag;                         // B3: copia local; no muta hasta guardar
    var col = findCardColumn(card.id);
    editingColId = col ? col.id : null;
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
  $('dupBtn').addEventListener('click', function () {
    if (!editing) return;
    snapshot();
    var copy = M.addCard(state.board, editingColId, {
      title: $('edTitle').value.trim(),
      desc: $('edDesc').value.trim(),
      tag: editingTag,
      due: $('edDue').value
    });
    persist(); render();
    openEditor(copy, true);
  });
  $('delBtn').addEventListener('click', function () {
    if (!editing) return;
    var id = editing.id;
    openModal({ title: 'Borrar tarjeta', text: '¿Borrar esta tarjeta?', okLabel: 'Borrar', onOk: function () {
      snapshot();
      var col = findCardColumn(id);
      if (col) { M.deleteCard(state.board, col.id, id); }
      persist(); render(); closeEditor();
    } });
  });

  // ---- Header actions ----
  $('addColBtn').addEventListener('click', function () {
    if (state.board.columns.length >= M.LIMITS.maxColumns) { openModal({ title: 'Aviso', text: 'Límite de columnas alcanzado' }); return; }
    openModal({ title: 'Nueva columna', input: 'Nueva columna', onOk: function () {
      var name = $('modalInput').value.trim();
      snapshot();
      var col = M.addColumn(state.board, name || 'Nueva columna');
      persist(); render();
    } });
  });
  $('themeBtn').addEventListener('click', toggleTheme);
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
  $('exportHtmlBtn').addEventListener('click', function () {
    var meta = BS.loadIndex().find(function (x) { return x.id === state.boardId; }) || {};
    var safe = (meta.name || 'kanban').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kanban';
    var fileContent = M.boardToHTML(state.board, meta);
    var defaultName = safe + '-' + new Date().toISOString().slice(0,10) + '.html';
    if (window.tempoApp) {
      window.tempoApp.saveFile({ defaultName: defaultName, content: fileContent });
      return;
    }
    var blob = new Blob([fileContent], { type: 'text/html' });
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
        catch (err) { openModal({ title: 'Archivo inválido', text: err.message }); }
      });
      return;
    }
    $('fileInput').click();
  });
  if (window.tempoApp && window.tempoApp.onOpenFile) {
    // F2.7: archivo .tempo.json abierto por doble clic → se importa como tablero nuevo
    window.tempoApp.onOpenFile(function (res) {
      if (!res || typeof res.content !== 'string') return;
      try { importAsNewBoard(res.content); persist(); render(); }
      catch (err) { openModal({ title: 'Archivo inválido', text: err.message }); }
    });
  }
  $('fileInput').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { importAsNewBoard(r.result); persist(); render(); }
      catch (err) { openModal({ title: 'Archivo inválido', text: err.message }); }
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
// cuándo una tarjeta está vencida: tiene fecha límite pasada y NO está en una
  // columna de "hecho/listo" — en columna terminada una fecha vieja no es un problema
  function isOverdue(card, col) {
    if (!card.due || !col) return false;
    if (M.isDoneColumn(col.title)) return false;
    var today = new Date();
    var t = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    return card.due < t;
  }

  function renderStatus() {
    var on = navigator.onLine;
    $('statusDot').className = 'dot' + (on ? '' : ' offline');
    $('statusText').textContent = on ? 'online - datos guardados localmente' : 'offline - edita normal, guarda en el navegador';
    var overdue = 0;
    state.board.columns.forEach(function (col) {
      col.cards.forEach(function (card) { if (isOverdue(card, col)) overdue++; });
    });
    var badge = $('overdueBadge');
    badge.textContent = '⚠ ' + overdue + ' vencida' + (overdue === 1 ? '' : 's');
    badge.className = 'overdue-badge' + (overdue > 0 ? ' open' : '');
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