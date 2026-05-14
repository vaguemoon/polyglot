// Web Speech API wrapper for Korean and Vietnamese TTS
const TTS = (() => {
  const langCodes = { ko: 'ko-KR', vi: 'vi-VN' };
  let enabled = true;

  function speak(text, lang, onEnd) {
    if (!enabled || !text) { if (onEnd) onEnd(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = langCodes[lang] || lang;
    utt.rate = 0.9;
    utt.pitch = 1;
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  }

  function cancel() {
    window.speechSynthesis.cancel();
  }

  function setEnabled(val) { enabled = val; }
  function isEnabled() { return enabled; }

  return { speak, cancel, setEnabled, isEnabled };
})();
