// Polyglot learning app — 4 modes: flashcard / listening / quiz / spelling
const params   = new URLSearchParams(location.search);
const lang     = params.get('lang') || 'ko';
const langName = { ko: '韓語', vi: '越南語' }[lang] || lang;

document.body.classList.add(lang === 'ko' ? 'lang-ko' : 'lang-vi');
document.title = `Polyglot — ${langName}`;

// ── Global state ────────────────────────────────────────────────────────────
let curLevelId = null, curLevelName = '';
let curLessonId = null, curLessonName = '';
let curWords = [];       // shuffled word list for this session
let curIdx = 0;
let curMode = null;      // 'flashcard' | 'listening' | 'quiz' | 'spelling'
let sessionRes = [];     // [{wordId, correct}]
let progressMap = {};
let fcFlipped = false;
let spellInputMode = false;
let spellAvailable = [];
let spellSelected = [];

// ── Utilities ───────────────────────────────────────────────────────────────

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

function updateStudyHdr(prefix, idx, total, correct) {
  const pct = total > 0 ? Math.round(idx / total * 100) : 0;
  document.getElementById(`${prefix}-badge`).textContent      = `${idx + 1} / ${total}`;
  document.getElementById(`${prefix}-card-label`).textContent = `第 ${idx + 1} 張，共 ${total} 張`;
  document.getElementById(`${prefix}-score-label`).textContent= `答對 ${correct}`;
  document.getElementById(`${prefix}-fill`).style.width       = pct + '%';
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

  let words;
  try {
    words = await DB.getWords(lang, curLevelId, curLessonId);
  } catch (e) {
    toast('無法載入詞彙');
    return;
  }

  if (!words.length) {
    toast('此課程還沒有詞彙');
    return;
  }

  document.getElementById('modes-word-count').textContent = `${words.length} 詞`;

  // Disable MCQ modes if fewer than 4 words
  const needMCQ = words.length < 4;
  document.getElementById('mode-btn-listen').disabled = needMCQ;
  document.getElementById('mode-btn-quiz').disabled   = needMCQ;
  document.getElementById('mcq-min-notice').style.display = needMCQ ? '' : 'none';

  // Cache words for session
  progressMap = await DB.getAllProgress(lang);
  const unmastered = words.filter(w => (progressMap[w.id]?.stars || 0) < 3);
  const mastered   = words.filter(w => (progressMap[w.id]?.stars || 0) >= 3);
  curWords = [...shuffle(unmastered), ...shuffle(mastered)];
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

  ['fc-word', 'fc-phonetic', 'fc-notes', 'fc-tts'].forEach(id => {
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
    document.getElementById('fc-tts').style.display      = '';
    document.getElementById('fc-answer-row').style.display = '';

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
  curIdx     = 0;
  sessionRes = [];
  curWords   = shuffle(curWords);
  startMode(curMode);
}

// ── Results ──────────────────────────────────────────────────────────────────

async function showResults() {
  TTS.cancel();
  showPage('pg-results');

  const correct = sessionRes.filter(r => r.correct).length;
  const wrong   = sessionRes.length - correct;
  const pct     = sessionRes.length > 0 ? Math.round(correct / sessionRes.length * 100) : 0;

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
    await DB.saveSessionResults(lang, sessionRes, progressMap);
  } catch {
    toast('進度儲存失敗');
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

navToLevels();
