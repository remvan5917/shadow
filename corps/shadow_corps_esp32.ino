/* =========================================================
   SHADOW — le programme du corps (carte ESP32)
   Le téléphone (la tête de Shadow) envoie des commandes par Bluetooth.
   La carte fait rouler les moteurs, allume les lumières selon l'émotion
   du visage, et s'arrête toute seule devant un obstacle.

   Matériel conseillé (voir LISEZMOI.md, partie « Le corps ») :
   - une carte ESP32 (ex. ESP32 DevKit) ;
   - un pilote de moteurs TB6612FNG + 2 petits moteurs à engrenages avec roues ;
   - un ruban de LEDs WS2812 (NeoPixel), 8 LEDs ;
   - un capteur de distance HC-SR04P (version 3,3 V) ;
   - une batterie (ex. 2 accus 18650 = 7,4 V) + un régulateur 5 V.

   Logiciel : Arduino IDE + « esp32 by Espressif » (Gestionnaire de cartes)
   + la bibliothèque « Adafruit NeoPixel ».
   ⚠️ Pas encore testé sur du vrai matériel : à vérifier ensemble au montage.
   ========================================================= */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Adafruit_NeoPixel.h>

// ---------- les broches (à adapter au câblage) ----------
const int AIN1 = 25, AIN2 = 26, PWMA = 27;   // moteur gauche
const int BIN1 = 14, BIN2 = 12, PWMB = 13;   // moteur droit
const int STBY = 33;                          // réveil du pilote de moteurs
const int LED_PIN = 4, LED_COUNT = 8;         // ruban de LEDs
const int TRIG = 5, ECHO = 18;                // capteur de distance
const int BAT_PIN = 34;                       // tension de la batterie (pont diviseur)

// ---------- réglages ----------
const int SPEED = 160;            // vitesse (0-255) : doucement, c'est un robot d'enfant
const int OBSTACLE_CM = 20;       // il s'arrête si un obstacle est plus près
const unsigned long MAX_MS = 3000;// jamais plus de 3 s par commande
const float BAT_DIVIDER = 3.0;    // pont diviseur : tension réelle = mesure × 3
const float BAT_EMPTY = 6.4, BAT_FULL = 8.4; // 2 accus 18650

#define SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define RX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define TX_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

Adafruit_NeoPixel leds(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
BLECharacteristic *txChar = nullptr;
volatile bool connected = false;
String inbuf, pendingLine;
String moving = "stop";
unsigned long moveUntil = 0, lastBat = 0, lastObs = 0;

// ---------- moteurs ----------
void motor(int in1, int in2, int pwm, int speed) {
  digitalWrite(in1, speed > 0); digitalWrite(in2, speed < 0);
  analogWrite(pwm, abs(speed));
}
void drive(int left, int right) { digitalWrite(STBY, HIGH); motor(AIN1, AIN2, PWMA, left); motor(BIN1, BIN2, PWMB, right); }
void stopMotors() { drive(0, 0); moving = "stop"; moveUntil = 0; }

// ---------- lumières ----------
void color(uint8_t r, uint8_t g, uint8_t b) { for (int i = 0; i < LED_COUNT; i++) leds.setPixelColor(i, leds.Color(r, g, b)); leds.show(); }
void mood(const String &f) {
  if (f == "happy") color(0, 180, 60);        // vert : c'est juste !
  else if (f == "oops") color(255, 110, 0);   // orange : il y a un piège
  else if (f == "sad") color(70, 70, 200);
  else if (f == "think") color(140, 60, 255);
  else if (f == "listen") color(0, 200, 255);
  else if (f == "sleep") color(5, 5, 20);
  else color(30, 90, 255);                    // bleu : la crête de Shadow
}

// ---------- capteurs ----------
int distanceCm() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 25000); // 25 ms max (~4 m)
  return us ? (int)(us / 58) : 999;
}
int batteryPercent() {
  float v = analogReadMilliVolts(BAT_PIN) / 1000.0 * BAT_DIVIDER;
  int p = (int)((v - BAT_EMPTY) / (BAT_FULL - BAT_EMPTY) * 100);
  return constrain(p, 0, 100);
}
void sendLine(const String &s) {
  if (!connected || !txChar) return;
  String l = s + "\n";
  txChar->setValue((uint8_t *)l.c_str(), l.length());
  txChar->notify();
}

