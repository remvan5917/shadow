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
    opts = new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 });
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
    const d = await api.detectSingleFace(video, opts);
    setMain(d && d.box);
  }
  function setMain(box) {
    if (!box) { state.main = null; emit('track', null); return; }
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    state.main = { cx: ((box.x + box.width / 2) / w) * 2 - 1, cy: ((box.y + box.height / 2) / h) * 2 - 1, size: box.width / w };
    emit('track', state.main);
  }
  async function analyse() {
    const res = await api.detectAllFaces(video, opts).withFaceLandmarks(true).withFaceDescriptors().withFaceExpressions();
    state.faces = res.map(r => {
      const m = best(r.descriptor);
      return {
        box: r.detection.box,
        name: m && m.dist < MATCH ? m.name : null,
        expr: topExpr(r.expressions),
        area: r.detection.box.width * r.detection.box.height,
      };
    }).sort((a, b) => b.area - a.area);
    setMain(state.faces[0] && state.faces[0].box);
    emit('people', state.faces);
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
        const res = video.videoWidth ? await api.detectAllFaces(video, opts).withFaceLandmarks(true).withFaceDescriptors() : [];
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
    return d.detect(video).detections.map(x => ({ label: x.categories[0].categoryName, score: x.categories[0].score }));
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
