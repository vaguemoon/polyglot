// Polyglot learning app
const params   = new URLSearchParams(location.search);
const lang     = params.get('lang') || 'ko';
const langName = { ko: '韓語', vi: '越南語' }[lang] || lang;

document.body.classList.add(lang === 'ko' ? 'lang-ko' : 'lang-vi');
document.title = `Polyglot — ${langName}`;

// ── Global state ────────────────────────────────────────────────────────────
let curLevelId = null, curLevelName = '';
let curLessonId = null, curLessonName = '';
let curWords = [];
let curIdx = 0;
let curMode = null;
let curSessionType = 'word'; // 'word' | 'dial' | 'pat'
let sessionRes = [];
let progressMap = {};
let fcFlipped = false;
let spellInputMode = false;
let spellAvailable = [];
let spellSelected = [];

// Dialogue / Pattern data
let curDialogues = [];
let curPatterns  = [];

// Dialogue mode state
let dialItems       = [];
let dialIdx         = 0;
let dialFlipped     = false;
let dialItemRes     = [];
let dialOrderPlaced = [];
let dialOrderAvail  = [];

// Pattern mode state
let patItems        = [];
let patIdx          = 0;
let patFlipped      = false;
let patItemRes      = [];
let patOrderPlaced  = [];
let patOrderAvail   = [];