// ---------- les commandes : {"cmd":"move","dir":"forward","ms":800} ----------
String field(const String &json, const String &key) {
  int k = json.indexOf("\"" + key + "\"");
  if (k < 0) return "";
  int c = json.indexOf(':', k);
  int s = c + 1;
  while (s < (int)json.length() && (json[s] == ' ' || json[s] == '"')) s++;
  int e = s;
  while (e < (int)json.length() && json[e] != '"' && json[e] != ',' && json[e] != '}') e++;
  return json.substring(s, e);
}
void handle(const String &line) {
  String cmd = field(line, "cmd");
  if (cmd == "move") {
    String dir = field(line, "dir");
    unsigned long ms = min((unsigned long)field(line, "ms").toInt(), MAX_MS);
    if (dir == "stop" || ms == 0) { stopMotors(); return; }
    if (dir == "forward" && distanceCm() < OBSTACLE_CM) { stopMotors(); sendLine("obs:" + String(distanceCm())); return; }
    if (dir == "forward") drive(SPEED, SPEED);
    else if (dir == "back") drive(-SPEED, -SPEED);
    else if (dir == "left") drive(-SPEED, SPEED);
    else if (dir == "right") drive(SPEED, -SPEED);
    moving = dir; moveUntil = millis() + ms;
  } else if (cmd == "mood") {
    mood(field(line, "face"));
  } else if (cmd == "dance") {
    for (int i = 0; i < 4; i++) {
      color(255, 0, 120); drive(-SPEED, SPEED); delay(250);
      color(0, 200, 255); drive(SPEED, -SPEED); delay(250);
    }
    stopMotors(); mood("happy");
  } else if (cmd == "hello") {
    mood("happy"); sendLine("bat:" + String(batteryPercent()));
  }
}

// ---------- Bluetooth ----------
class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer *s) { connected = true; }
  void onDisconnect(BLEServer *s) { connected = false; stopMotors(); mood("sleep"); s->startAdvertising(); }
};
class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) {
    auto v = c->getValue();
    inbuf += String(v.c_str());
    int i;
    while ((i = inbuf.indexOf('\n')) >= 0) { pendingLine = inbuf.substring(0, i); inbuf = inbuf.substring(i + 1); }
  }
};

void setup() {
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT); pinMode(PWMA, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT); pinMode(PWMB, OUTPUT);
  pinMode(STBY, OUTPUT); pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  stopMotors();
  leds.begin(); leds.setBrightness(60); mood("sleep");

  BLEDevice::init("Shadow-corps");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  BLEService *service = server->createService(SERVICE_UUID);
  txChar = service->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic *rx = service->createCharacteristic(RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCB());
  service->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
}

void loop() {
  if (pendingLine.length()) { String l = pendingLine; pendingLine = ""; handle(l); }
  unsigned long now = millis();
  // fin du mouvement (sécurité : jamais plus de 3 s)
  if (moveUntil && now > moveUntil) stopMotors();
  // obstacle devant pendant qu'il avance : stop !
  if (moving == "forward" && now - lastObs > 60) {
    lastObs = now;
    int d = distanceCm();
    if (d < OBSTACLE_CM) { stopMotors(); sendLine("obs:" + String(d)); }
  }
  // la batterie, toutes les 30 s
  if (connected && now - lastBat > 30000) { lastBat = now; sendLine("bat:" + String(batteryPercent())); }
  delay(5);
}
