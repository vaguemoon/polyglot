// Polyglot — Korean typing practice

const STORAGE_KEY = 'polyglot-typing-texts';
const LINE_HEIGHT  = 44; // px — must match CSS line-height on #typing-display

// ── App state ─────────────────────────────────────────────────────────────────
let texts      = [];
let curTextId  = null;

// Practice state
let syllables  = [];   // array of single chars (spaces included)
let spanEls    = [];   // spanEls[i] = <span> for syllable i
let curIdx     = 0;
let hasError   = false;
let errors     = new Set(); // indices that had at least one wrong attempt
let startTime  = null;
let elapsedMs  = 0;
let timerInterval = null;
let blindMode  = false;
let composing  = false;
let ignoreNextInput = false;
let finished   = false;

// ── Utilities ─────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function toast(msg, err = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = err ? 'var(--red)' : '#1a1b2e';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ── LocalStorage ──────────────────────────────────────────────────────────────

function loadTexts() {
  try { texts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { texts = []; }
}

function saveTexts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(texts));
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initApp() {
  loadTexts();
  loadKbStats();
  initInputHandlers();
  showPage('pg-home');
}

// ── Prepare page ──────────────────────────────────────────────────────────────

function renderPrepare() {
  const sel   = document.getElementById('text-select');
  const start = document.getElementById('start-btn');
  const empty = document.getElementById('prepare-empty');

  sel.innerHTML = '';

  if (!texts.length) {
    sel.style.display  = 'none';
    empty.style.display = '';
    start.disabled     = true;
    return;
  }

  sel.style.display  = '';
  empty.style.display = 'none';
  start.disabled     = false;

  texts.forEach(t => {
    const opt = document.createElement('option');
    opt.value       = t.id;
    opt.textContent = t.name;
    if (t.id === curTextId) opt.selected = true;
    sel.appendChild(opt);
  });

  if (!curTextId || !texts.find(t => t.id === curTextId)) {
    curTextId = texts[0].id;
    sel.value = curTextId;
  }
}

function startPractice() {
  curTextId = document.getElementById('text-select').value;
  const textObj = texts.find(t => t.id === curTextId);
  if (!textObj || !textObj.text.trim()) {
    toast('請先新增或選擇文章', true); return;
  }
  setupPractice(textObj.text);
  showPage('pg-practice');
  focusInput();
}

function backToPrepare() {
  stopTimer();
  renderPrepare();
  showPage('pg-drill-prepare');
}

// ── Manage texts modal ────────────────────────────────────────────────────────

function openManageTexts() {
  renderTextsList();
  document.getElementById('manage-texts-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-text-name').focus(), 150);
}

function closeManageTexts() {
  document.getElementById('manage-texts-modal').classList.remove('open');
  document.getElementById('new-text-name').value = '';
  document.getElementById('new-text-body').value  = '';
  renderPrepare();
}

function renderTextsList() {
  const list = document.getElementById('texts-list');
  list.innerHTML = '';

  if (!texts.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:8px 0">尚無文章，請在下方新增</div>';
    return;
  }

  texts.forEach(t => {
    const div = document.createElement('div');
    div.className = 'text-list-item' + (t.id === curTextId ? ' current' : '');
    div.innerHTML = `
      <div class="text-list-info">
        <div class="text-list-name"></div>
        <div class="text-list-preview"></div>
      </div>
      <div class="text-list-actions">
        <button class="btn btn-ghost btn-sm" data-select>選用</button>
        <button class="btn btn-danger btn-icon btn-sm" data-delete title="刪除">🗑</button>
      </div>
    `;
    div.querySelector('.text-list-name').textContent    = t.name;
    div.querySelector('.text-list-preview').textContent =
      t.text.slice(0, 40) + (t.text.length > 40 ? '…' : '');
    div.querySelector('[data-select]').addEventListener('click', () => {
      curTextId = t.id;
      closeManageTexts();
    });
    div.querySelector('[data-delete]').addEventListener('click', () => deleteText(t.id));
    list.appendChild(div);
  });
}

