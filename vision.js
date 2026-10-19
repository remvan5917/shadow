/* =========================================================
   SHADOW — la vision (caméra : visages, expressions et objets)
   Tout est calculé SUR L'APPAREIL : aucune image ne quitte la tablette
   (sauf la « vision détaillée », que seul papa peut activer).
   Pour chaque personne apprise, on garde seulement une « empreinte »
   (128 nombres par photo mentale), jamais la photo.
   ========================================================= */
'use strict';

const VISION = (() => {
  const VER = '1.7.15';
  const LIB = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VER}/dist/face-api.js`;
  const MODELS = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VER}/model`;
  const MATCH = 0.5; // distance max pour dire « c'est la même personne »
  // Reconnaissance des objets (MediaPipe, sur l'appareil aussi)
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
  const OD_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
  let od = null, odLoading = null;

  let api = null, video = null, stream = null, on = false, loading = null, timer = null, frame = 0, opts = null, capturing = false;
  // Image éclaircie quand la pièce est sombre (les visages sont alors bien mieux trouvés)
  const probe = document.createElement('canvas'), work = document.createElement('canvas');
  probe.width = 32; probe.height = 24;
  let boost = 1, lastProbe = 0, learnAt = {};
  function source() {
    const now = performance.now();
    if (now - lastProbe > 2000) {
      lastProbe = now;
      try {
        const g = probe.getContext('2d');
        g.drawImage(video, 0, 0, 32, 24);
        const d = g.getImageData(0, 0, 32, 24).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        const lum = sum / (d.length / 4);
        boost = lum < 95 ? Math.min(2.2, 115 / Math.max(lum, 20)) : 1;
      } catch (e) { boost = 1; }
    }
    return prepared(rot);
  }
  // Image prête pour la détection : tournée si la caméra l'envoie « couchée », éclaircie si la pièce est sombre
  function prepared(r) {
    if (r === 0 && boost === 1) return video;
    const vw = video.videoWidth, vh = video.videoHeight, k = 480 / Math.max(vw, vh);
    const w0 = Math.round(vw * k), h0 = Math.round(vh * k);
    const swap = r === 90 || r === -90;
    const W = swap ? h0 : w0, H = swap ? w0 : h0;
    if (work.width !== W || work.height !== H) { work.width = W; work.height = H; }
    const g = work.getContext('2d');
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2, H / 2);
    g.rotate((r * Math.PI) / 180);
    g.filter = boost === 1 ? 'none' : `brightness(${boost.toFixed(2)}) contrast(1.15)`;
    g.drawImage(video, -w0 / 2, -h0 / 2, w0, h0);
    g.restore();
    return work;
  }
  // Téléphone tenu à l'horizontale : si personne n'est vu pendant un moment, on essaie l'image tournée
  let rot = 0, empty = 0, lastRotTry = -60000; // vérifie le sens dès le début
  // Compare les 4 sens de l'image et garde celui où les visages sont trouvés le plus sûrement
  async function findRotation(force) {
    const now = performance.now();
    if (!force && now - lastRotTry < 10000) return;
    lastRotTry = now;
    const score = async r => (await api.detectAllFaces(prepared(r), opts)).reduce((t, d) => t + d.score, 0);
    const cur = await score(rot);
    let bestR = rot, bestS = cur;
    for (const r of [0, 90, -90, 180]) {
      if (r === rot) continue;
      const sc = await score(r);
      if (sc > bestS) { bestS = sc; bestR = r; }
    }
    if (bestR !== rot && bestS > cur * 1.3 + 0.2) { rot = bestR; empty = 0; try { S.settings.camRot = rot; save(); } catch (e) { /* rien */ } }
  }
  const state = { faces: [], main: null };
  const handlers = { track: [], people: [] };
  const emit = (ev, data) => handlers[ev].forEach(fn => fn(data));

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.faceapi) return res();
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Impossible de charger mes yeux (pas de WiFi ?)'));
      document.head.appendChild(s);
    });
  }
  async function load() {
    if (api) return;
    await loadScript(LIB);
    api = window.faceapi;
    try { await api.tf.setBackend('webgl'); } catch (e) { /* le processeur fera le travail */ }
    await api.tf.ready();
    await Promise.all([
      api.nets.tinyFaceDetector.loadFromUri(MODELS),
      api.nets.faceLandmark68TinyNet.loadFromUri(MODELS),
      api.nets.faceRecognitionNet.loadFromUri(MODELS),
      api.nets.faceExpressionNet.loadFromUri(MODELS),
    ]);
    opts = new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.38 });
  }

  let withObjects = true;
  async function start(videoEl, o) {
    withObjects = !(o && o.objects === false);
    if (on) return;
    video = videoEl;
    loading = loading || load().catch(e => { loading = null; throw e; });
    await loading;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    on = true;
    rot = (S.settings && S.settings.camRot) || 0; // le bon sens de l'image, retenu la dernière fois
    tick();
    if (withObjects) loadObjects().catch(() => {}); // on prépare la reconnaissance des objets en avance
  }
  function stop() {
    on = false;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
    state.faces = []; state.main = null;
    emit('track', null);
    emit('people', []);
  }

  // ~5 fois par seconde : où est le visage (pour que Shadow le suive des yeux).
  // Une fois par seconde environ : qui est-ce, et quelle tête il fait.
  async function tick() {
    if (!on) return;
    const t0 = performance.now();
    try {
      if (!capturing && video.readyState >= 2 && video.videoWidth > 0) {
        frame++;
        if (frame % 6 === 0) await analyse(); else await track();
      }
    } catch (e) { /* image ratée, on continue */ }
    timer = setTimeout(tick, Math.max(60, 180 - (performance.now() - t0)));
  }
  async function track() {
    const src = source();
    const d = await api.detectSingleFace(src, opts);
    setMain(d && d.box, src);
  }
  function setMain(box, src) {
    if (!box) { state.main = null; emit('track', null); return; }
    const el = src || video;
    const w = el.videoWidth || el.width || 640, h = el.videoHeight || el.height || 480;
    state.main = { cx: ((box.x + box.width / 2) / w) * 2 - 1, cy: ((box.y + box.height / 2) / h) * 2 - 1, size: box.width / w };
    emit('track', state.main);
  }
  async function analyse() {
    const src = source();
    const res = await api.detectAllFaces(src, opts).withFaceLandmarks(true).withFaceDescriptors().withFaceExpressions();
    // personne de vu depuis un moment : on vérifie le sens de l'image ; sinon, une petite vérification de temps en temps
    if (!res.length) { if (++empty >= 4) await findRotation(); }
    else { empty = 0; if (performance.now() - lastRotTry > 45000) await findRotation(true); }
    state.faces = res.map(r => {
      const m = best(r.descriptor);
      // Il continue d'apprendre les visages qu'il reconnaît bien (autre lumière, autre coiffure…)
      if (m && m.dist < 0.42 && !capturing) learnMore(m.id, r.descriptor);
      return {
        box: r.detection.box,
        name: m && m.dist < MATCH ? m.name : null,
        expr: topExpr(r.expressions),
        area: r.detection.box.width * r.detection.box.height,
      };
    }).sort((a, b) => b.area - a.area);
    setMain(state.faces[0] && state.faces[0].box, src);
    emit('people', state.faces);
  }
  function learnMore(id, desc) {
    const p = (S.people || []).find(x => x.id === id);
    const now = Date.now();
    if (!p || now - (learnAt[id] || 0) < 120000) return; // au plus une nouvelle « photo mentale » toutes les 2 minutes
    learnAt[id] = now;
    p.desc.push(Array.from(desc, x => Math.round(x * 1e4) / 1e4));
    if (p.desc.length > 24) p.desc.splice(5, 1); // on garde les 5 premières (celles de « faire connaissance »)
    save();
  }
  function best(desc) {
    let m = null;
    for (const p of S.people || []) {
      for (const d of p.desc) {
        const dist = api.euclideanDistance(desc, d);
        if (!m || dist < m.dist) m = { name: p.name, id: p.id, dist };
      }
    }
    return m;
  }
  function topExpr(e) {
    let k = 'neutral', v = 0;
    for (const [kk, vv] of Object.entries(e)) if (typeof vv === 'number' && vv > v) { k = kk; v = vv; }
    return { k, v, happy: e.happy || 0, sad: e.sad || 0 };
  }

  // Prend n « photos mentales » du seul visage devant la caméra
  async function capture(n = 5, timeoutMs = 9000) {
    capturing = true;
    try {
      const out = [];
      const t0 = Date.now();
      while (out.length < n && Date.now() - t0 < timeoutMs) {
        const res = video.videoWidth ? await api.detectAllFaces(source(), opts).withFaceLandmarks(true).withFaceDescriptors() : [];
        if (res.length > 1) throw new Error('several');
        if (res.length === 1) out.push(Array.from(res[0].descriptor, x => Math.round(x * 1e4) / 1e4));
        await new Promise(r => setTimeout(r, 350));
      }
      if (out.length < n) throw new Error('none');
      return out;
    } finally {
      capturing = false;
    }
  }
  // À qui ressemblent ces empreintes ? (nom ou null)
  function identify(descs) {
    let m = null;
    for (const d of descs) { const b = best(d); if (b && (!m || b.dist < m.dist)) m = b; }
    return m && m.dist < MATCH ? m.name : null;
  }

  /* ---------- les objets ---------- */
  function loadObjects() {
    if (od) return Promise.resolve(od);
    odLoading = odLoading || (async () => {
      // import « caché » dans une chaîne : un vieux navigateur ne peut pas refuser tout le fichier à cause de lui
      const m = await new Function('u', 'return import(u)')(`${MP}/vision_bundle.mjs`);
      const files = await m.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const opt = d => ({ baseOptions: { modelAssetPath: OD_MODEL, delegate: d }, runningMode: 'IMAGE', scoreThreshold: 0.35, maxResults: 6 });
      try { od = await m.ObjectDetector.createFromOptions(files, opt('GPU')); }
      catch (e) { od = await m.ObjectDetector.createFromOptions(files, opt('CPU')); }
      return od;
    })().catch(e => { odLoading = null; throw e; });
    return odLoading;
  }
  // Ce que la caméra voit en ce moment : [{ label: 'cup', score }, …]
  async function objects() {
    if (!on || video.readyState < 2 || !video.videoWidth) return [];
    const d = await loadObjects();
    return d.detect(prepared(rot)).detections.map(x => ({ label: x.categories[0].categoryName, score: x.categories[0].score }));
  }
  // Une photo (seulement pour la « vision détaillée », si papa l'a autorisée)
  function snapshot(max = 640) {
    const w = video.videoWidth, h = video.videoHeight, k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  return {
    objects, snapshot,
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    start, stop, capture, identify, state,
    isOn: () => on,
    isLoading: () => !!loading && !api,
    on: (ev, fn) => handlers[ev].push(fn),
  };
})();