// ── Utilities ───────────────────────────────────────────────────────────────

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function starsHtml(n) {
  return [0, 1, 2].map(i => `<span class="star${i < n ? ' lit' : ''}">★</span>`).join('');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateStudyHdr(prefix, idx, total, correct, unit = '張') {
  const pct = total > 0 ? Math.round(idx / total * 100) : 0;
  document.getElementById(`${prefix}-badge`).textContent       = `${idx + 1} / ${total}`;
  document.getElementById(`${prefix}-card-label`).textContent  = `第 ${idx + 1} ${unit}，共 ${total} ${unit}`;
  document.getElementById(`${prefix}-score-label`).textContent = `答對 ${correct}`;
  document.getElementById(`${prefix}-fill`).style.width        = pct + '%';
}

function recordResult(correct) {
  const w = curWords[curIdx];
  sessionRes.push({ wordId: w.id, correct });
}

function advance() {
  curIdx++;
  if (curIdx >= curWords.length) {
    showResults();
  } else {
    renderCurrentCard();
  }
}

function renderCurrentCard() {
  if      (curMode === 'flashcard') renderFC();
  else if (curMode === 'listening') renderMCQ();
  else if (curMode === 'quiz')      renderMCQ();
  else if (curMode === 'spelling')  renderSpell();
}

// ── TTS ─────────────────────────────────────────────────────────────────────

document.getElementById('levels-lang-title').textContent = langName;

function toggleTTS() {
  const on  = !TTS.isEnabled();
  TTS.setEnabled(on);
  const btn = document.getElementById('tts-btn');
  btn.textContent   = on ? '🔊 語音' : '🔇 語音';
  btn.style.opacity = on ? '1' : '0.5';
  toast(on ? '語音已開啟' : '語音已關閉');
}

// ── Levels ───────────────────────────────────────────────────────────────────

async function navToLevels() {
  showPage('pg-levels');
  const list  = document.getElementById('levels-list');
  const empty = document.getElementById('levels-empty');
  list.innerHTML = '<div class="loading-msg">載入中…</div>';

  try {
    const [levels, allProg] = await Promise.all([
      DB.getLevels(lang),
      DB.getAllProgress(lang)
    ]);
    list.innerHTML = '';

    if (!levels.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    await Promise.all(levels.map(async level => {
      const lessons     = await DB.getLessons(lang, level.id);
      const wordBatches = await Promise.all(lessons.map(l => DB.getWords(lang, level.id, l.id)));
      const allWords    = wordBatches.flat();
      const total       = allWords.length;
      const mastered    = allWords.filter(w => (allProg[w.id]?.stars || 0) >= 3).length;
      const pct         = total > 0 ? Math.round(mastered / total * 100) : 0;

      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-icon">${level.order}</div>
        <div class="list-item-body">
          <div class="list-item-title"></div>
          <div class="list-item-sub">${lessons.length} 課 · ${total} 詞</div>
          <div class="progress-bar" style="margin-top:8px">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="list-item-right">
          <div style="text-align:right;line-height:1.5">
            <div style="font-size:0.8rem;color:var(--muted)">${pct}%</div>
            <div style="font-size:0.7rem;color:var(--muted)">${mastered}/${total}</div>
          </div>
          <span style="color:var(--muted)">›</span>
        </div>
      `;
      div.querySelector('.list-item-title').textContent = level.name;
      div.addEventListener('click', () => navToLessons(level.id, level.name));
      list.appendChild(div);
    }));
  } catch (e) {
    list.innerHTML = `<div class="error-msg">載入失敗：${e.message}</div>`;
  }
}

// ── Lessons ──────────────────────────────────────────────────────────────────

async function navToLessons(levelId, levelName) {
  if (levelId) { curLevelId = levelId; curLevelName = levelName; }
  showPage('pg-lessons');
  document.getElementById('lessons-level-title').textContent = curLevelName;

  const list  = document.getElementById('lessons-list');
  const empty = document.getElementById('lessons-empty');
  list.innerHTML = '<div class="loading-msg">載入中…</div>';

  try {
    const [lessons, allProg] = await Promise.all([
      DB.getLessons(lang, curLevelId),
      DB.getAllProgress(lang)
    ]);
    list.innerHTML = '';

    if (!lessons.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    await Promise.all(lessons.map(async lesson => {
      const words    = await DB.getWords(lang, curLevelId, lesson.id);
      const total    = words.length;
      const mastered = words.filter(w => (allProg[w.id]?.stars || 0) >= 3).length;
      const pct      = total > 0 ? Math.round(mastered / total * 100) : 0;
      const avgStars = total > 0
        ? words.reduce((s, w) => s + (allProg[w.id]?.stars || 0), 0) / total : 0;

      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-icon">📖</div>
        <div class="list-item-body">
          <div class="list-item-title"></div>
          <div class="list-item-sub">${total} 個詞彙</div>
          <div class="progress-bar" style="margin-top:8px">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="list-item-right">
          <div class="stars">${starsHtml(Math.round(avgStars))}</div>
          <span style="color:var(--muted)">›</span>
        </div>
      `;
      div.querySelector('.list-item-title').textContent = lesson.name;
      div.addEventListener('click', () => navToModes(lesson.id, lesson.name));
      list.appendChild(div);
    }));
  } catch (e) {
    list.innerHTML = `<div class="error-msg">載入失敗：${e.message}</div>`;
  }
}

// ── Mode Selector ────────────────────────────────────────────────────────────

async function navToModes(lessonId, lessonName) {
  if (lessonId) { curLessonId = lessonId; curLessonName = lessonName; }
  showPage('pg-modes');
  document.getElementById('modes-lesson-title').textContent = curLessonName;

  let words, dialogues, patterns;
  try {
    [words, dialogues, patterns, progressMap] = await Promise.all([
      DB.getWords(lang, curLevelId, curLessonId),
      DB.getDialogues(lang, curLevelId, curLessonId),
      DB.getPatterns(lang, curLevelId, curLessonId),
      DB.getAllProgress(lang),
    ]);
  } catch (e) {
    toast('無法載入課程內容');
    return;
  }

  curDialogues = dialogues;
  curPatterns  = patterns;

  // ── Word section ──
  const wordSection = document.getElementById('modes-word-section');
  if (words.length) {
    wordSection.style.display = '';
    document.getElementById('modes-word-count').textContent = `${words.length} 詞`;
    const needMCQ = words.length < 4;
    document.getElementById('mode-btn-listen').disabled = needMCQ;
    document.getElementById('mode-btn-quiz').disabled   = needMCQ;
    document.getElementById('mcq-min-notice').style.display = needMCQ ? '' : 'none';
    const unmastered = words.filter(w => (progressMap[w.id]?.stars || 0) < 3);
    const mastered   = words.filter(w => (progressMap[w.id]?.stars || 0) >= 3);
    curWords = [...shuffle(unmastered), ...shuffle(mastered)];
  } else {
    wordSection.style.display = 'none';
    curWords = [];
  }

  // ── Dialogue section ──
  const dialSection = document.getElementById('modes-dial-section');
  if (dialogues.length) {
    dialSection.style.display = '';
    document.getElementById('modes-dial-count').textContent = `${dialogues.length} 段`;
    const totalLines = dialogues.reduce((s, d) => s + (d.lines || []).length, 0);
    const needLines  = totalLines < 4;
    document.getElementById('mode-btn-dial-fill').disabled  = needLines;
    document.getElementById('mode-btn-dial-cloze').disabled = needLines;
    document.getElementById('dial-min-notice').style.display = needLines ? '' : 'none';
  } else {
    dialSection.style.display = 'none';
  }

  // ── Pattern section ──
  const patSection = document.getElementById('modes-pat-section');
  if (patterns.length) {
    patSection.style.display = '';
    document.getElementById('modes-pat-count').textContent = `${patterns.length} 個`;
    const totalExamples = patterns.reduce((s, p) => s + (p.examples || []).length, 0);
    const totalSlots    = patterns.reduce((s, p) => s + (p.slots || []).length, 0);
    const needSlots     = totalSlots < 2;
    const needExamples  = totalExamples < 4;
    document.getElementById('mode-btn-pat-fill').disabled  = needSlots;
    document.getElementById('mode-btn-pat-zh2f').disabled  = needExamples;
    document.getElementById('pat-min-notice').style.display = (needSlots || needExamples) ? '' : 'none';
  } else {
    patSection.style.display = 'none';
  }

  if (!words.length && !dialogues.length && !patterns.length) {
    toast('此課程還沒有任何學習內容');
  }
}

async function startMode(mode) {
  if (!curWords.length) {
    toast('請先選擇課程');
    return;
  }
  curMode    = mode;
  curIdx     = 0;
  sessionRes = [];

  if (mode === 'flashcard') { showPage('pg-flashcard'); document.getElementById('fc-lesson-title').textContent = curLessonName; renderFC(); }
  else if (mode === 'listening' || mode === 'quiz') { showPage('pg-mcq'); document.getElementById('mcq-title').textContent = curLessonName; renderMCQ(); }
  else if (mode === 'spelling') { showPage('pg-spell'); document.getElementById('spell-lesson-title').textContent = curLessonName; renderSpell(); }
}

// ── Flashcard mode ───────────────────────────────────────────────────────────

function renderFC() {
  const w = curWords[curIdx];
  fcFlipped = false;
  const correct = sessionRes.filter(r => r.correct).length;
  updateStudyHdr('fc', curIdx, curWords.length, correct);

  document.getElementById('fc-hint').textContent = '點擊看答案';
  document.getElementById('fc-zh').textContent   = w.zh || w.meaning || '';

  ['fc-word', 'fc-phonetic', 'fc-notes', 'fc-tts', 'fc-image'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('fc-answer-row').style.display = 'none';

  const card = document.getElementById('flashcard');
  card.style.transition = 'none';
  card.style.transform  = '';
  card.style.opacity    = '1';
}

function flipCard() {
  if (fcFlipped) return;
  fcFlipped = true;

  const w    = curWords[curIdx];
  const card = document.getElementById('flashcard');

  card.style.transition = 'transform 0.12s, opacity 0.12s';
  card.style.transform  = 'scale(0.97)';
  card.style.opacity    = '0.7';

  setTimeout(() => {
    card.style.transform = '';
    card.style.opacity   = '1';

    document.getElementById('fc-hint').textContent = '你記得嗎？';

    const wordEl = document.getElementById('fc-word');
    wordEl.textContent   = w.word || '';
    wordEl.style.display = '';

    if (w.phonetic) {
      const el = document.getElementById('fc-phonetic');
      el.textContent   = w.phonetic;
      el.style.display = '';
    }
    if (w.notes) {
      const el = document.getElementById('fc-notes');
      el.textContent   = w.notes;
      el.style.display = '';
    }
    document.getElementById('fc-tts').style.display        = '';
    document.getElementById('fc-answer-row').style.display = '';

    const imgEl = document.getElementById('fc-image');
    if (w.imageUrl) {
      imgEl.src           = w.imageUrl;
      imgEl.style.display = '';
    } else {
      imgEl.style.display = 'none';
    }

    if (TTS.isEnabled() && w.word) TTS.speak(w.word, lang);
  }, 120);
}

function playTTS() {
  const w = curWords[curIdx];
  if (w?.word) TTS.speak(w.word, lang);
}

function fcMark(correct) {
  recordResult(correct);
  const card = document.getElementById('flashcard');
  card.style.transition = 'transform 0.22s, opacity 0.22s';
  card.style.transform  = correct ? 'translateX(50px) rotate(3deg)' : 'translateX(-50px) rotate(-3deg)';
  card.style.opacity    = '0';
  setTimeout(() => advance(), 230);
}

// ── MCQ mode (listening + quiz) ──────────────────────────────────────────────

function renderMCQ() {
  const w       = curWords[curIdx];
  const correct = sessionRes.filter(r => r.correct).length;
  const prefix  = 'mcq';
  updateStudyHdr(prefix, curIdx, curWords.length, correct);

  const isListen = (curMode === 'listening');
  document.getElementById('mcq-listen-area').style.display = isListen ? '' : 'none';
  document.getElementById('mcq-quiz-area').style.display   = isListen ? 'none' : '';

  if (!isListen) {
    document.getElementById('mcq-zh-text').textContent = w.zh || w.meaning || '';
  }

  // Build 4 choices: correct + 3 random distractors
  const others = curWords.filter((_, i) => i !== curIdx);
  const distractors = shuffle(others).slice(0, 3);
  const choices = shuffle([w, ...distractors]);

  const container = document.getElementById('mcq-choices');
  container.innerHTML = '';
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'mcq-choice';
    btn.textContent = choice.word || '';
    btn.addEventListener('click', () => mcqAnswer(btn, choice.id === w.id));
    container.appendChild(btn);
  });

  if (isListen && TTS.isEnabled() && w.word) {
    setTimeout(() => TTS.speak(w.word, lang), 300);
  }
}

function mcqPlayTTS() {
  const w = curWords[curIdx];
  if (w?.word) TTS.speak(w.word, lang);
}

function mcqAnswer(btn, correct) {
  const choices = document.querySelectorAll('.mcq-choice');
  choices.forEach(b => b.disabled = true);

  recordResult(correct);

  if (correct) {
    btn.classList.add('correct');
  } else {
    btn.classList.add('wrong');
    // Highlight the correct answer
    const correctWord = curWords[curIdx].word;
    choices.forEach(b => {
      if (b.textContent === correctWord) b.classList.add('correct');
    });
  }

  setTimeout(() => advance(), 1000);
}

// ── Spelling mode ────────────────────────────────────────────────────────────

function renderSpell() {
  const w       = curWords[curIdx];
  const correct = sessionRes.filter(r => r.correct).length;
  updateStudyHdr('spell', curIdx, curWords.length, correct);

  document.getElementById('spell-zh').textContent = w.zh || w.meaning || '';
  document.getElementById('spell-feedback').style.display = 'none';

  // Init select mode state
  const chars = splitWord(w.word || '', lang);
  spellAvailable = shuffle(chars.map((c, i) => ({ c, idx: i })));
  spellSelected  = [];

  renderSpellTiles();
  if (!spellInputMode) {
    document.getElementById('spell-input').value = '';
  }
}

function splitWord(word, l) {
  // Korean: each character is a syllable block
  // Vietnamese: split by space (multi-syllable words)
  if (l === 'ko') return [...word]; // spread splits into Unicode code points (handles Hangul properly)
  return word.split(' ').filter(Boolean);
}

function renderSpellTiles() {
  const assembled = document.getElementById('spell-assembled');
  const tilesEl   = document.getElementById('spell-tiles');

  assembled.innerHTML = '';
  spellSelected.forEach((item, i) => {
    const tile = document.createElement('span');
    tile.className = 'spell-tile';
    tile.textContent = item.c;
    tile.addEventListener('click', () => spellDeselect(i));
    assembled.appendChild(tile);
  });

  tilesEl.innerHTML = '';
  spellAvailable.forEach((item, i) => {
    const tile = document.createElement('span');
    tile.className = 'spell-tile';
    tile.textContent = item.c;
    tile.addEventListener('click', () => spellSelect(i));
    tilesEl.appendChild(tile);
  });
}

function spellSelect(i) {
  const item = spellAvailable.splice(i, 1)[0];
  spellSelected.push(item);
  renderSpellTiles();
}

function spellDeselect(i) {
  const item = spellSelected.splice(i, 1)[0];
  spellAvailable.push(item);
  renderSpellTiles();
}

function spellUndoLast() {
  if (!spellSelected.length) return;
  spellDeselect(spellSelected.length - 1);
}

function toggleSpellMode() {
  spellInputMode = !spellInputMode;
  document.getElementById('spell-select-area').style.display = spellInputMode ? 'none' : '';
  document.getElementById('spell-input-area').style.display  = spellInputMode ? '' : 'none';
  document.getElementById('spell-toggle-btn').textContent     = spellInputMode ? '拼排模式' : '輸入模式';
  document.getElementById('spell-mode-label').textContent     = spellInputMode
    ? '請輸入對應的詞彙' : '請拼出對應的詞彙';
  if (spellInputMode) {
    setTimeout(() => document.getElementById('spell-input').focus(), 100);
  }
}

function checkSpelling() {
  const w = curWords[curIdx];
  const correct = (w.word || '').trim();

  let userAnswer;
  if (spellInputMode) {
    userAnswer = document.getElementById('spell-input').value.trim();
  } else {
    userAnswer = spellSelected.map(item => item.c).join(lang === 'vi' ? ' ' : '');
  }

  const isCorrect = userAnswer === correct;
  recordResult(isCorrect);

  const fb = document.getElementById('spell-feedback');
  fb.style.display = '';
  fb.className     = `spell-feedback ${isCorrect ? 'ok' : 'bad'}`;
  fb.textContent   = isCorrect
    ? `✓ 正確！${correct}`
    : `✗ 正確答案：${correct}`;

  if (TTS.isEnabled() && correct) TTS.speak(correct, lang);

  setTimeout(() => advance(), 1400);
}

// Keyboard Enter in spelling input mode
document.getElementById('spell-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkSpelling();
});