function deleteText(id) {
  texts = texts.filter(t => t.id !== id);
  if (curTextId === id) curTextId = texts.length ? texts[0].id : null;
  saveTexts();
  renderTextsList();
}

function addNewText() {
  const name = document.getElementById('new-text-name').value.trim();
  const body = document.getElementById('new-text-body').value.trim();
  if (!name) { toast('請填入文章名稱', true); return; }
  if (!body) { toast('請貼入韓文內容', true); return; }

  const entry = { id: genId(), name, text: body };
  texts.push(entry);
  curTextId = entry.id;
  saveTexts();

  document.getElementById('new-text-name').value = '';
  document.getElementById('new-text-body').value  = '';
  renderTextsList();
  toast('已新增文章');
}

// ── Practice setup ────────────────────────────────────────────────────────────

function setupPractice(rawText) {
  // Normalize: collapse newlines/whitespace
  const text = rawText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  syllables = [...text];

  curIdx     = 0;
  hasError   = false;
  errors     = new Set();
  startTime  = null;
  elapsedMs  = 0;
  finished   = false;
  blindMode  = false;
  composing  = false;
  ignoreNextInput = false;

  stopTimer();

  document.getElementById('blind-btn').classList.remove('active');
  document.getElementById('timer-display').textContent = '00:00';
  document.getElementById('wpm-display').textContent   = '0';

  renderTypingDisplay();
}

// ── Display rendering ─────────────────────────────────────────────────────────

function renderTypingDisplay() {
  const display = document.getElementById('typing-display');
  display.innerHTML = '';
  display.scrollTop = 0;

  spanEls = new Array(syllables.length).fill(null);

  syllables.forEach((ch, idx) => {
    const span = document.createElement('span');
    span.className   = 'syl';
    // Use non-breaking space for visual space (breaks inside span otherwise collapse)
    span.textContent = ch === ' ' ? ' ' : ch;
    setSpanClass(span, idx);
    display.appendChild(span);
    spanEls[idx] = span;
  });
}

function setSpanClass(span, idx) {
  span.classList.remove(
    'syl-correct', 'syl-wrong', 'syl-current',
    'syl-composing', 'syl-pending', 'syl-blind'
  );

  if (idx < curIdx) {
    span.classList.add('syl-correct');
  } else if (idx === curIdx) {
    span.classList.add(hasError ? 'syl-wrong' : 'syl-current');
  } else {
    span.classList.add(blindMode ? 'syl-blind' : 'syl-pending');
  }
}

function refreshAllSpans() {
  spanEls.forEach((span, idx) => { if (span) setSpanClass(span, idx); });
}

// ── Keyboard / IME input ──────────────────────────────────────────────────────

function initInputHandlers() {
  const ta = document.getElementById('typing-input');

  // Block paste (prevent bulk input)
  ta.addEventListener('paste', e => e.preventDefault());

  ta.addEventListener('compositionstart', () => {
    composing = true;
    // Mark current syllable as composing
    if (spanEls[curIdx] && !hasError) {
      spanEls[curIdx].classList.remove('syl-current', 'syl-pending', 'syl-blind');
      spanEls[curIdx].classList.add('syl-composing');
    }
  });

  ta.addEventListener('compositionupdate', () => {
    // Keep composing state on current span (already set in compositionstart)
  });

  ta.addEventListener('compositionend', e => {
    composing = false;
    ignoreNextInput = true; // the 'input' event that follows should be ignored

    const ch = e.data;

    // Clear textarea after composition (start fresh for next syllable)
    requestAnimationFrame(() => {
      ta.value        = '';
      ignoreNextInput = false;
    });

    if (hasError || finished || !ch) return;
    if (!startTime) startTimer();
    commitChar(ch);
  });

  ta.addEventListener('input', () => {
    if (composing || ignoreNextInput || finished) return;

    const v = ta.value;
    if (!v.length) return;

    // Take the last character (handles single-char non-IME input: space, punctuation)
    const ch = v.slice(-1);
    ta.value = '';

    if (hasError) return; // blocked until backspace
    if (!startTime) startTimer();
    commitChar(ch);
  });

  ta.addEventListener('keydown', e => {
    if (composing || finished) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    }
  });
}

