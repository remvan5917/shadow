/* =========================================================
   SHADOW — le corps (pas encore fabriqué !)
   Étape 4 du planning : « Fabriquer le robot » (piles, caméras…).
   Plus tard : se déplacer et piloter la maison (domotique).
   Le cerveau appellera seulement ces fonctions ; il suffira de les
   brancher sur les moteurs (ex. une carte ESP32 en WiFi) et sur la
   maison (ex. Home Assistant) sans rien changer au reste.
   ========================================================= */
'use strict';

const CORPS = {
  branche: false, // passera à true quand le corps sera connecté

  // Déplacements : 'avancer' | 'reculer' | 'gauche' | 'droite' | 'stop'
  async bouger(direction, duree = 1) {
    if (!this.branche) return { ok: false, raison: "Je n'ai pas encore de roues !" };
    return { ok: false, raison: 'À brancher' };
  },

  // Maison : ex. maison('lumiere', 'salon', 'allumer')
  async maison(appareil, piece, action) {
    if (!this.branche) return { ok: false, raison: "Je ne suis pas encore branché à la maison." };
    return { ok: false, raison: 'À brancher' };
  },
};