// ── Exit / navigation ────────────────────────────────────────────────────────

function exitMode() {
  TTS.cancel();
  navToModes();
}

async function restartMode() {
  if      (curSessionType === 'dial') startDialogueMode(curMode);
  else if (curSessionType === 'pat')  startPatternMode(curMode);
  else { curIdx = 0; sessionRes = []; curWords = shuffle(curWords); startMode(curMode); }
}

// ── Results ──────────────────────────────────────────────────────────────────

function aggregateToGroup(items, groupKey) {
  const groups = {};
  items.forEach(item => {
    const key = item[groupKey];
    if (!groups[key]) groups[key] = [];
    groups[key].push(item.correct);
  });
  return Object.entries(groups).map(([id, arr]) => ({
    wordId: id,
    correct: arr.filter(Boolean).length / arr.length >= 0.5,
  }));
}

async function showResults() {
  TTS.cancel();
  showPage('pg-results');

  let saveRes;
  if (curSessionType === 'dial') {
    saveRes = curMode === 'dial-order'
      ? dialItemRes.map(r => ({ wordId: r.dialogueId, correct: r.correct }))
      : aggregateToGroup(dialItemRes, 'dialogueId');
  } else if (curSessionType === 'pat') {
    saveRes = aggregateToGroup(patItemRes, 'patternId');
  } else {
    saveRes = sessionRes;
  }

  const correct = saveRes.filter(r => r.correct).length;
  const wrong   = saveRes.length - correct;
  const pct     = saveRes.length > 0 ? Math.round(correct / saveRes.length * 100) : 0;

  document.getElementById('res-correct').textContent = correct;
  document.getElementById('res-wrong').textContent   = wrong;

  const [emoji, title, sub] =
    pct >= 90 ? ['🎉', '太棒了！',    '幾乎全對，繼續保持！'] :
    pct >= 70 ? ['😊', '不錯喔！',    '再多練習幾次就完美了'] :
    pct >= 50 ? ['💪', '繼續加油！',  '多複習幾次你就能記住'] :
                ['😅', '需要多練習', '沒關係，重新再來一次！'];

  document.getElementById('res-emoji').textContent = emoji;
  document.getElementById('res-title').textContent = title;
  document.getElementById('res-sub').textContent   = `${sub}（答對率 ${pct}%）`;

  try {
    await DB.saveSessionResults(lang, saveRes, progressMap);
  } catch {
    toast('進度儲存失敗');
  }
}

