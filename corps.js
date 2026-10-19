/* =========================================================
   SHADOW — le corps (étape 4 du planning : « Fabriquer le robot »)
   Le téléphone (la tête) parle au corps par Bluetooth : une petite carte
   ESP32 avec deux moteurs, des lumières et un capteur d'obstacles.
   Le programme de la carte est dans corps/shadow_corps_esp32.ino.

   Protocole : une ligne de texte JSON par commande, sur le service
   Bluetooth « UART » (Nordic UART Service, très courant) :
     {"cmd":"move","dir":"forward|back|left|right|stop","ms":800}
     {"cmd":"mood","face":"happy|oops|sad|think|listen|idle|sleep"}
     {"cmd":"dance"}   {"cmd":"hello"}
   La carte répond par des lignes : "bat:83" (batterie %), "obs:15" (obstacle à 15 cm).
   Sécurité : la carte s'arrête toute seule devant un obstacle et après chaque commande.
   Plus tard : la maison (domotique, ex. Home Assistant) se branchera dans maison().
   ========================================================= */
'use strict';

const CORPS = {
  SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  RX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // téléphone → carte
  TX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // carte → téléphone
  branche: false,
  dev: null, rx: null, battery: null, obstacle: null,
  supported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); },

  // À appeler depuis un bouton (le navigateur exige un geste) : choisir la carte « Shadow… »
  async connect() {
    if (!this.supported()) throw new Error('Bluetooth indisponible sur ce navigateur (il faut Chrome sur Android ou un ordinateur)');
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Shadow' }], optionalServices: [this.SERVICE] });
    this.dev = dev;
    dev.addEventListener('gattserverdisconnected', () => { this.branche = false; this.rx = null; this.onChange(); });
    const server = await dev.gatt.connect();
    const service = await server.getPrimaryService(this.SERVICE);
    this.rx = await service.getCharacteristic(this.RX);
    const tx = await service.getCharacteristic(this.TX);
    await tx.startNotifications();
    let buf = '';
    tx.addEventListener('characteristicvaluechanged', e => {
      buf += new TextDecoder().decode(e.target.value);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { this.onLine(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
    });
    this.branche = true;
    this.onChange();
    await this.send({ cmd: 'hello' });
    return dev.name;
  },
  disconnect() { if (this.dev && this.dev.gatt.connected) this.dev.gatt.disconnect(); },

  // Une commande à la fois : sinon les petits paquets de deux commandes se mélangent en route
  _queue: Promise.resolve(),
  send(obj) {
    const job = this._queue.then(() => this._write(obj));
    this._queue = job.catch(() => false);
    return job;
  },
  async _write(obj) {
    if (!this.rx) return false;
    const data = new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
    const write = this.rx.writeValueWithoutResponse || this.rx.writeValue;
    try {
      for (let i = 0; i < data.length; i += 20) await write.call(this.rx, data.slice(i, i + 20)); // petits paquets Bluetooth
      return true;
    } catch (e) { return false; }
  },
  onLine(line) {
    const m = line.match(/^(\w+):(-?\d+)/);
    if (!m) return;
    if (m[1] === 'bat') this.battery = +m[2];
    if (m[1] === 'obs') { this.obstacle = +m[2]; if (this.onObstacle) this.onObstacle(+m[2]); }
    this.onChange();
  },
  onChange() { /* remplacé par l'appli pour mettre à jour les réglages */ },

  // Déplacements : 'forward' | 'back' | 'left' | 'right' | 'stop' (durée en secondes, 3 s maximum)
  async bouger(direction, duree = 1) {
    if (!this.branche) return { ok: false, raison: "Je n'ai pas encore de roues !" };
    const ok = await this.send({ cmd: 'move', dir: direction, ms: Math.round(Math.min(3, Math.max(0.2, duree)) * 1000) });
    return ok ? { ok: true } : { ok: false, raison: "Mon corps ne répond pas." };
  },
  async danse() { return this.branche ? this.send({ cmd: 'dance' }) : false; },
  // Les lumières du corps prennent la couleur de l'émotion du visage
  mood(faceState) { if (this.branche) this.send({ cmd: 'mood', face: faceState }); },

  // Maison : ex. maison('lumiere', 'salon', 'allumer') — à brancher plus tard (domotique)
  async maison() {
    return { ok: false, raison: "Je ne suis pas encore branché à la maison." };
  },
};
