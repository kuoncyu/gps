/* 媒體（Batch 13）：音樂播放器（Provider）。可播放「本機音訊檔」或 Demo 合成音軌；網頁無法控制其他 App 的音樂。
   導航語音說話時自動降低音量（ducking）；導航語音靜音不影響音樂。接聽（模擬）來電時暫停、結束後恢復。 */
(function () {
  const A = window.AIGPS, S = A.State, KEY = 'aigps.media', DUCK = 0.25;
  const DEMO = [{ title: '測試音軌 1（合成音）', notes: [262, 330, 392, 523], tempo: 420, wave: 'sine' }, { title: '測試音軌 2（合成音）', notes: [392, 349, 330, 294], tempo: 520, wave: 'triangle' }, { title: '測試音軌 3（合成音）', notes: [220, 277, 330, 277], tempo: 360, wave: 'square' }].map(t => Object.assign({ source: 'demo' }, t));
  let source = 'demo', files = [], idx = 0, status = 'stopped', vol = 0.6, ducked = false, callPaused = false;
  try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && typeof p.volume === 'number') vol = Math.max(0, Math.min(1, p.volume)); } catch (_) {}
  const list = () => (source === 'files' && files.length ? files : DEMO), cur = () => list()[idx % list().length], level = () => (ducked ? vol * DUCK : vol);

  function browserEngine() {   // 瀏覽器實作：Demo 用 WebAudio 合成；本機檔案用 HTMLAudioElement
    let ac, gain, timer, audio, step = 0, lv = 0.6;
    const ensure = () => { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); gain = ac.createGain(); gain.connect(ac.destination); } if (ac.state === 'suspended') ac.resume(); gain.gain.value = lv; };
    return {
      start(t) {
        this.stop();
        if (t.source === 'file') { audio = new window.Audio(t.url); audio.volume = lv; audio.onended = () => api.next(); audio.play().catch(e => A.Log.warn('音訊播放失敗', String(e))); return; }
        ensure(); step = 0; const tick = () => { const o = ac.createOscillator(), g = ac.createGain(), now = ac.currentTime; o.type = t.wave; o.frequency.value = t.notes[step++ % t.notes.length]; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.5, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + t.tempo / 1000 * 0.9); o.connect(g); g.connect(gain); o.start(); o.stop(now + t.tempo / 1000); }; tick(); timer = setInterval(tick, t.tempo);
      },
      stop() { clearInterval(timer); timer = null; if (audio) { audio.onended = null; audio.pause(); audio = null; } },
      setGain(v) { lv = v; if (gain) gain.gain.value = v; if (audio) audio.volume = v; }
    };
  }
  let engine = typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined' ? browserEngine() : { start() {}, stop() {}, setGain() {} };

  function session() {
    const ms = window.navigator && window.navigator.mediaSession; if (!ms) return;
    try { const t = cur(); if (window.MediaMetadata) ms.metadata = new window.MediaMetadata({ title: t.title, artist: 'AI GPS' }); ms.playbackState = status === 'playing' ? 'playing' : 'paused'; } catch (_) {}
  }
  function sync() { const t = cur(); S.set({ media: { status, title: t.title, source: t.source, index: idx % list().length, count: list().length, volume: vol, ducked, demo: t.source === 'demo' } }); session(); }
  const startCur = () => { engine.start(cur()); engine.setGain(level()); };
  const res = () => ({ ok: true, title: cur().title, demo: cur().source === 'demo', status });

  const api = {
    name: 'Local Media（本機檔案／Demo 合成音）', isDemo: false, DUCK, caps: { controlOtherApps: false },
    state: () => S.get().media || { status, title: cur().title, source: cur().source, count: list().length, volume: vol, ducked },
    tracks: () => list().map((t, i) => ({ i, title: t.title, source: t.source })),
    play() { if (status !== 'playing') { status = 'playing'; startCur(); sync(); } return res(); },
    pause() { if (status === 'playing') { status = 'paused'; engine.stop(); sync(); } return res(); },
    toggle() { return status === 'playing' ? api.pause() : api.play(); },
    next() { idx = (idx + 1) % list().length; if (status === 'playing') startCur(); sync(); return res(); },
    prev() { idx = (idx - 1 + list().length) % list().length; if (status === 'playing') startCur(); sync(); return res(); },
    select(i) { idx = Math.max(0, Math.min(list().length - 1, i | 0)); status = 'playing'; startCur(); sync(); return res(); },
    setVolume(v) { vol = Math.max(0, Math.min(1, +v || 0)); engine.setGain(level()); try { localStorage.setItem(KEY, JSON.stringify({ volume: vol })); } catch (_) {} sync(); },
    duck(b) { b = !!b; if (ducked === b) return; ducked = b; engine.setGain(level()); sync(); },
    pauseForCall() { if (status === 'playing') { callPaused = true; api.pause(); } },
    resumeAfterCall() { if (callPaused) { callPaused = false; api.play(); } },
    loadFiles(fl) {
      const au = Array.from(fl || []).filter(f => /^audio\//.test(f.type) || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name)); if (!au.length) return { ok: false, message: '沒有可用的音訊檔案' };
      files.forEach(f => { try { URL.revokeObjectURL(f.url); } catch (_) {} }); files = au.map(f => ({ source: 'file', title: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) })); source = 'files'; idx = 0; if (status === 'playing') startCur(); sync(); return { ok: true, count: files.length };
    },
    useDemo() { source = 'demo'; idx = 0; if (status === 'playing') startCur(); sync(); }, _setEngine(e) { engine = e; }
  };
  A.Media = api; A.Providers.register('media', api);
  const ms = window.navigator && window.navigator.mediaSession;
  if (ms) [['play', api.play], ['pause', api.pause], ['nexttrack', api.next], ['previoustrack', api.prev]].forEach(([k, f]) => { try { ms.setActionHandler(k, () => f()); } catch (_) {} });
  if (A.Voice && A.Voice.onSpeaking) A.Voice.onSpeaking(b => api.duck(b));
  sync();
})();