// ── Dialogue mode entry ──────────────────────────────────────────────────────

function buildDialLines() {
  return curDialogues.flatMap(d =>
    (d.lines || []).map(l => ({
      ...l, dialogueId: d.id, dialogueTitle: d.title || '',
    }))
  );
}

function startDialogueMode(mode) {
  curMode        = mode;
  curSessionType = 'dial';
  dialIdx        = 0;
  dialItemRes    = [];

  const setTitle = id => { document.getElementById(id).textContent = curLessonName; };

  if (mode === 'dial-read') {
    dialItems   = shuffle(buildDialLines());
    dialFlipped = false;
    setTitle('dr-lesson-title');
    showPage('pg-dial-read');
    renderDialRead();

  } else if (mode === 'dial-fill') {
    dialItems = shuffle(buildDialLines());
    setTitle('df-lesson-title');
    showPage('pg-dial-fill');
    renderDialFill();

  } else if (mode === 'dial-order') {
    dialItems = shuffle([...curDialogues]);
    setTitle('do-lesson-title');
    showPage('pg-dial-order');
    renderDialOrder();

  } else if (mode === 'dial-cloze') {
    dialItems = buildClozeItems();
    if (!dialItems.length) { toast('無法建立克漏字題目'); return; }
    setTitle('dc-lesson-title');
    showPage('pg-dial-cloze');
    renderDialCloze();
  }
}

