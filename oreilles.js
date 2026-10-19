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
  let noise = 0.004, speaking = false, voiced = 0, silent = 0, buf = [], pre = [], peak = 0, frames = 0;
  let level = 0, threshold = 0.012, lastHeard = '', lastPrint = null;
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

  // À appeler pendant un geste du doigt : crée/réveille l'audio (sinon le téléphone le laisse en pause)
  function prime() {
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  async function openMic() {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!ctx) ctx = new AC();
      src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(2048, 1, 1); // petits morceaux (~45 ms) : il réagit plus vite
      src.connect(proc);
      proc.connect(ctx.destination); // sortie muette, nécessaire pour que le micro « tourne »
      proc.onaudioprocess = e => onAudio(e.inputBuffer.getChannelData(0));
    }
    if (ctx.state === 'suspended') await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 1500))]);
  }
  function closeMic() {
    if (proc) proc.disconnect();
    if (src) src.disconnect();
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = proc = src = null;
  }

  /* ---------- détecteur de voix (sur l'appareil) ---------- */
  function onAudio(f) {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    level = rms;
    const now = performance.now();
    // le bruit de la pièce s'apprend vite au début, puis doucement
    const alpha = ++frames < 40 ? 0.15 : 0.03;
    if (muted || now < muteUntil || !pending || pending.busy) {
      if (!speaking) noise = noise * (1 - alpha) + rms * alpha;
      pre = []; buf = []; speaking = false; voiced = 0;
      return;
    }
    // la toute première seconde : il écoute juste le bruit de la pièce, pour l'apprendre
    if (frames < 25) { noise = noise * (1 - alpha) + rms * alpha; return; }
    const ds = downsample(f, ctx.sampleRate);
    const [min, k] = SENS[S.settings.micSens] || SENS.haute;
    const on = Math.max(noise * k, min), off = Math.max(noise * (k * 0.66), min * 0.66);
    threshold = on;
    if (!speaking) {
      pre.push(ds);
      if (pre.length > 10) pre.shift(); // ~0,45 s gardées avant le début, pour ne pas couper la 1re lettre
      if (rms > on) {
        if (++voiced >= 3) { speaking = true; silent = 0; peak = rms; buf = [...pre]; emit('speech'); }
      } else {
        voiced = 0;
        noise = noise * (1 - alpha) + rms * alpha;
        if (now > pending.deadline) finish('');
      }
      return;
    }
    buf.push(ds);
    peak = Math.max(peak, rms);
    // « silence » = sous le seuil, OU bien plus faible que la voix qu'on vient d'entendre
    // (sinon un ventilateur ou une télé le faisaient attendre jusqu'à 20 secondes)
    silent = (rms < off || rms < peak * 0.18) ? silent + 1 : 0;
    const dur = (buf.length * f.length) / ctx.sampleRate;
    // Fin de la phrase après un silence : 1,2 s d'habitude, 2,2 s quand on épelle (pauses entre les lettres)
    const endFrames = Math.round((pending.endSilence * ctx.sampleRate) / f.length);
    if (silent >= endFrames || dur > 12) {
      const audio = buf;
      const speech = dur - (silent * f.length) / ctx.sampleRate;
      buf = []; speaking = false; voiced = 0;
      emit('speechend');
      if (speech > 0.15 && worthSending(speech)) transcribe(audio);
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
  // Quand il attend son nom, il n'envoie pas tout à Groq : seulement les phrases courtes
  // (« Shadow ! », « Shadow, on joue ? ») et pas plus de 8 par minute. La télé et les longues
  // conversations d'adultes ne partent plus, ce qui économise la limite gratuite de Groq.
  const cheapSent = [];
  function worthSending(speech) {
    if (!pending || !pending.cheap) return true;
    if (speech > 4.5) return false;
    const now = performance.now();
    while (cheapSent.length && now - cheapSent[0] > 60000) cheapSent.shift();
    if (cheapSent.length >= 8) return false;
    cheapSent.push(now);
    return true;
  }
  async function transcribe(audio) {
    const p = pending;
    if (!p) return;
    p.busy = true;
    emit('thinking');
    // empreinte de la voix, calculée sur l'appareil (jamais envoyée)
    try { lastPrint = (typeof VOIX !== 'undefined') ? VOIX.print(audio) : null; } catch (e) { lastPrint = null; }
    try {
      const t = await AI.transcribe(wav(audio), p.prompt);
      if (pending !== p) return;
      p.busy = false;
      lastHeard = t.trim() || '(rien compris)';
      if (t.trim()) finish(t.trim()); else p.deadline = performance.now() + 8000; // bruit : on réécoute un peu
    } catch (e) {
      if (pending === p) finish({ error: e.message, status: e.status || 0, retryAfter: e.retryAfter || 0, net: !!e.net });
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
      // pas de réseau et pas de reconnaissance « hors connexion » sur ce téléphone
      else if ((e.error === 'network' || e.error === 'language-not-supported') && pending === p) { rec = null; finish({ error: e.error, net: true }); }
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
  function listen({ prompt = '', maxWait = 20000, endSilence = 0.9, cheap = false } = {}) {
    if (pending) finish(null);
    return new Promise(resolve => {
      const p = { resolve, prompt, endSilence, cheap, deadline: performance.now() + maxWait, busy: false };
      pending = p;
      if (!engine) return finish({ error: 'no-ears' });
      if (engine === 'chrome') chromeListen(p);
      else {
        // Le téléphone peut mettre le son en pause : on le réveille…
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        // …et une minuterie garantit qu'il n'attend jamais pour toujours
        const guardTimer = () => {
          if (pending !== p) return;
          if (!p.busy && !speaking && performance.now() > p.deadline + 500) return finish('');
          if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
          setTimeout(guardTimer, 1000);
        };
        setTimeout(guardTimer, 1000);
      }
    });
  }
  function cancel() { if (rec) { const r = rec; rec = null; r.abort(); } finish(null); }
  // Pendant que Shadow parle, il ne s'écoute pas lui-même
  function mute(on) {
    muted = on;
    if (on && rec) { const r = rec; rec = null; r.abort(); }
    if (!on) muteUntil = performance.now() + 350; // le temps que l'écho de sa voix s'éteigne
  }

  return {
    start, prime, listen, cancel, mute,
    engine: () => engine,
    listening: () => !!pending,
    meter: () => ({ level, threshold, noise, lastHeard, speaking }),
    takePrint: () => { const p = lastPrint; lastPrint = null; return p; },
    hearing: () => speaking || !!(pending && pending.busy),
    on: (ev, fn) => handlers[ev].push(fn),
  };
})();
