import { SENSOR_KINDS, type SensorKind } from "@/models/sensor-devices";

/**
 * Ready-to-use code for a user's sensor, with the app's address and the sensor's key already written in: a one-line
 * test command (curl), an ESP32 sketch for the Arduino IDE and a Python script for a Raspberry Pi. Temperature and air
 * humidity sensors read a DHT22 and send both values; the other kinds read an analogue pin through leggiValore(),
 * left to adapt to the sensor in hand.
 */
export type CodeKind = "curl" | "esp32" | "python";

const dht = (k: SensorKind) => k === "temperatura" || k === "umidita_aria";
const sample = (k: SensorKind) => (k === "umidita_suolo" || k === "umidita_aria" ? 32 : k === "vento" ? 12 : k === "pioggia" ? 1.5 : 27.5);
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function curlCode(url: string, key: string, kind: SensorKind): string {
  return `curl -X POST ${url} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"value": ${sample(kind)}}'`;
}

export function esp32Code(url: string, key: string, kind: SensorKind, wifi = { name: "", password: "" }): string {
  const label = SENSOR_KINDS[kind].label, unit = SENSOR_KINDS[kind].unit;
  const head = `/*
  Micro Digital Twin · ${label}${dht(kind) ? " (e umidità dell'aria)" : ""}
  Scheda: ESP32 · Arduino IDE (Impostazioni → URL aggiuntivi:
    https://espressif.github.io/arduino-esp32/package_esp32_index.json
  poi Gestore schede → "esp32" → scheda "ESP32 Dev Module").
${dht(kind) ? `  Sensore: DHT22 · VCC → 3V3, DATA → GPIO 4, GND → GND (10 kΩ tra DATA e 3V3 se il modulo non l'ha).
  Libreria: "DHT sensor library" di Adafruit (Strumenti → Gestisci librerie).` : `  Sensore: uscita analogica su GPIO 34. Adatta leggiValore() al tuo sensore (${unit}).`}
  Indirizzo e chiave del sensore sono già scritti qui sotto: compila solo il Wi-Fi.
*/
`;
  const body = dht(kind)
    ? `  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) { Serial.println("Il DHT22 non risponde: controlla i fili."); return; }
  manda(String("{\\"temperature\\": ") + String(t, 1) + ", \\"humidity\\": " + String(h, 0) + "}");`
    : `  float v = leggiValore();
  manda(String("{\\"value\\": ") + String(v, 2) + "}");`;
  return `${head}
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
${dht(kind) ? "#include <DHT.h>\n" : ""}
const char* WIFI_NOME     = "${esc(wifi.name) || "NOME_DELLA_TUA_RETE"}";
const char* WIFI_PASSWORD = "${esc(wifi.password) || "PASSWORD_DELLA_RETE"}";
const char* INDIRIZZO     = "${url}";
const char* CHIAVE        = "${key}";
const unsigned long OGNI_MINUTI = 10;
${dht(kind) ? "\nDHT dht(4, DHT22);\n" : `
// Da adattare: qui un valore da 0 a 4095 sul GPIO 34 diventa ${unit}.
float leggiValore() {
  int grezzo = analogRead(34);
  return grezzo * 100.0 / 4095.0;
}
`}
void collegaWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NOME, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(500);
  Serial.println(WiFi.status() == WL_CONNECTED ? "Wi-Fi collegato" : "Wi-Fi non raggiungibile, riprovo");
}

void manda(String corpo) {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, INDIRIZZO);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + CHIAVE);
  int codice = http.POST(corpo);
  Serial.printf("Inviato %s -> %d %s\\n", corpo.c_str(), codice, http.getString().c_str());
  http.end();
}

void leggiEManda() {
${body}
}

void setup() {
  Serial.begin(115200);
${dht(kind) ? "  dht.begin();\n" : ""}  collegaWiFi();
}

void loop() {
  collegaWiFi();
  leggiEManda();
  delay(OGNI_MINUTI * 60UL * 1000UL);
}
`;
}

export function pythonCode(url: string, key: string, kind: SensorKind): string {
  const unit = SENSOR_KINDS[kind].unit;
  return `"""
Micro Digital Twin · ${SENSOR_KINDS[kind].label}
Indirizzo e chiave del sensore sono già scritti qui sotto.
Prova senza sensore (qualsiasi computer):  pip3 install requests
                                          python3 sensore.py --prova ${sample(kind)}
${dht(kind) ? `Con un DHT22 sul GPIO 4 del Raspberry:     pip3 install requests adafruit-circuitpython-dht
                                          sudo apt install libgpiod2
                                          python3 sensore.py` : `Con il tuo sensore: adatta leggi_valore() (${unit}), poi python3 sensore.py`}
Per farlo partire all'accensione: crontab -e e aggiungi  @reboot python3 /home/pi/sensore.py
"""
import sys, time, requests

INDIRIZZO = "${url}"
CHIAVE = "${key}"
OGNI_MINUTI = 10

def manda(dati):
    r = requests.post(INDIRIZZO, json=dati, headers={"Authorization": f"Bearer {CHIAVE}"}, timeout=20)
    print("Inviato", dati, "->", r.status_code, r.text)

if len(sys.argv) == 3 and sys.argv[1] == "--prova":
    manda({"value": float(sys.argv[2])})
    sys.exit()
${dht(kind) ? `
import board, adafruit_dht
dht = adafruit_dht.DHT22(board.D4)

def leggi():
    return {"temperature": round(dht.temperature, 1), "humidity": round(dht.humidity)}
` : `
def leggi_valore():
    # Da adattare al tuo sensore: deve restituire un numero in ${unit}
    return ${sample(kind)}

def leggi():
    return {"value": leggi_valore()}
`}
while True:
    try:
        manda(leggi())
    except Exception as e:
        print("Lettura non riuscita:", e)
    time.sleep(OGNI_MINUTI * 60)
`;
}

export const CODE_FILE: Record<CodeKind, string> = { curl: "prova-sensore.txt", esp32: "sensore_esp32.ino", python: "sensore.py" };
