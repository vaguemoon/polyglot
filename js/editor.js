// Polyglot vocabulary editor — CRUD for levels / lessons / words
let lang = 'ko';
let curLevelId = null, curLevelName = '';
let curLessonId = null, curLessonName = '';
let editingId = null;
let wordsCache = [];

// Image modal state
let imgModalTr      = null;
let imgPendingDataUrl = null;  // null = no change, '' = delete, 'data:...' = new image
let imgPendingChange  = false;

const langNames      = { ko: '韓語', vi: '越南語' };
const wordLangLabels = { ko: '韓文詞彙', vi: '越南文詞彙' };
const phonLabels     = { ko: '羅馬拼音 (RR)', vi: '聲調 / 拼音（可省略）' };

// ── Utilities ────────────────────────────────────────────────────────────────

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function toast(msg, err = false) {
  const el = document.getElementById('toast');
  el.textContent  = msg;
  el.style.background = err ? 'var(--red)' : '#1a1b2e';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
  const inp = document.querySelector(`#${id} .form-input`);
  if (inp) setTimeout(() => inp.focus(), 150);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  editingId = null;
}

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) el.classList.remove('open');
  });
});

// Keyboard shortcuts for modals
document.addEventListener('keydown', e => {
  const open = document.querySelector('.modal-overlay.open');
  if (!open) return;
  if (e.key === 'Escape') { open.classList.remove('open'); editingId = null; return; }
  if (e.key !== 'Enter' || open.id === 'confirm-modal') return;
  if (open.id === 'level-modal')   saveLevel();
  else if (open.id === 'lesson-modal') saveLesson();
  else if (open.id === 'batch-modal')  importBatchPaste();
});

// ── Language selection ───────────────────────────────────────────────────────

function selectLang(l) {
  lang = l;
  document.body.className = l === 'ko' ? 'lang-ko' : 'lang-vi';
  showLevels();
}

// ── Levels ───────────────────────────────────────────────────────────────────