// ── Dialogue: 逐行閱讀 ────────────────────────────────────────────────────────

function renderDialRead() {
  dialFlipped = false;
  const item    = dialItems[dialIdx];
  const correct = dialItemRes.filter(r => r.correct).length;
  updateStudyHdr('dr', dialIdx, dialItems.length, correct, '行');

  document.getElementById('dr-meta').textContent =
    `對話：${item.dialogueTitle || '未命名'}`;

  document.getElementById('dr-hint').textContent = '點擊看台詞';
  document.getElementById('dr-zh').textContent   = item.zh || '';
  ['dr-speaker','dr-text','dr-phonetic','dr-tts'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('dr-answer-row').style.display = 'none';
}

function dialReadFlip() {
  if (dialFlipped) return;
  dialFlipped = true;
  const item = dialItems[dialIdx];
  const card = document.getElementById('dr-card');
  card.style.transition = 'opacity 0.12s';
  card.style.opacity    = '0.6';
  setTimeout(() => {
    card.style.opacity = '1';
    document.getElementById('dr-hint').textContent = '你記得嗎？';
    const sp = document.getElementById('dr-speaker');
    sp.textContent   = item.speaker || '';
    sp.style.display = '';
    const tx = document.getElementById('dr-text');
    tx.textContent   = item.text || '';
    tx.style.display = '';
    if (item.phonetic) {
      const ph = document.getElementById('dr-phonetic');
      ph.textContent   = item.phonetic;
      ph.style.display = '';
    }
    document.getElementById('dr-tts').style.display        = '';
    document.getElementById('dr-answer-row').style.display = '';
    if (TTS.isEnabled() && item.text) TTS.speak(item.text, lang);
  }, 120);
}

function drPlayTTS() {
  const item = dialItems[dialIdx];
  if (item?.text) TTS.speak(item.text, lang);
}

function dialReadMark(correct) {
  dialItemRes.push({ dialogueId: dialItems[dialIdx].dialogueId, correct });
  dialIdx++;
  if (dialIdx >= dialItems.length) showResults();
  else renderDialRead();
}

// ── Dialogue: 聆聽填空 ────────────────────────────────────────────────────────

function renderDialFill() {
  const item    = dialItems[dialIdx];
  const correct = dialItemRes.filter(r => r.correct).length;
  updateStudyHdr('df', dialIdx, dialItems.length, correct, '題');

  const container = document.getElementById('df-choices');
  container.innerHTML = '';

  const others      = dialItems.filter((_, i) => i !== dialIdx);
  const distractors = shuffle(others).slice(0, 3);
  const choices     = shuffle([item, ...distractors]);

  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className   = 'mcq-choice';
    btn.textContent = choice.zh || '';
    btn.addEventListener('click', () => dfAnswer(btn, choice === item));
    container.appendChild(btn);
  });

  if (TTS.isEnabled() && item.text) setTimeout(() => TTS.speak(item.text, lang), 300);
}

function dfPlayTTS() {
  const item = dialItems[dialIdx];
  if (item?.text) TTS.speak(item.text, lang);
}

