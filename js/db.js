// Firestore CRUD for levels, lessons, words, and progress
// Path: /languages/{lang}/levels/{lid}/lessons/{lid2}/words/{wid}
// Progress: /languages/{lang}/progress/{wordId}

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
    const words = await getWords(lang, levelId, lessonId);
    for (const w of words) {
      await langRef(lang).collection('levels').doc(levelId)
        .collection('lessons').doc(lessonId)
        .collection('words').doc(w.id).delete();
    }
    await langRef(lang).collection('levels').doc(levelId)
      .collection('lessons').doc(lessonId).delete();
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
    getProgress, getAllProgress, updateProgress, saveSessionResults
  };
})();