function focusInput() {
  document.getElementById('typing-input').focus();
}

// ── Core typing logic ─────────────────────────────────────────────────────────

function commitChar(ch) {
  if (curIdx >= syllables.length || finished) return;

  const target = syllables[curIdx];

  if (ch === target) {
    // Correct
    const span = spanEls[curIdx];
    if (span) {
      span.classList.remove('syl-current', 'syl-composing', 'syl-pending', 'syl-blind', 'syl-wrong');
      span.classList.add('syl-correct');
    }
    curIdx++;

    if (curIdx >= syllables.length) {
      finishPractice();
      return;
    }

    // Render new current span
    if (spanEls[curIdx]) setSpanClass(spanEls[curIdx], curIdx);

    updateStatsDisplay();
    autoScroll();
  } else {
    // Wrong
    hasError = true;
    errors.add(curIdx);
    const span = spanEls[curIdx];
    if (span) {
      span.classList.remove('syl-current', 'syl-composing', 'syl-pending', 'syl-blind');
      span.classList.add('syl-wrong');
    }
  }
}

function handleBackspace() {
  if (!hasError) return; // strict mode: can't go back past correct chars
  hasError = false;
  if (spanEls[curIdx]) setSpanClass(spanEls[curIdx], curIdx);
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    elapsedMs = Date.now() - startTime;
    document.getElementById('timer-display').textContent = fmtTime(elapsedMs);
    document.getElementById('wpm-display').textContent   = String(calcWPM());
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function calcWPM() {
  if (!startTime) return 0;
  const mins = (Date.now() - startTime) / 60000;
  if (mins < 0.01) return 0;
  return Math.round(curIdx / 5 / mins);
}

function updateStatsDisplay() {
  if (!startTime) return;
  document.getElementById('wpm-display').textContent = String(calcWPM());
}

// ── Auto scroll ───────────────────────────────────────────────────────────────

function autoScroll() {
  const display  = document.getElementById('typing-display');
  const curSpan  = spanEls[curIdx];
  if (!curSpan) return;

  const cursorTop = curSpan.offsetTop;
  // If cursor has entered the 3rd row (≥ 2 × line height from scroll top), scroll up
  if (cursorTop - display.scrollTop >= LINE_HEIGHT * 2) {
    display.scrollTop = cursorTop - LINE_HEIGHT;
  }
}

// ── Blind mode ────────────────────────────────────────────────────────────────

function toggleBlindMode() {
  blindMode = !blindMode;
  document.getElementById('blind-btn').classList.toggle('active', blindMode);
  refreshAllSpans();
}

// ── Restart ───────────────────────────────────────────────────────────────────

function restartPractice() {
  const textObj = texts.find(t => t.id === curTextId);
  if (!textObj) { backToPrepare(); return; }
  setupPractice(textObj.text);
  showPage('pg-practice');
  focusInput();
}

// ── Finish ────────────────────────────────────────────────────────────────────

function finishPractice() {
  if (finished) return;
  finished = true;
  stopTimer();
  if (startTime) elapsedMs = Date.now() - startTime;

  const total    = syllables.length;
  const typed    = Math.max(curIdx, 1); // avoid div-by-zero
  const errCount = errors.size;
  const correct  = curIdx - errCount; // positions typed with no error on first attempt
  const accuracy = curIdx ? Math.round(Math.max(0, correct) / curIdx * 100) : 100;
  const mins     = elapsedMs / 60000;
  const wpm      = (mins > 0.01) ? Math.round(curIdx / 5 / mins) : 0;

  document.getElementById('res-wpm').textContent      = wpm;
  document.getElementById('res-accuracy').textContent  = accuracy + '%';
  document.getElementById('res-time').textContent      = fmtTime(elapsedMs);
  document.getElementById('res-errors').textContent    = errCount;

  showPage('pg-results');
}

// ── Keyboard practice ─────────────────────────────────────────────────────────

const KB_STATS_KEY = 'polyglot-keyboard-stats';

const KB_COURSES = [
  { id: 'home',   name: 'Home 行',   keys: 'A S D F  J K L',
    pool: ['ㅁ','ㄴ','ㅇ','ㄹ','ㅓ','ㅏ','ㅣ'] },
  { id: 'top',    name: 'Top 行',    keys: 'Q W E R  U I O P',
    pool: ['ㅂ','ㅈ','ㄷ','ㄱ','ㅕ','ㅑ','ㅐ','ㅔ'] },
  { id: 'bottom', name: 'Bottom 行', keys: 'Z X C V  M',
    pool: ['ㅋ','ㅌ','ㅊ','ㅍ','ㅡ'] },
  { id: 'middle', name: '中間縱列', keys: 'T G B  +  Y H N',
    pool: ['ㅅ','ㅎ','ㅠ','ㅛ','ㅗ','ㅜ'] },
  { id: 'shift',  name: 'Shift 鍵',  keys: '⇧Q ⇧W ⇧E ⇧R  ⇧O ⇧P',
    pool: ['ㅃ','ㅉ','ㄸ','ㄲ','ㅒ','ㅖ'] },
];

const KEYMAP_BASE = {
  KeyQ:'ㅂ', KeyW:'ㅈ', KeyE:'ㄷ', KeyR:'ㄱ', KeyT:'ㅅ',
  KeyY:'ㅛ', KeyU:'ㅕ', KeyI:'ㅑ', KeyO:'ㅐ', KeyP:'ㅔ',
  KeyA:'ㅁ', KeyS:'ㄴ', KeyD:'ㅇ', KeyF:'ㄹ', KeyG:'ㅎ',
  KeyH:'ㅗ', KeyJ:'ㅓ', KeyK:'ㅏ', KeyL:'ㅣ',
  KeyZ:'ㅋ', KeyX:'ㅌ', KeyC:'ㅊ', KeyV:'ㅍ',
  KeyB:'ㅠ', KeyN:'ㅜ', KeyM:'ㅡ',
};
const KEYMAP_SHIFT = {
  KeyQ:'ㅃ', KeyW:'ㅉ', KeyE:'ㄸ', KeyR:'ㄲ', KeyT:'ㅆ',
  KeyO:'ㅒ', KeyP:'ㅖ',
};

const CHAR_TO_KEY = (() => {
  const m = {};
  Object.entries(KEYMAP_BASE).forEach(([code, ch]) => { m[ch] = { code, shift: false }; });
  Object.entries(KEYMAP_SHIFT).forEach(([code, ch]) => { m[ch] = { code, shift: true }; });
  return m;
})();


const VK_ROWS = [
  ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP'],
  ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL'],
  ['ShiftLeft','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','ShiftRight'],
];

let kbCourseId         = 'home';
let kbReps             = 3;
let kbTotal            = 0;
let kbQueue            = [];
let kbQueueIdx         = 0;
let kbFirstTryCorrect  = 0;
let kbCurrentHadError  = false;
let kbStats            = {};
let kbKeydownHandler   = null;
let kbSpans            = [];

function loadKbStats() {
  try { kbStats = JSON.parse(localStorage.getItem(KB_STATS_KEY)) || {}; }
  catch { kbStats = {}; }
}

function saveKbStats() {
  localStorage.setItem(KB_STATS_KEY, JSON.stringify(kbStats));
}

function goToDrillPrepare() {
  renderPrepare();
  showPage('pg-drill-prepare');
}

function renderCourseList() {
  const list = document.getElementById('course-list');
  list.innerHTML = '';
  KB_COURSES.forEach(course => {
    const div = document.createElement('div');
    div.className = 'course-card' + (course.id === kbCourseId ? ' selected' : '');
    div.dataset.course = course.id;
    div.innerHTML = `<div class="course-card-dot"></div>
      <div class="course-card-body">
        <div class="course-card-name">${course.name}</div>
        <div class="course-card-keys">${course.keys}</div>
        <div class="course-card-pool">${course.pool.join(' ')}</div>
      </div>
      <div class="course-card-count">${course.pool.length} 字</div>`;
    div.addEventListener('click', () => selectCourse(course.id));
    list.appendChild(div);
  });
}

function selectCourse(id) {
  kbCourseId = id;
  document.querySelectorAll('.course-card').forEach(el =>
    el.classList.toggle('selected', el.dataset.course === id)
  );
}

function initKbPrepare() {
  renderCourseList();
  showPage('pg-kb-prepare');
}

function speakChar(ch) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(ch);
  u.lang = 'ko-KR';
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _launchKbPractice() {
  const course = KB_COURSES.find(c => c.id === kbCourseId);
  kbQueue = shuffleArray(course.pool.flatMap(ch => Array(kbReps).fill(ch)));
  kbTotal = kbQueue.length;
  kbQueueIdx        = 0;
  kbFirstTryCorrect = 0;
  kbCurrentHadError = false;

  document.getElementById('kb-course-label').textContent = course.name;

  renderVirtualKeyboard();
  showPage('pg-keyboard');

  if (kbKeydownHandler) document.removeEventListener('keydown', kbKeydownHandler);
  kbKeydownHandler = handleKbKeydown;
  document.addEventListener('keydown', kbKeydownHandler);

  renderKbSeqDisplay();
}

function startKbPractice() {
  kbReps = parseInt(document.querySelector('input[name="kb-reps"]:checked').value, 10);
  _launchKbPractice();
}

function endKbEarly() {
  showKbResults();
}

function retryKbPractice() {
  _launchKbPractice();
}

function renderVirtualKeyboard() {
  const container = document.getElementById('vk-keyboard');
  container.innerHTML = '';

  VK_ROWS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'vk-row';

    row.forEach(code => {
      const keyEl = document.createElement('div');
      keyEl.className = 'vk-key';
      keyEl.dataset.code = code;

      if (code === 'ShiftLeft' || code === 'ShiftRight') {
        keyEl.classList.add('vk-shift-key');
        keyEl.textContent = '⇧ Shift';
      } else {
        const base  = KEYMAP_BASE[code]  || '';
        const shift = KEYMAP_SHIFT[code] || '';

        if (shift) {
          const sl = document.createElement('span');
          sl.className   = 'vk-shift-label';
          sl.textContent = shift;
          keyEl.appendChild(sl);
        }

        const bl = document.createElement('span');
        bl.className   = 'vk-base';
        bl.textContent = base;
        keyEl.appendChild(bl);

        const el = document.createElement('span');
        el.className   = 'vk-eng';
        el.textContent = code.replace('Key', '');
        keyEl.appendChild(el);
      }

      rowEl.appendChild(keyEl);
    });

    container.appendChild(rowEl);
  });
}