function dfAnswer(btn, correct) {
  document.querySelectorAll('#df-choices .mcq-choice').forEach(b => b.disabled = true);
  dialItemRes.push({ dialogueId: dialItems[dialIdx].dialogueId, correct });
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    const correctZh = dialItems[dialIdx].zh;
    document.querySelectorAll('#df-choices .mcq-choice').forEach(b => {
      if (b.textContent === correctZh) b.classList.add('correct');
    });
  }
  setTimeout(() => {
    dialIdx++;
    if (dialIdx >= dialItems.length) showResults();
    else renderDialFill();
  }, 1000);
}

// ── Dialogue: 排序對話 ────────────────────────────────────────────────────────

function renderDialOrder() {
  const dial    = dialItems[dialIdx];
  const correct = dialItemRes.filter(r => r.correct).length;
  updateStudyHdr('do', dialIdx, dialItems.length, correct, '段');

  document.getElementById('do-meta').textContent =
    `對話：${dial.title || dial.dialogueTitle || `第 ${dialIdx + 1} 段`}`;

  const lines = dial.lines || [];
  dialOrderPlaced = [];
  dialOrderAvail  = shuffle(lines.map((l, i) => ({ ...l, origIdx: i })));

  document.getElementById('do-feedback').style.display = 'none';
  renderDialOrderTiles();
}

function renderDialOrderTiles() {
  const placedEl = document.getElementById('do-placed');
  const availEl  = document.getElementById('do-available');

  placedEl.innerHTML = '';
  dialOrderPlaced.forEach((line, i) => {
    const tile = document.createElement('div');
    tile.className   = 'order-tile';
    const numSpan = document.createElement('span');
    numSpan.className   = 'order-tile-num';
    numSpan.textContent = `${i + 1}.`;
    tile.appendChild(numSpan);
    tile.appendChild(document.createTextNode(escLine(line)));
    tile.addEventListener('click', () => doRemove(i));
    placedEl.appendChild(tile);
  });

  availEl.innerHTML = '';
  dialOrderAvail.forEach((line, i) => {
    const tile = document.createElement('div');
    tile.className   = 'order-tile';
    tile.textContent = escLine(line);
    tile.addEventListener('click', () => doPlace(i));
    availEl.appendChild(tile);
  });
}

function escLine(line) {
  return `${line.speaker || ''}: ${line.zh || ''}`;
}

function doPlace(i) {
  dialOrderPlaced.push(dialOrderAvail.splice(i, 1)[0]);
  renderDialOrderTiles();
}

function doRemove(i) {
  dialOrderAvail.push(dialOrderPlaced.splice(i, 1)[0]);
  renderDialOrderTiles();
}

function doUndo() {
  if (!dialOrderPlaced.length) return;
  doRemove(dialOrderPlaced.length - 1);
}

function doConfirm() {
  const dial  = dialItems[dialIdx];
  const lines = dial.lines || [];
  if (dialOrderPlaced.length !== lines.length) {
    toast('請排列所有台詞');
    return;
  }
  const correct = dialOrderPlaced.every((line, i) => line.origIdx === i);
  dialItemRes.push({ dialogueId: dial.id || dial.dialogueId, correct });

  const fb = document.getElementById('do-feedback');
  fb.style.display = '';
  fb.className     = `spell-feedback ${correct ? 'ok' : 'bad'}`;
  fb.textContent   = correct ? '✓ 順序正確！' : '✗ 順序有誤';

  setTimeout(() => {
    dialIdx++;
    if (dialIdx >= dialItems.length) showResults();
    else renderDialOrder();
  }, 1300);
}

// ── Dialogue: 克漏字 ──────────────────────────────────────────────────────────

function buildClozeItems() {
  const allLines  = buildDialLines();
  const allTokens = allLines.flatMap(l => (l.text || '').split(' ').filter(Boolean));
  return allLines.map(line => {
    const tokens = (line.text || '').split(' ').filter(Boolean);
    if (tokens.length < 2) return null;
    const blankIdx    = Math.floor(Math.random() * tokens.length);
    const blankedWord = tokens[blankIdx];
    const display     = tokens.map((t, i) => i === blankIdx ? '___' : t).join(' ');
    const others      = shuffle(allTokens.filter(t => t !== blankedWord));
    const choices     = shuffle([blankedWord, ...others.slice(0, 3)]);
    return { ...line, displayText: display, blankedWord, choices };
  }).filter(Boolean);
}

function renderDialCloze() {
  const item    = dialItems[dialIdx];
  const correct = dialItemRes.filter(r => r.correct).length;
  updateStudyHdr('dc', dialIdx, dialItems.length, correct, '題');

  const card = document.getElementById('dc-card');
  card.innerHTML = `
    <div class="cloze-speaker">${esc(item.speaker)}</div>
    <div class="cloze-text">${esc(item.displayText).replace('___', '<span class="cloze-blank">___</span>')}</div>
    <div class="cloze-zh">${esc(item.zh)}</div>
  `;

  const container = document.getElementById('dc-choices');
  container.innerHTML = '';
  item.choices.forEach(word => {
    const btn = document.createElement('button');
    btn.className   = 'mcq-choice';
    btn.textContent = word;
    btn.addEventListener('click', () => dcAnswer(btn, word === item.blankedWord));
    container.appendChild(btn);
  });
}

