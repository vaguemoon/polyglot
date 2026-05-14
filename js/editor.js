// Polyglot vocabulary editor — CRUD for levels / lessons / words
let lang = 'ko';
let curLevelId = null, curLevelName = '';
let curLessonId = null, curLessonName = '';
let editingId = null;
let wordsCache = [];

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
  if (open.id === 'level-modal')  saveLevel();
  else if (open.id === 'lesson-modal') saveLesson();
  else if (open.id === 'word-modal')   saveWord();
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

// ── Words ────────────────────────────────────────────────────────────────────

async function showWords(lessonId, lessonName) {
  if (lessonId) { curLessonId = lessonId; curLessonName = lessonName; }
  showPage('pg-words');
  document.getElementById('words-title').textContent = curLessonName;
  const list  = document.getElementById('words-list');
  const empty = document.getElementById('words-empty');
  list.innerHTML = '<div class="loading-msg">載入中…</div>';

  try {
    wordsCache = await DB.getWords(lang, curLevelId, curLessonId);
    list.innerHTML = '';
    if (!wordsCache.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    wordsCache.forEach(word => {
      const sub   = [word.zh, word.phonetic].filter(Boolean).join(' · ');
      const div   = makeItem({
        icon:    null,
        title:   word.word || '',
        titleClass: 'word-item-word',
        sub,
        extra:   word.notes || '',
        onEdit:  () => openWordModal(word.id, word),
        onDelete:() => confirmDelete('word', word.id, word.word || '詞彙'),
      });
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = `<div class="error-msg">載入失敗：${e.message}</div>`;
  }
}

function openWordModal(id = null, data = null) {
  editingId = id;
  document.getElementById('word-modal-title').textContent    = id ? '編輯詞彙' : '新增詞彙';
  document.getElementById('word-lang-label').textContent     = wordLangLabels[lang] || '詞彙';
  document.getElementById('word-ph-label').textContent       = phonLabels[lang] || '發音標記';
  document.getElementById('word-word').value                 = data?.word     || '';
  document.getElementById('word-zh').value                   = data?.zh       || data?.meaning || '';
  document.getElementById('word-phonetic').value             = data?.phonetic || data?.romanization || '';
  document.getElementById('word-notes').value                = data?.notes    || '';
  openModal('word-modal');
}

async function saveWord() {
  const word     = document.getElementById('word-word').value.trim();
  const zh       = document.getElementById('word-zh').value.trim();
  const phonetic = document.getElementById('word-phonetic').value.trim();
  const notes    = document.getElementById('word-notes').value.trim();

  if (!word) { toast('請輸入詞彙', true); return; }
  if (!zh)   { toast('請輸入中文翻譯', true); return; }

  const data = { word, zh, ...(phonetic && { phonetic }), ...(notes && { notes }) };

  try {
    if (editingId) {
      await DB.updateWord(lang, curLevelId, curLessonId, editingId, data);
      toast('已更新詞彙');
    } else {
      await DB.addWord(lang, curLevelId, curLessonId, data);
      toast('已新增詞彙');
    }
    closeModal('word-modal');
    showWords();
  } catch (e) {
    toast('儲存失敗：' + e.message, true);
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
