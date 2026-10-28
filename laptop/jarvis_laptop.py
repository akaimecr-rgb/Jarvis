"""Jarvis - Windows laptop programi.
"Jarvis" deyince dinler, sesini buluttaki Jarvis'e gonderir, cevabi sesli okur.
Kurulum (bir kez):  pip install vosk sounddevice numpy requests
Calistir:           python jarvis_laptop.py
Ilk calistirmada sifre sorar ve jarvis_ayar.json'a kaydeder.
"""
import io, json, os, queue, re, sys, time, wave, zipfile, tempfile, subprocess
import numpy as np, requests, sounddevice as sd
from vosk import Model, KaldiRecognizer

URL = "https://jarviss.akaimecr.workers.dev"
KLASOR = os.path.dirname(os.path.abspath(__file__))
AYAR = os.path.join(KLASOR, "jarvis_ayar.json")
MODEL_YOL = os.path.join(KLASOR, "vosk-model-small-en-us-0.15")
TETIK = re.compile(r"^(hey |hay |ey )?(jar ?vis|jervis|jarvas|jarvi|travis)$")
HIZ = 16000

def ayar():
    if os.path.exists(AYAR):
        return json.load(open(AYAR, encoding="utf-8"))
    a = {"sifre": input("Jarvis sifresi: ").strip()}
    json.dump(a, open(AYAR, "w", encoding="utf-8"))
    return a

def model_indir():
    if os.path.isdir(MODEL_YOL):
        return
    print("Ses modeli indiriliyor (40 MB, bir kez)...")
    r = requests.get("https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip", timeout=300)
    zipfile.ZipFile(io.BytesIO(r.content)).extractall(KLASOR)

def kaydet(sessizlik=1.7, en_uzun=30):
    """Konusma bitene kadar (1.7 sn sessizlik) kaydeder."""
    parcalar, sessiz, basladi, bas = [], 0.0, False, time.time()
    with sd.InputStream(samplerate=HIZ, channels=1, dtype="int16", blocksize=1600) as s:
        while time.time() - bas < en_uzun:
            v, _ = s.read(1600)
            parcalar.append(v.copy())
            yuksek = np.abs(v).mean() > 500
            if yuksek: basladi, sessiz = True, 0.0
            else: sessiz += 0.1
            if basladi and sessiz >= sessizlik: break
            if not basladi and time.time() - bas > 6: return None
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(HIZ)
        w.writeframes(np.concatenate(parcalar).tobytes())
    return b.getvalue()

def oynat(ses):
    yol = os.path.join(tempfile.gettempdir(), "jarvis_cevap.mp3")
    open(yol, "wb").write(ses)
    # Windows'un kendi oynaticisiyla, pencere acmadan calar
    ps = f"Add-Type -AssemblyName presentationCore;$p=New-Object System.Windows.Media.MediaPlayer;$p.Open('{yol}');$p.Play();Start-Sleep -m 500;while($p.Position -lt $p.NaturalDuration.TimeSpan){{Start-Sleep -m 200}}"
    subprocess.run(["powershell", "-NoProfile", "-Command", ps])

def konus(sifre, wav, gecmis):
    import base64
    H = {"x-secret": sifre, "content-type": "application/json"}
    d = requests.post(URL + "/dinle", headers=H, json={"ses": base64.b64encode(wav).decode()}, timeout=60)
    if d.status_code == 401:
        os.remove(AYAR); sys.exit("Sifre yanlis, programi yeniden ac.")
    metin = d.json().get("metin", "").strip()
    if not metin:
        return {"duydum": "", "cevap": ""}
    print("Sen   :", metin)
    j = requests.post(URL + "/sohbet", headers=H, json={"metin": metin, "gecmis": gecmis[-10:]}, timeout=120).json()
    j["duydum"] = metin
    print("Jarvis:", j.get("cevap", ""))
    for l in ([j["link"]] if j.get("link") else []):
        os.startfile(l)
    try:
        s = requests.post(URL + "/ses", headers=H, json={"metin": j.get("cevap", "")}, timeout=60)
        if s.ok and s.content: oynat(s.content)
    except Exception as e:
        print("(ses calinamadi:", e, ")")
    return j

UYGULAMALAR = {  # Jarvis'in acabilecegi uygulamalar (Windows)
    "discord": r"%LOCALAPPDATA%\Discord\Update.exe --processStart Discord.exe",
    "chrome": "start chrome", "spotify": "start spotify:", "steam": "start steam:", "valorant": "start riotclient:",
    "explorer": "explorer", "dosyalar": "explorer", "obs": "start obs64", "capcut": "start capcut",
    "premiere": "start \"\" \"Adobe Premiere Pro.exe\"", "notepad": "notepad", "hesap makinesi": "calc", "youtube": "start https://www.youtube.com",
}

def komut_dongusu(sifre):
    """Jarvis'in laptopa yolladigi komutlari 15 sn'de bir alir ve yapar."""
    import threading, webbrowser
    def calis():
        while True:
            try:
                r = requests.get(URL + "/laptop-komut", headers={"x-secret": sifre}, timeout=20)
                for k in r.json().get("komutlar", []):
                    tur, d = k.get("tur"), k.get("deger", "")
                    print(f"[Jarvis komutu] {tur}: {d}")
                    if tur == "ac": webbrowser.open(d if d.startswith("http") else "https://www.google.com/search?q=" + requests.utils.quote(d))
                    elif tur == "uygulama":
                        c = next((v for a, v in UYGULAMALAR.items() if a in d.lower()), None)
                        if c: subprocess.Popen(os.path.expandvars(c), shell=True)
                        else: print("Bilinmeyen uygulama:", d)
                    elif tur == "indir":
                        hedef = os.path.join(os.path.expanduser("~"), "Downloads", "%(title)s.%(ext)s")
                        subprocess.Popen([sys.executable, "-m", "yt_dlp", "-o", hedef, d])
                    elif tur == "yaz":
                        subprocess.run("clip", input=d.encode("utf-16"), shell=True)
            except Exception as e:
                pass
            time.sleep(15)
    threading.Thread(target=calis, daemon=True).start()

def main():
    a = ayar(); model_indir()
    komut_dongusu(a["sifre"])
    rec = KaldiRecognizer(Model(MODEL_YOL), HIZ)
    q = queue.Queue()
    print("Hazir. 'Jarvis' de. (Kapatmak icin Ctrl+C)")
    while True:
        with sd.RawInputStream(samplerate=HIZ, blocksize=4000, dtype="int16", channels=1, callback=lambda d, *_: q.put(bytes(d))):
            while True:
                if rec.AcceptWaveform(q.get()):
                    sonuc = json.loads(rec.Result())
                    metin = sonuc.get("text", "").strip()
                    guven = [w.get("conf", 0) for w in sonuc.get("result", [])]
                    if TETIK.match(metin) and guven and min(guven) >= 0.8:
                        break
        print("Dinliyorum...")
        gecmis = []
        while True:  # serbest konusma: cevaptan sonra tekrar dinler
            wav = kaydet()
            if not wav: print("Sessizlik, beklemeye dondum."); break
            j = konus(a["sifre"], wav, gecmis)
            gecmis += [{"role": "user", "content": j.get("duydum", "")}, {"role": "assistant", "content": j.get("cevap", "")}]
            if j.get("uyku") or j.get("bitis") or re.search(r"(kapat|tamam bu kadar|görüşürüz|iyi geceler)", j.get("duydum", "").lower()):
                break
        with q.mutex: q.queue.clear()

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: print("Gorusuruz.")