function renderKbSeqDisplay() {
  const display = document.getElementById('kb-seq-display');
  display.innerHTML = '';
  kbSpans = [];

  kbQueue.forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'kb-syl ' + (i === 0 ? 'kb-syl-current' : 'kb-syl-pending');
    span.textContent = ch;
    display.appendChild(span);
    kbSpans.push(span);
  });

  document.getElementById('kb-progress').textContent = `1 / ${kbTotal}`;
  updateKbTargetKey();
}

function updateKbTargetKey() {
  if (kbQueueIdx >= kbQueue.length) return;
  const keyInfo = CHAR_TO_KEY[kbQueue[kbQueueIdx]];
  const shiftEl = document.getElementById('kb-shift-indicator');

  if (keyInfo && keyInfo.shift) {
    shiftEl.classList.add('visible');
  } else {
    shiftEl.classList.remove('visible');
  }

  document.querySelectorAll('.vk-key').forEach(k =>
    k.classList.remove('kb-target', 'kb-hint')
  );

  if (keyInfo) {
    const targetEl = document.querySelector(`.vk-key[data-code="${keyInfo.code}"]`);
    if (targetEl) targetEl.classList.add('kb-target');
    if (keyInfo.shift) {
      document.querySelectorAll('.vk-key[data-code="ShiftLeft"], .vk-key[data-code="ShiftRight"]')
        .forEach(k => k.classList.add('kb-target'));
    }
  }
}

function handleKbKeydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') { endKbEarly(); return; }
  if (!e.code.startsWith('Key')) return;

  e.preventDefault();

  const typed = e.shiftKey
    ? (KEYMAP_SHIFT[e.code] || KEYMAP_BASE[e.code])
    : KEYMAP_BASE[e.code];
  if (!typed) return;

  const target = kbQueue[kbQueueIdx];

  if (typed === target) {
    if (kbSpans[kbQueueIdx]) kbSpans[kbQueueIdx].className = 'kb-syl kb-syl-done';
    speakChar(target);
    if (!kbCurrentHadError) kbFirstTryCorrect++;
    kbStats[target] = kbStats[target] || { correct: 0, wrong: 0 };
    kbStats[target].correct++;
    saveKbStats();
    kbQueueIdx++;
    kbCurrentHadError = false;

    if (kbQueueIdx >= kbQueue.length) {
      showKbResults();
      return;
    }

    if (kbSpans[kbQueueIdx]) kbSpans[kbQueueIdx].className = 'kb-syl kb-syl-current';
    document.getElementById('kb-progress').textContent = `${kbQueueIdx + 1} / ${kbTotal}`;
    updateKbTargetKey();
  } else {
    if (kbSpans[kbQueueIdx]) kbSpans[kbQueueIdx].className = 'kb-syl kb-syl-wrong';

    if (!kbCurrentHadError) {
      kbStats[target] = kbStats[target] || { correct: 0, wrong: 0 };
      kbStats[target].wrong++;
      saveKbStats();
      kbCurrentHadError = true;
    }

    // Flash the wrong key
    const pressedEl = document.querySelector(`.vk-key[data-code="${e.code}"]`);
    if (pressedEl && !pressedEl.classList.contains('vk-shift-key')) {
      pressedEl.classList.remove('kb-wrong');
      void pressedEl.offsetWidth; // restart animation
      pressedEl.classList.add('kb-wrong');
      setTimeout(() => pressedEl.classList.remove('kb-wrong'), 420);
    }

    // Hint: highlight correct key green
    const keyInfo = CHAR_TO_KEY[target];
    if (keyInfo) {
      const hintEl = document.querySelector(`.vk-key[data-code="${keyInfo.code}"]`);
      if (hintEl) hintEl.classList.add('kb-hint');
    }
  }
}