function dcAnswer(btn, correct) {
  document.querySelectorAll('#dc-choices .mcq-choice').forEach(b => b.disabled = true);
  dialItemRes.push({ dialogueId: dialItems[dialIdx].dialogueId, correct });
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    const correctWord = dialItems[dialIdx].blankedWord;
    document.querySelectorAll('#dc-choices .mcq-choice').forEach(b => {
      if (b.textContent === correctWord) b.classList.add('correct');
    });
  }
  setTimeout(() => {
    dialIdx++;
    if (dialIdx >= dialItems.length) showResults();
    else renderDialCloze();
  }, 1000);
}

// ── Pattern mode entry ───────────────────────────────────────────────────────

function buildPatExamples() {
  return curPatterns.flatMap(p =>
    (p.examples || []).map(ex => ({ ...ex, patternId: p.id, pattern: p.pattern }))
  );
}

function startPatternMode(mode) {
  curMode        = mode;
  curSessionType = 'pat';
  patIdx         = 0;
  patItemRes     = [];

  const setTitle = id => { document.getElementById(id).textContent = curLessonName; };

  if (mode === 'pat-fc') {
    patItems   = shuffle(buildPatExamples());
    patFlipped = false;
    setTitle('pf-lesson-title');
    showPage('pg-pat-fc');
    renderPatFc();

  } else if (mode === 'pat-fill') {
    patItems = buildPatFillItems();
    if (!patItems.length) { toast('無法建立填空題'); return; }
    setTitle('pfill-lesson-title');
    showPage('pg-pat-fill');
    renderPatFill();

  } else if (mode === 'pat-zh2f') {
    patItems = shuffle(buildPatExamples());
    setTitle('pz-lesson-title');
    showPage('pg-pat-zh2f');
    renderPatZh2f();

  } else if (mode === 'pat-order') {
    patItems = shuffle(buildPatExamples().filter(ex => ex.text && ex.text.includes(' ')));
    if (!patItems.length) { toast('例句字數太少，無法排列'); return; }
    setTitle('po-lesson-title');
    showPage('pg-pat-order');
    renderPatOrder();
  }
}

// ── Pattern: 例句閃卡 ─────────────────────────────────────────────────────────

function renderPatFc() {
  patFlipped = false;
  const item    = patItems[patIdx];
  const correct = patItemRes.filter(r => r.correct).length;
  updateStudyHdr('pf', patIdx, patItems.length, correct, '張');

  document.getElementById('pf-hint').textContent   = '點擊看例句';
  document.getElementById('pf-zh').textContent      = item.zh || '';
  ['pf-text','pf-pattern','pf-tts'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('pf-answer-row').style.display = 'none';
}

function patFcFlip() {
  if (patFlipped) return;
  patFlipped = true;
  const item = patItems[patIdx];
  const card = document.getElementById('pf-card');
  card.style.transition = 'opacity 0.12s';
  card.style.opacity    = '0.6';
  setTimeout(() => {
    card.style.opacity = '1';
    document.getElementById('pf-hint').textContent = '你記得嗎？';
    const tx = document.getElementById('pf-text');
    tx.textContent   = item.text || '';
    tx.style.display = '';
    const pt = document.getElementById('pf-pattern');
    pt.textContent   = item.pattern || '';
    pt.style.display = item.pattern ? '' : 'none';
    document.getElementById('pf-tts').style.display        = '';
    document.getElementById('pf-answer-row').style.display = '';
    if (TTS.isEnabled() && item.text) TTS.speak(item.text, lang);
  }, 120);
}

function pfPlayTTS() {
  const item = patItems[patIdx];
  if (item?.text) TTS.speak(item.text, lang);
}

function patFcMark(correct) {
  patItemRes.push({ patternId: patItems[patIdx].patternId, correct });
  patIdx++;
  if (patIdx >= patItems.length) showResults();
  else renderPatFc();
}

// ── Pattern: 替換填空 ─────────────────────────────────────────────────────────

function buildPatFillItems() {
  const allSlots = curPatterns.flatMap(p =>
    (p.slots || []).map(s => ({ word: s.word, zh: s.zh, patternId: p.id }))
  );
  return shuffle(curPatterns.flatMap(pat => {
    const slots = pat.slots || [];
    if (!slots.length) return [];
    return slots.map(slot => {
      const others    = allSlots.filter(s => s.word !== slot.word);
      const distractors = shuffle(others).slice(0, 3).map(s => s.word);
      const choices   = shuffle([slot.word, ...distractors]);
      return {
        patternId:   pat.id,
        pattern:     pat.pattern || '',
        explanation: pat.explanation || '',
        slotZh:      slot.zh || '',
        slotWord:    slot.word,
        choices,
      };
    });
  }));
}

function renderPatFill() {
  const item    = patItems[patIdx];
  const correct = patItemRes.filter(r => r.correct).length;
  updateStudyHdr('pfill', patIdx, patItems.length, correct, '題');

  const frame = document.getElementById('pfill-frame');
  frame.innerHTML = `
    <div class="pat-frame-text">${esc(item.pattern)}</div>
    ${item.explanation ? `<div class="pat-frame-expl">${esc(item.explanation)}</div>` : ''}
    <div class="pat-sentence">選出「<strong>${esc(item.slotZh)}</strong>」的說法：</div>
  `;

  const container = document.getElementById('pfill-choices');
  container.innerHTML = '';
  item.choices.forEach(word => {
    const btn = document.createElement('button');
    btn.className   = 'mcq-choice';
    btn.textContent = word;
    btn.addEventListener('click', () => pfillAnswer(btn, word === item.slotWord));
    container.appendChild(btn);
  });
}

function pfillAnswer(btn, correct) {
  document.querySelectorAll('#pfill-choices .mcq-choice').forEach(b => b.disabled = true);
  patItemRes.push({ patternId: patItems[patIdx].patternId, correct });
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    const correctWord = patItems[patIdx].slotWord;
    document.querySelectorAll('#pfill-choices .mcq-choice').forEach(b => {
      if (b.textContent === correctWord) b.classList.add('correct');
    });
  }
  setTimeout(() => {
    patIdx++;
    if (patIdx >= patItems.length) showResults();
    else renderPatFill();
  }, 1000);
}

