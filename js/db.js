// Firestore CRUD for levels, lessons, words, dialogues, patterns, and progress
// Path: /languages/{lang}/levels/{lid}/lessons/{lid2}/words/{wid}
//       /languages/{lang}/levels/{lid}/lessons/{lid2}/dialogues/{did}  (lines stored as array)
//       /languages/{lang}/levels/{lid}/lessons/{lid2}/patterns/{pid}   (examples/slots as arrays)
// Progress: /languages/{lang}/progress/{id}  (works for word, dialogue, or pattern IDs)

const DB = (() => {
  function langRef(lang) {
    return db.collection('languages').doc(lang);
  }

  // ── Levels ────────────────────────────────────────────────────────
  async function getLevels(lang) {
    const snap = await langRef(lang).collection('levels').orderBy('order').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function addLevel(lang, name) {
    const levels = await getLevels(lang);
    const order = levels.length ? Math.max(...levels.map(l => l.order)) + 1 : 1;
    const ref = await langRef(lang).collection('levels').add({ name, order });
    return ref.id;
  }

  async function updateLevel(lang, levelId, data) {
    await langRef(lang).collection('levels').doc(levelId).update(data);
  }

  async function deleteLevel(lang, levelId) {
    // Delete all lessons and words inside
    const lessons = await getLessons(lang, levelId);
    for (const lesson of lessons) {
      await deleteLesson(lang, levelId, lesson.id);
    }
    await langRef(lang).collection('levels').doc(levelId).delete();
  }

  // ── Lessons ───────────────────────────────────────────────────────
  async function getLessons(lang, levelId) {
    const snap = await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').orderBy('order').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function addLesson(lang, levelId, name) {
    const lessons = await getLessons(lang, levelId);
    const order = lessons.length ? Math.max(...lessons.map(l => l.order)) + 1 : 1;
    const ref = await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').add({ name, order });
    return ref.id;
  }

  async function updateLesson(lang, levelId, lessonId, data) {
    await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').doc(lessonId).update(data);
  }

  async function deleteLesson(lang, levelId, lessonId) {
    const [words, dialogues, patterns] = await Promise.all([
      getWords(lang, levelId, lessonId),
      getDialogues(lang, levelId, lessonId),
      getPatterns(lang, levelId, lessonId),
    ]);
    const lessonBase = langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').doc(lessonId);
    for (const w of words)    await lessonBase.collection('words').doc(w.id).delete();
    for (const d of dialogues) await lessonBase.collection('dialogues').doc(d.id).delete();
    for (const p of patterns)  await lessonBase.collection('patterns').doc(p.id).delete();
    await lessonBase.delete();
  }

  // ── Words ─────────────────────────────────────────────────────────
  async function getWords(lang, levelId, lessonId) {
    const snap = await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').doc(lessonId)
      .collection('words').orderBy('order').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function addWord(lang, levelId, lessonId, wordData) {
    const words = await getWords(lang, levelId, lessonId);
    const order = words.length ? Math.max(...words.map(w => w.order || 0)) + 1 : 1;
    const ref = await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').doc(lessonId)
      .collection('words').add({ ...wordData, order });
    return ref.id;
  }

  async function updateWord(lang, levelId, lessonId, wordId, data) {
    await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').doc(lessonId)
      .collection('words').doc(wordId).update(data);
  }

  async function deleteWord(lang, levelId, lessonId, wordId) {
    await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').doc(lessonId)
      .collection('words').doc(wordId).delete();
  }

  // ── Dialogues ─────────────────────────────────────────────────────
  // Each dialogue doc: { title, order, lines: [{speaker, text, zh, phonetic, order}] }

  function lessonRef(lang, levelId, lessonId) {
    return langRef(lang).collection('levels').doc(levelId).collection('lessons').doc(lessonId);
  }

  async function getDialogues(lang, levelId, lessonId) {
    const snap = await lessonRef(lang, levelId, lessonId).collection('dialogues').orderBy('order').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function addDialogue(lang, levelId, lessonId, data) {
    const existing = await getDialogues(lang, levelId, lessonId);
    const order = existing.length ? Math.max(...existing.map(d => d.order)) + 1 : 1;
    const ref = await lessonRef(lang, levelId, lessonId).collection('dialogues').add({ ...data, order });
    return ref.id;
  }

  async function updateDialogue(lang, levelId, lessonId, dialogueId, data) {
    await lessonRef(lang, levelId, lessonId).collection('dialogues').doc(dialogueId).update(data);
  }

  async function deleteDialogue(lang, levelId, lessonId, dialogueId) {
    await lessonRef(lang, levelId, lessonId).collection('dialogues').doc(dialogueId).delete();
  }

  // ── Patterns ──────────────────────────────────────────────────────
  // Each pattern doc: { pattern, explanation, notes, order, examples: [{text, zh}], slots: [{word, zh}] }

  async function getPatterns(lang, levelId, lessonId) {
    const snap = await lessonRef(lang, levelId, lessonId).collection('patterns').orderBy('order').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function addPattern(lang, levelId, lessonId, data) {
    const existing = await getPatterns(lang, levelId, lessonId);
    const order = existing.length ? Math.max(...existing.map(p => p.order)) + 1 : 1;
    const ref = await lessonRef(lang, levelId, lessonId).collection('patterns').add({ ...data, order });
    return ref.id;
  }

  async function updatePattern(lang, levelId, lessonId, patternId, data) {
    await lessonRef(lang, levelId, lessonId).collection('patterns').doc(patternId).update(data);
  }

  async function deletePattern(lang, levelId, lessonId, patternId) {
    await lessonRef(lang, levelId, lessonId).collection('patterns').doc(patternId).delete();
  }

  // ── Progress ──────────────────────────────────────────────────────
  async function getProgress(lang, wordId) {
    const doc = await langRef(lang).collection('progress').doc(wordId).get();
    return doc.exists ? doc.data() : { stars: 0, correct: 0, wrong: 0, streak: 0 };
  }

  async function getAllProgress(lang) {
    const snap = await langRef(lang).collection('progress').get();
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    return map;
  }

  async function updateProgress(lang, wordId, data) {
    await langRef(lang).collection('progress').doc(wordId).set(data, { merge: true });
  }

  // Batch update progress after a study session
  // results: [{ wordId, correct: bool }]
  async function saveSessionResults(lang, results, progressMap) {
    const batch = db.batch();
    const now = new Date().toISOString();

    for (const { wordId, correct } of results) {
      const prev = progressMap[wordId] || { stars: 0, correct: 0, wrong: 0, streak: 0 };
      let { stars, correct: c, wrong: w, streak } = prev;

      if (correct) {
        c++;
        streak = (streak || 0) + 1;
        if (streak >= 2 && stars < 3) { stars++; streak = 0; }
      } else {
        w++;
        streak = 0;
        if (stars > 0) stars--;
      }

      const ref = langRef(lang).collection('progress').doc(wordId);
      batch.set(ref, { stars, correct: c, wrong: w, streak, lastStudied: now }, { merge: true });
    }

    await batch.commit();
  }

  return {
    getLevels, addLevel, updateLevel, deleteLevel,
    getLessons, addLesson, updateLesson, deleteLesson,
    getWords, addWord, updateWord, deleteWord,
    getDialogues, addDialogue, updateDialogue, deleteDialogue,
    getPatterns, addPattern, updatePattern, deletePattern,
    getProgress, getAllProgress, updateProgress, saveSessionResults
  };
})();