function showKbResults() {
  if (kbKeydownHandler) {
    document.removeEventListener('keydown', kbKeydownHandler);
    kbKeydownHandler = null;
  }

  const done     = kbQueueIdx;
  const accuracy = done > 0 ? Math.round(kbFirstTryCorrect / done * 100) : 100;

  document.getElementById('kb-res-accuracy').textContent  = accuracy + '%';
  document.getElementById('kb-count-summary').textContent =
    `共 ${done} 題，首次正確 ${kbFirstTryCorrect} 題`;

  const sorted = Object.entries(kbStats)
    .filter(([, s]) => s.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .slice(0, 5);

  const list = document.getElementById('kb-error-list');
  list.innerHTML = '';

  if (!sorted.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:4px 0">本次沒有錯誤 🎉</div>';
  } else {
    sorted.forEach(([ch, s]) => {
      const keyInfo  = CHAR_TO_KEY[ch];
      const keyLabel = keyInfo
        ? (keyInfo.shift ? '⇧ + ' : '') + keyInfo.code.replace('Key', '')
        : '';
      const div = document.createElement('div');
      div.className = 'kb-error-item';
      div.innerHTML = `<span class="kb-error-char">${ch}</span>
        <div class="kb-error-info">
          <div class="kb-error-wrong">${s.wrong} 次答錯</div>
          ${keyLabel ? `<div class="kb-error-key">按鍵：${keyLabel}</div>` : ''}
        </div>`;
      list.appendChild(div);
    });
  }

  showPage('pg-kb-results');
}

// ── Entry ─────────────────────────────────────────────────────────────────────

initApp();