async function showLevels() {
  showPage('pg-levels');
  document.getElementById('levels-title').textContent = `${langNames[lang]} — 級別`;
  const list  = document.getElementById('levels-list');
  const empty = document.getElementById('levels-empty');
  list.innerHTML = '<div class="loading-msg">載入中…</div>';

  try {
    const levels = await DB.getLevels(lang);
    list.innerHTML = '';
    if (!levels.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    levels.forEach(level => {
      const div = makeItem({
        icon:     String(level.order),
        title:    level.name,
        onClick:  () => showLessons(level.id, level.name),
        onEdit:   () => openLevelModal(level.id, level.name),
        onDelete: () => confirmDelete('level', level.id, level.name),
      });
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = `<div class="error-msg">載入失敗：${e.message}</div>`;
  }
}

function openLevelModal(id = null, name = '') {
  editingId = id;
  document.getElementById('level-modal-title').textContent = id ? '編輯級別' : '新增級別';
  document.getElementById('level-name').value = name;
  openModal('level-modal');
}

async function saveLevel() {
  const name = document.getElementById('level-name').value.trim();
  if (!name) { toast('請輸入級別名稱', true); return; }
  try {
    if (editingId) {
      await DB.updateLevel(lang, editingId, { name });
      toast('已更新');
    } else {
      await DB.addLevel(lang, name);
      toast('已新增');
    }
    closeModal('level-modal');
    showLevels();
  } catch (e) {
    toast('儲存失敗：' + e.message, true);
  }
}

// ── Lessons ──────────────────────────────────────────────────────────────────

async function showLessons(levelId, levelName) {
  if (levelId) { curLevelId = levelId; curLevelName = levelName; }
  showPage('pg-lessons');
  document.getElementById('lessons-title').textContent = curLevelName;
  const list  = document.getElementById('lessons-list');
  const empty = document.getElementById('lessons-empty');
  list.innerHTML = '<div class="loading-msg">載入中…</div>';

  try {
    const lessons = await DB.getLessons(lang, curLevelId);
    list.innerHTML = '';
    if (!lessons.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    for (const lesson of lessons) {
      const words = await DB.getWords(lang, curLevelId, lesson.id);
      const div = makeItem({
        icon:    '📖',
        title:   lesson.name,
        sub:     `${words.length} 個詞彙`,
        onClick: () => showWords(lesson.id, lesson.name),
        onEdit:  () => openLessonModal(lesson.id, lesson.name),
        onDelete:() => confirmDelete('lesson', lesson.id, lesson.name),
      });
      list.appendChild(div);
    }
  } catch (e) {
    list.innerHTML = `<div class="error-msg">載入失敗：${e.message}</div>`;
  }
}

function openLessonModal(id = null, name = '') {
  editingId = id;
  document.getElementById('lesson-modal-title').textContent = id ? '編輯課程' : '新增課程';
  document.getElementById('lesson-name').value = name;
  openModal('lesson-modal');
}

async function saveLesson() {
  const name = document.getElementById('lesson-name').value.trim();
  if (!name) { toast('請輸入課程名稱', true); return; }
  try {
    if (editingId) {
      await DB.updateLesson(lang, curLevelId, editingId, { name });
      toast('已更新');
    } else {
      await DB.addLesson(lang, curLevelId, name);
      toast('已新增');
    }
    closeModal('lesson-modal');
    showLessons();
  } catch (e) {
    toast('儲存失敗：' + e.message, true);
  }
}

// ── Words (spreadsheet) ──────────────────────────────────────────────────────

async function showWords(lessonId, lessonName) {
  if (lessonId) { curLessonId = lessonId; curLessonName = lessonName; }
  showPage('pg-words');
  document.getElementById('words-title').textContent = curLessonName;
  document.getElementById('th-word').textContent = wordLangLabels[lang] || '詞彙';

  const tbody = document.getElementById('words-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading-msg">載入中…</td></tr>';

  try {
    wordsCache = await DB.getWords(lang, curLevelId, curLessonId);
    renderWordsTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-msg">載入失敗：${e.message}</td></tr>`;
  }
}

function renderWordsTable() {
  const tbody = document.getElementById('words-tbody');
  tbody.innerHTML = '';
  wordsCache.forEach(w => tbody.appendChild(makeWordRow(w)));
  document.getElementById('words-empty').style.display = wordsCache.length ? 'none' : '';
  const ca = document.getElementById('check-all');
  if (ca) { ca.checked = false; ca.indeterminate = false; }
  updateWordsCount();
  updateDeleteBtn();
}

function makeWordRow(data = {}) {
  const tr = document.createElement('tr');
  if (data.id) tr.dataset.id = data.id;

  const phLabel = { ko: '羅馬拼音 (RR)', vi: '聲調拼音' };
  const fields = [
    { key: 'word',     ph: wordLangLabels[lang] || '詞彙' },
    { key: 'zh',       ph: '中文翻譯' },
    { key: 'phonetic', ph: phLabel[lang] || '拼音' },
    { key: 'notes',    ph: '備註 / 例句' },
  ];

  const tdCk = document.createElement('td');
  tdCk.style.cssText = 'text-align:center;width:36px';
  const ck = document.createElement('input');
  ck.type = 'checkbox';
  ck.className = 'row-check';
  ck.addEventListener('change', updateDeleteBtn);
  tdCk.appendChild(ck);
  tr.appendChild(tdCk);

  fields.forEach(({ key, ph }) => {
    const td = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'cell-input';
    inp.dataset.field = key;
    inp.value = data[key] || '';
    inp.placeholder = ph;

    inp.addEventListener('blur', () => autoSaveRow(tr));

    if (key === 'notes') {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Tab' && !e.shiftKey) {
          const tbody = document.getElementById('words-tbody');
          if (tr === tbody.lastElementChild) { e.preventDefault(); addWordRow(); }
        }
      });
    }

    td.appendChild(inp);
    tr.appendChild(td);
  });

  // Image cell
  const tdImg = document.createElement('td');
  tdImg.className = 'col-img';
  const thumb = document.createElement('div');
  thumb.className = 'img-thumb';
  thumb.addEventListener('click', e => { e.stopPropagation(); openImageModal(tr); });
  if (data.imageUrl) {
    tr.dataset.imageUrl = data.imageUrl;
    const img = document.createElement('img');
    img.src = data.imageUrl;
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '<span class="img-thumb-empty">📷</span>';
  }
  tdImg.appendChild(thumb);
  tr.appendChild(tdImg);

  return tr;
}

function getRowData(tr) {
  const d = {};
  tr.querySelectorAll('.cell-input').forEach(inp => { d[inp.dataset.field] = inp.value.trim(); });
  return d;
}

async function autoSaveRow(tr) {
  const d = getRowData(tr);
  if (!d.word || !d.zh) return;

  const payload = { word: d.word, zh: d.zh, phonetic: d.phonetic, notes: d.notes };

  try {
    if (tr.dataset.id) {
      await DB.updateWord(lang, curLevelId, curLessonId, tr.dataset.id, payload);
    } else {
      const id = await DB.addWord(lang, curLevelId, curLessonId, payload);
      tr.dataset.id = id;
      wordsCache.push({ id, ...payload });
      document.getElementById('words-empty').style.display = 'none';
      updateWordsCount();
    }
    tr.classList.remove('row-saved');
    void tr.offsetWidth;
    tr.classList.add('row-saved');
  } catch (e) {
    toast('儲存失敗：' + e.message, true);
  }
}

function addWordRow() {
  document.getElementById('words-tbody').appendChild(makeWordRow());
  document.getElementById('words-empty').style.display = 'none';
  document.querySelector('#words-tbody tr:last-child .cell-input')?.focus();
}

function updateWordsCount() {
  const n = document.querySelectorAll('#words-tbody tr[data-id]').length;
  const el = document.getElementById('words-count');
  if (el) el.textContent = `${n} 個詞彙`;
}

function updateDeleteBtn() {
  const all     = document.querySelectorAll('#words-tbody .row-check');
  const checked = document.querySelectorAll('#words-tbody .row-check:checked');
  const btn = document.getElementById('delete-selected-btn');
  if (btn) {
    btn.style.display = checked.length ? '' : 'none';
    btn.textContent = `🗑 刪除選中 (${checked.length})`;
  }
  const ca = document.getElementById('check-all');
  if (ca && all.length) {
    ca.checked       = checked.length === all.length;
    ca.indeterminate = checked.length > 0 && checked.length < all.length;
  }
}

function toggleCheckAll(cb) {
  document.querySelectorAll('#words-tbody .row-check').forEach(ck => { ck.checked = cb.checked; });
  updateDeleteBtn();
}

async function deleteSelected() {
  const rows = Array.from(document.querySelectorAll('#words-tbody .row-check:checked'))
    .map(cb => cb.closest('tr'));
  if (!rows.length) return;

  document.getElementById('confirm-msg').textContent =
    `確定要刪除選中的 ${rows.length} 筆詞彙嗎？此動作無法復原。`;

  document.getElementById('confirm-ok').onclick = async () => {
    try {
      for (const tr of rows) {
        if (tr.dataset.id) {
          await DB.deleteWord(lang, curLevelId, curLessonId, tr.dataset.id);
          wordsCache = wordsCache.filter(w => w.id !== tr.dataset.id);
        }
        tr.remove();
      }
      closeModal('confirm-modal');
      toast(`已刪除 ${rows.length} 筆`);
      updateWordsCount();
      updateDeleteBtn();
      const ca = document.getElementById('check-all');
      if (ca) { ca.checked = false; ca.indeterminate = false; }
      if (!document.querySelectorAll('#words-tbody tr[data-id]').length) {
        document.getElementById('words-empty').style.display = '';
      }
    } catch (e) {
      toast('刪除失敗：' + e.message, true);
    }
  };
  openModal('confirm-modal');
}

// ── Image modal ───────────────────────────────────────────────────────────────

function openImageModal(tr) {
  imgModalTr       = tr;
  imgPendingDataUrl = null;
  imgPendingChange  = false;

  const currentUrl = tr.dataset.imageUrl || '';
  const preview    = document.getElementById('img-preview');
  const hintWrap   = document.getElementById('img-drop-hint-wrap');
  const deleteBtn  = document.getElementById('img-delete-btn');

  if (currentUrl) {
    preview.src            = currentUrl;
    preview.style.display  = '';
    hintWrap.style.display = 'none';
    deleteBtn.style.display = '';
  } else {
    preview.style.display  = 'none';
    hintWrap.style.display = '';
    deleteBtn.style.display = 'none';
  }

  const word = tr.querySelector('.cell-input[data-field="word"]')?.value.trim() || '詞彙';
  document.getElementById('img-modal-title').textContent = `設定圖片 — ${word}`;
  openModal('img-modal');
}

function openGoogleImages() {
  const word = imgModalTr?.querySelector('.cell-input[data-field="word"]')?.value.trim();
  if (!word) { toast('請先填入詞彙', true); return; }
  window.open('https://www.google.com/search?q=' + encodeURIComponent(word) + '&tbm=isch', '_blank');
}

function deleteImage() {
  imgPendingDataUrl = '';
  imgPendingChange  = true;
  document.getElementById('img-preview').style.display  = 'none';
  document.getElementById('img-drop-hint-wrap').style.display = '';
  document.getElementById('img-delete-btn').style.display     = 'none';
}

async function saveImage() {
  if (!imgModalTr) return;
  if (!imgPendingChange) { closeModal('img-modal'); return; }

  if (!imgModalTr.dataset.id) {
    toast('請先填入詞彙和中文翻譯儲存後再設定圖片', true);
    return;
  }

  const dataUrl = imgPendingDataUrl;
  try {
    await DB.updateWord(lang, curLevelId, curLessonId, imgModalTr.dataset.id, { imageUrl: dataUrl });
    imgModalTr.dataset.imageUrl = dataUrl;
    updateRowThumbnail(imgModalTr, dataUrl);
    closeModal('img-modal');
    toast(dataUrl ? '圖片已儲存' : '圖片已移除');
  } catch (e) {
    toast('儲存失敗：' + e.message, true);
  }
}

function updateRowThumbnail(tr, dataUrl) {
  const thumb = tr.querySelector('.img-thumb');
  if (!thumb) return;
  if (dataUrl) {
    thumb.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '<span class="img-thumb-empty">📷</span>';
  }
}

function compressImage(file, maxPx, quality, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    const src = new Image();
    src.onload = () => {
      let w = src.width, h = src.height;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(src, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    src.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function processImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  compressImage(file, 400, 0.82, dataUrl => {
    const sizeKB = Math.round(dataUrl.length / 1024);
    if (sizeKB > 900) { toast(`圖片壓縮後仍過大（${sizeKB}KB），請換一張較小的圖`, true); return; }
    imgPendingDataUrl = dataUrl;
    imgPendingChange  = true;

    const preview  = document.getElementById('img-preview');
    preview.src            = dataUrl;
    preview.style.display  = '';
    document.getElementById('img-drop-hint-wrap').style.display = 'none';
    document.getElementById('img-delete-btn').style.display     = '';
  });
}

// Drop zone events
(function () {
  const zone = document.getElementById('img-drop-zone');
  zone.addEventListener('click',     () => document.getElementById('img-file-input').click());
  zone.addEventListener('dragover',  e  => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    processImageFile(e.dataTransfer.files[0]);
  });

  document.getElementById('img-file-input').addEventListener('change', e => {
    processImageFile(e.target.files[0]);
    e.target.value = '';
  });

  // Paste anywhere while modal is open
  document.addEventListener('paste', e => {
    if (!document.querySelector('#img-modal.open')) return;
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) processImageFile(item.getAsFile());
  });
})();

// ── Batch paste ───────────────────────────────────────────────────────────────

function openBatchPaste() {
  document.getElementById('batch-textarea').value = '';
  openModal('batch-modal');
  setTimeout(() => document.getElementById('batch-textarea').focus(), 150);
}

async function importBatchPaste() {
  const lines = document.getElementById('batch-textarea').value
    .split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) { toast('沒有內容可匯入', true); return; }

  const tbody = document.getElementById('words-tbody');
  let added = 0;

  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) continue;
    const payload = {
      word: parts[0], zh: parts[1],
      phonetic: parts[2] || '', notes: parts[3] || '',
    };
    try {
      const id = await DB.addWord(lang, curLevelId, curLessonId, payload);
      wordsCache.push({ id, ...payload });
      tbody.appendChild(makeWordRow({ id, ...payload }));
      added++;
    } catch { /* 略過失敗的行 */ }
  }

  closeModal('batch-modal');
  if (added) {
    toast(`已匯入 ${added} 筆詞彙`);
    document.getElementById('words-empty').style.display = 'none';
    updateWordsCount();
    updateDeleteBtn();
  } else {
    toast('沒有符合格式的詞彙（格式：詞彙 | 中文）', true);
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

function confirmDelete(type, id, name) {
  const msgs = {
    level:  `確定要刪除級別「${name}」嗎？\n將同時刪除所有課程和詞彙，無法復原。`,
    lesson: `確定要刪除課程「${name}」嗎？\n將同時刪除所有詞彙，無法復原。`,
    word:   `確定要刪除詞彙「${name}」嗎？`,
  };
  document.getElementById('confirm-msg').textContent = msgs[type] || '確定要刪除嗎？';

  document.getElementById('confirm-ok').onclick = async () => {
    try {
      if      (type === 'level')  await DB.deleteLevel(lang, id);
      else if (type === 'lesson') await DB.deleteLesson(lang, curLevelId, id);
      else if (type === 'word')   await DB.deleteWord(lang, curLevelId, curLessonId, id);

      closeModal('confirm-modal');
      toast('已刪除');

      if      (type === 'level')  showLevels();
      else if (type === 'lesson') showLessons();
      else if (type === 'word')   showWords();
    } catch (e) {
      toast('刪除失敗：' + e.message, true);
    }
  };

  openModal('confirm-modal');
}

// ── DOM helper ───────────────────────────────────────────────────────────────

function makeItem({ icon, title, titleClass, sub, extra, onClick, onEdit, onDelete }) {
  const div = document.createElement('div');
  div.className = 'list-item';

  const iconHtml = icon !== null
    ? `<div class="list-item-icon">${icon !== undefined ? icon : '📄'}</div>` : '';
  const subHtml  = sub   ? '<div class="list-item-sub"></div>' : '';
  const extraHtml= extra ? '<div class="list-item-extra"></div>' : '';
  const chevron  = (onClick && !onEdit) ? '<span style="color:var(--muted)">›</span>' : '';

  div.innerHTML = `
    ${iconHtml}
    <div class="list-item-body">
      <div class="list-item-title ${titleClass || ''}"></div>
      ${subHtml}${extraHtml}
    </div>
    <div class="list-item-right">
      ${onEdit   ? '<button class="btn btn-ghost btn-icon btn-sm edit-btn">✎</button>'    : ''}
      ${onDelete ? '<button class="btn btn-ghost btn-icon btn-sm delete-btn">🗑</button>' : ''}
      ${chevron}
    </div>
  `;

  div.querySelector('.list-item-title').textContent = title;
  if (sub)   div.querySelector('.list-item-sub').textContent = sub;
  if (extra) {
    const el = div.querySelector('.list-item-extra');
    el.textContent = extra;
    el.style.cssText = 'font-size:0.75rem;color:var(--muted);margin-top:2px;font-style:italic';
  }

  if (onClick) div.addEventListener('click', onClick);
  if (onEdit)  div.querySelector('.edit-btn').addEventListener('click', e => { e.stopPropagation(); onEdit(); });
  if (onDelete)div.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); onDelete(); });

  return div;
}
