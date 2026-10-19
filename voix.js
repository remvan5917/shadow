/* =========================================================
   SHADOW — reconnaître les voix
   Calculé SUR L'APPAREIL. Pour chaque phrase entendue, Shadow calcule une
   « empreinte de voix » : quelques nombres qui décrivent le timbre (MFCC)
   et la hauteur de la voix. Jamais d'enregistrement : seulement ces nombres.
   C'est une reconnaissance simple : très fiable pour distinguer un enfant
   d'un adulte, correcte entre les quelques personnes d'une famille.
   ========================================================= */
'use strict';

const VOIX = (() => {
  const SR = 16000, N = 512, FRAME = 400, HOP = 160, NMEL = 26, NCEP = 13;

  /* ---------- outils de calcul ---------- */
  function fft(re, im) { // FFT radix-2 sur place
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  const hamming = new Float32Array(FRAME).map((_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  const mel = f => 2595 * Math.log10(1 + f / 700), imel = m => 700 * (Math.pow(10, m / 2595) - 1);
  const bank = (() => { // filtres « mel » triangulaires de 80 à 7600 Hz
    const lo = mel(80), hi = mel(7600), pts = [];
    for (let i = 0; i < NMEL + 2; i++) pts.push(Math.floor(((N + 1) * imel(lo + ((hi - lo) * i) / (NMEL + 1))) / SR));
    const out = [];
    for (let m = 1; m <= NMEL; m++) {
      const f = new Float32Array(N / 2 + 1);
      for (let k = pts[m - 1]; k < pts[m]; k++) f[k] = (k - pts[m - 1]) / Math.max(1, pts[m] - pts[m - 1]);
      for (let k = pts[m]; k < pts[m + 1]; k++) f[k] = (pts[m + 1] - k) / Math.max(1, pts[m + 1] - pts[m]);
      out.push(f);
    }
    return out;
  })();
  const dct = Array.from({ length: NCEP }, (_, c) => Float32Array.from({ length: NMEL }, (__, m) => Math.cos((Math.PI * c * (m + 0.5)) / NMEL)));
  const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

  /* ---------- l'empreinte d'une phrase ---------- */
  // chunks : morceaux de son à 16 kHz (ceux que les oreilles envoient à Whisper)
  function print(chunks) {
    const len = chunks.reduce((a, c) => a + c.length, 0);
    if (len < SR * 0.8) return null; // trop court pour reconnaître une voix
    const x = new Float32Array(len);
    let o = 0;
    for (const c of chunks) { x.set(c, o); o += c.length; }
    for (let i = x.length - 1; i > 0; i--) x[i] -= 0.97 * x[i - 1]; // pré-accentuation
    const frames = [];
    for (let s = 0; s + FRAME <= x.length; s += HOP) {
      let e = 0;
      for (let i = 0; i < FRAME; i++) e += x[s + i] * x[s + i];
      frames.push({ s, e });
    }
    if (frames.length < 30) return null;
    // on garde les morceaux où l'on parle : pas plus de ~15 dB sous le passage le plus fort
    const eMax = frames.reduce((m, f) => Math.max(m, f.e), 0);
    const keep = frames.filter(f => f.e > eMax * 0.03 && f.e > 1e-6);
    if (keep.length < 20) return null;
    const ceps = [], pitches = [];
    const re = new Float32Array(N), im = new Float32Array(N);
    for (const f of keep) {
      re.fill(0); im.fill(0);
      for (let i = 0; i < FRAME; i++) re[i] = x[f.s + i] * hamming[i];
      // hauteur de la voix (autocorrélation entre 70 et 500 Hz)
      let r0 = 0;
      for (let i = 0; i < FRAME; i++) r0 += re[i] * re[i];
      let bestLag = 0, bestR = 0;
      for (let lag = 32; lag <= 228; lag++) {
        let r = 0;
        for (let i = 0; i + lag < FRAME; i++) r += re[i] * re[i + lag];
        if (r > bestR) { bestR = r; bestLag = lag; }
      }
      if (bestLag && bestR / r0 > 0.35) pitches.push(SR / bestLag);
      fft(re, im);
      const logm = new Float32Array(NMEL);
      for (let m = 0; m < NMEL; m++) {
        let sum = 0;
        const b = bank[m];
        for (let k = 0; k <= N / 2; k++) if (b[k]) sum += b[k] * (re[k] * re[k] + im[k] * im[k]);
        logm[m] = Math.log(sum + 1e-10);
      }
      const c = new Float32Array(NCEP);
      for (let k = 0; k < NCEP; k++) { let s2 = 0; for (let m = 0; m < NMEL; m++) s2 += dct[k][m] * logm[m]; c[k] = s2; }
      ceps.push(c);
    }
    // moyenne et écart des coefficients 1 à 12 (le 0 dépend surtout du volume)
    const mean = [], std = [];
    for (let k = 1; k < NCEP; k++) {
      let m = 0;
      for (const c of ceps) m += c[k];
      m /= ceps.length;
      let v = 0;
      for (const c of ceps) v += (c[k] - m) * (c[k] - m);
      mean.push(+m.toFixed(3)); std.push(+Math.sqrt(v / ceps.length).toFixed(3));
    }
    const pitch = pitches.length >= 8 ? +Math.log2(median(pitches)).toFixed(3) : null;
    return { v: mean.concat(std), pitch, n: keep.length };
  }

  /* ---------- comparer deux empreintes ---------- */
  function dist(a, b) {
    let d = 0;
    for (let i = 0; i < a.v.length; i++) { const w = i < 12 ? 1 : 0.5; d += w * (a.v[i] - b.v[i]) * (a.v[i] - b.v[i]); }
    if (a.pitch !== null && b.pitch !== null) d += 64 * (a.pitch - b.pitch) * (a.pitch - b.pitch); // 1 octave d'écart = très différent
    return Math.sqrt(d);
  }
  const people = () => (S.voices = S.voices || []);
  function personDist(p, vp) {
    const ds = p.prints.map(x => dist(x, vp)).sort((a, b) => a - b);
    return (ds[0] + (ds[1] !== undefined ? ds[1] : ds[0])) / 2;
  }
  function threshold(prints) {
    let max = 0;
    for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) max = Math.max(max, dist(prints[i], prints[j]));
    return Math.max(max * 1.6, 6);
  }
  // Qui parle ? → { name, sure } ou null
  function identify(vp) {
    if (!vp) return null;
    const scored = people().map(p => ({ p, d: personDist(p, vp) })).sort((a, b) => a.d - b.d);
    if (!scored.length) return null;
    const best = scored[0], second = scored[1];
    if (best.d > best.p.thr) return null;
    if (second && second.d - best.d < best.d * 0.12) return null; // trop proche de deux personnes : on ne sait pas
    return { name: best.p.name, sure: best.d < best.p.thr * 0.6 };
  }
  function enroll(name, prints) {
    prints = prints.filter(Boolean);
    const list = people();
    let p = list.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!p) { p = { id: Date.now(), name, prints: [] }; list.push(p); }
    p.prints = p.prints.concat(prints).slice(-20);
    p.thr = threshold(p.prints);
    save();
    return p;
  }
  // Il affine la voix de quelqu'un qu'il connaît déjà (si l'empreinte lui ressemble)
  function learn(name, vp) {
    const p = people().find(x => x.name === name);
    if (!p || !vp || personDist(p, vp) > p.thr * 1.2) return false;
    p.prints.push(vp);
    if (p.prints.length > 20) p.prints.splice(3, 1); // on garde les 3 premières (celles de « apprends ma voix »)
    p.thr = threshold(p.prints);
    save();
    return true;
  }

  return { print, identify, enroll, learn, dist, people };
})();
