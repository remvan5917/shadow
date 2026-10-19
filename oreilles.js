/* =========================================================
   SHADOW — les oreilles : on lui parle directement, sans toucher l'écran.
   Deux moteurs :
   - « whisper » : le micro reste ouvert. Shadow repère TOUT SEUL, sur
     l'appareil, quand quelqu'un parle, puis envoie seulement ce petit
     morceau de voix à Groq qui le transforme en texte. Pas de bip.
   - « chrome » : la reconnaissance vocale intégrée à Chrome (le son part
     chez Google). Sert de secours sans clé Groq.
   ========================================================= */
'use strict';

const OREILLES = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const AC = window.AudioContext || window.webkitAudioContext;
  const RATE = 16000;
  let engine = null;
  let ctx = null, stream = null, proc = null, src = null;
  let muted = false, muteUntil = 0;
  let noise = 0.01, speaking = false, voiced = 0, silent = 0, buf = [], pre = [];
  let level = 0, threshold = 0.012, lastHeard = '';
  // Sensibilité du micro (réglage de papa) : seuil minimum et marge au-dessus du bruit de la pièce
  const SENS = { normal: [0.012, 3], haute: [0.007, 2.5], max: [0.004, 2] };
  let pending = null; // la demande d'écoute en cours
  let rec = null;
  const handlers = { thinking: [], speech: [], speechend: [] };
  const emit = ev => handlers[ev].forEach(fn => fn());

  function choose() {
    const pref = S.settings.ears || 'auto';
    const canW = AI.canTranscribe() && !!AC;
    if (pref === 'whisper') return canW ? 'whisper' : (SR ? 'chrome' : null);
    if (pref === 'chrome') return SR ? 'chrome' : (canW ? 'whisper' : null);
    return canW ? 'whisper' : (SR ? 'chrome' : null);
  }

  async function start() {
    engine = choose();
    if (engine === 'whisper') {
      try { await openMic(); } catch (e) { engine = SR ? 'chrome' : null; if (!engine) throw e; }
    } else closeMic();
    return engine;
  }

  async function openMic() {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      ctx = new AC();
      src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      src.connect(proc);
      proc.connect(ctx.destination); // sortie muette, nécessaire pour que le micro « tourne »
      proc.onaudioprocess = e => onAudio(e.inputBuffer.getChannelData(0));
    }
    if (ctx.state === 'suspended') await ctx.resume();
  }
  function closeMic() {
    if (proc) proc.disconnect();
    if (src) src.disconnect();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ctx) ctx.close().catch(() => {});
    ctx = stream = proc = src = null;
  }

  /* ---------- détecteur de voix (sur l'appareil) ---------- */
  function onAudio(f) {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    level = rms;
    const now = performance.now();
    if (muted || now < muteUntil || !pending || pending.busy) {
      if (!speaking) noise = noise * 0.95 + rms * 0.05;
      pre = []; buf = []; speaking = false; voiced = 0;
      return;
    }
    const ds = downsample(f, ctx.sampleRate);
    const [min, k] = SENS[S.settings.micSens] || SENS.haute;
    const on = Math.max(noise * k, min), off = Math.max(noise * (k * 0.66), min * 0.66);
    threshold = on;
    if (!speaking) {
      pre.push(ds);
      if (pre.length > 5) pre.shift(); // ~0,4 s gardées avant le début, pour ne pas couper la 1re lettre
      if (rms > on) {
        if (++voiced >= 2) { speaking = true; silent = 0; buf = [...pre]; emit('speech'); }
      } else {
        voiced = 0;
        noise = noise * 0.95 + rms * 0.05;
        if (now > pending.deadline) finish('');
      }
      return;
    }
    buf.push(ds);
    silent = rms < off ? silent + 1 : 0;
    const dur = (buf.length * f.length) / ctx.sampleRate;
    // Fin de la phrase après un silence : 1,2 s d'habitude, 2,2 s quand on épelle (pauses entre les lettres)
    const endFrames = Math.round((pending.endSilence * ctx.sampleRate) / f.length);
    if (silent >= endFrames || dur > 20) {
      const audio = buf;
      const speech = dur - (silent * f.length) / ctx.sampleRate;
      buf = []; speaking = false; voiced = 0;
      emit('speechend');
      if (speech > 0.15) transcribe(audio);
    }
  }
  function downsample(f, sr) {
    const ratio = sr / RATE, n = Math.floor(f.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = Math.floor(i * ratio), e = Math.max(s + 1, Math.floor((i + 1) * ratio));
      let acc = 0;
      for (let j = s; j < e; j++) acc += f[j];
      out[i] = acc / (e - s);
    }
    return out;
  }
  function wav(chunks) {
    const len = chunks.reduce((a, c) => a + c.length, 0);
    const b = new ArrayBuffer(44 + len * 2), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, len * 2, true);
    let o = 44;
    for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, c[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([b], { type: 'audio/wav' });
  }
  async function transcribe(audio) {
    const p = pending;
    if (!p) return;
    p.busy = true;
    emit('thinking');
    try {
      const t = await AI.transcribe(wav(audio), p.prompt);
      if (pending !== p) return;
      p.busy = false;
      lastHeard = t.trim() || '(rien compris)';
      if (t.trim()) finish(t.trim()); else p.deadline = performance.now() + 8000; // bruit : on réécoute un peu
    } catch (e) {
      if (pending === p) finish({ error: e.message });
    }
  }

  /* ---------- moteur Chrome ---------- */
  function chromeListen(p) {
    if (pending !== p) return;
    if (muted || performance.now() < muteUntil) { setTimeout(() => chromeListen(p), 200); return; }
    const r = new SR();
    rec = r;
    r.lang = 'fr-FR'; r.interimResults = false; r.continuous = false; r.maxAlternatives = 1;
    let got = '';
    r.onspeechstart = () => emit('speech');
    r.onresult = e => { got = [...e.results].map(x => x[0].transcript).join(' '); lastHeard = got; };
    r.onerror = e => {
      if ((e.error === 'not-allowed' || e.error === 'service-not-allowed') && pending === p) { rec = null; finish({ error: 'not-allowed' }); }
    };
    r.onend = () => {
      if (rec === r) rec = null;
      if (pending !== p) return;
      if (got.trim()) return finish(got.trim());
      if (performance.now() < p.deadline) setTimeout(() => chromeListen(p), 150); else finish('');
    };
    try { r.start(); } catch (e) { setTimeout(() => chromeListen(p), 300); }
  }

  /* ---------- ce que le reste de Shadow utilise ---------- */
  function finish(v) { const p = pending; pending = null; if (p) p.resolve(v); }
  // Écoute UNE phrase. Résout avec le texte, '' si personne n'a parlé, null si annulé, {error} en cas de souci.
  function listen({ prompt = '', maxWait = 20000, endSilence = 1.2 } = {}) {
    if (pending) finish(null);
    return new Promise(resolve => {
      const p = { resolve, prompt, endSilence, deadline: performance.now() + maxWait, busy: false };
      pending = p;
      if (!engine) return finish({ error: 'no-ears' });
      if (engine === 'chrome') chromeListen(p);
    });
  }
  function cancel() { if (rec) { const r = rec; rec = null; r.abort(); } finish(null); }
  // Pendant que Shadow parle, il ne s'écoute pas lui-même
  function mute(on) {
    muted = on;
    if (on && rec) { const r = rec; rec = null; r.abort(); }
    if (!on) muteUntil = performance.now() + 250;
  }

  return {
    start, listen, cancel, mute,
    engine: () => engine,
    listening: () => !!pending,
    meter: () => ({ level, threshold, noise, lastHeard, speaking }),
    hearing: () => speaking || !!(pending && pending.busy),
    on: (ev, fn) => handlers[ev].push(fn),
  };
})();