// ── Pattern: 中翻外文 ─────────────────────────────────────────────────────────

function renderPatZh2f() {
  const item    = patItems[patIdx];
  const correct = patItemRes.filter(r => r.correct).length;
  updateStudyHdr('pz', patIdx, patItems.length, correct, '題');

  document.getElementById('pz-zh').textContent = item.zh || '';

  const others      = patItems.filter((_, i) => i !== patIdx);
  const distractors = shuffle(others).slice(0, 3);
  const choices     = shuffle([item, ...distractors]);

  const container = document.getElementById('pz-choices');
  container.innerHTML = '';
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className   = 'mcq-choice';
    btn.textContent = choice.text || '';
    btn.addEventListener('click', () => pzAnswer(btn, choice === item));
    container.appendChild(btn);
  });
}

function pzAnswer(btn, correct) {
  document.querySelectorAll('#pz-choices .mcq-choice').forEach(b => b.disabled = true);
  patItemRes.push({ patternId: patItems[patIdx].patternId, correct });
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    const correctText = patItems[patIdx].text;
    document.querySelectorAll('#pz-choices .mcq-choice').forEach(b => {
      if (b.textContent === correctText) b.classList.add('correct');
    });
  }
  setTimeout(() => {
    patIdx++;
    if (patIdx >= patItems.length) showResults();
    else renderPatZh2f();
  }, 1000);
}

// ── Pattern: 造句排列 ─────────────────────────────────────────────────────────

function renderPatOrder() {
  const item    = patItems[patIdx];
  const correct = patItemRes.filter(r => r.correct).length;
  updateStudyHdr('po', patIdx, patItems.length, correct, '題');

  document.getElementById('po-zh').textContent = item.zh || '';

  const words     = (item.text || '').split(' ').filter(Boolean);
  patOrderPlaced  = [];
  patOrderAvail   = shuffle(words.map((w, i) => ({ w, origIdx: i })));

  document.getElementById('po-feedback').style.display = 'none';
  renderPatOrderTiles();
}

function renderPatOrderTiles() {
  const placedEl = document.getElementById('po-placed');
  const availEl  = document.getElementById('po-available');

  placedEl.innerHTML = '';
  patOrderPlaced.forEach((item, i) => {
    const tile = document.createElement('div');
    tile.className   = 'order-tile';
    tile.textContent = item.w;
    tile.addEventListener('click', () => poRemove(i));
    placedEl.appendChild(tile);
  });

  availEl.innerHTML = '';
  patOrderAvail.forEach((item, i) => {
    const tile = document.createElement('div');
    tile.className   = 'order-tile';
    tile.textContent = item.w;
    tile.addEventListener('click', () => poPlace(i));
    availEl.appendChild(tile);
  });
}

function poPlace(i) {
  patOrderPlaced.push(patOrderAvail.splice(i, 1)[0]);
  renderPatOrderTiles();
}

function poRemove(i) {
  patOrderAvail.push(patOrderPlaced.splice(i, 1)[0]);
  renderPatOrderTiles();
}

function poUndo() {
  if (!patOrderPlaced.length) return;
  poRemove(patOrderPlaced.length - 1);
}

function poConfirm() {
  const item  = patItems[patIdx];
  const words = (item.text || '').split(' ').filter(Boolean);
  if (patOrderPlaced.length !== words.length) {
    toast('請排列所有詞語');
    return;
  }
  const correct = patOrderPlaced.every((p, i) => p.origIdx === i);
  patItemRes.push({ patternId: item.patternId, correct });

  const fb = document.getElementById('po-feedback');
  fb.style.display = '';
  fb.className     = `spell-feedback ${correct ? 'ok' : 'bad'}`;
  fb.textContent   = correct ? `✓ 正確！${item.text}` : `✗ 正確順序：${item.text}`;

  if (TTS.isEnabled() && item.text) TTS.speak(item.text, lang);

  setTimeout(() => {
    patIdx++;
    if (patIdx >= patItems.length) showResults();
    else renderPatOrder();
  }, 1400);
}

// ── Init ─────────────────────────────────────────────────────────────────────

navToLevels();
