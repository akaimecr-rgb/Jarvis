// Jarvis - Cloudflare Worker (GitHub ile otomatik yayinlanir)
// Secrets: GEMINI_API_KEY, OPENROUTER_API_KEY, APP_SECRET (istege bagli: ANTHROPIC_API_KEY)
// KV baglantisi: HAFIZA
// Beyin: varsayilan Gemini | "Sansursuz ..." -> OpenRouter | "Claude ..." -> Claude

const SISTEM_TEMEL =
  "Sen Jarvis'sin, Eren'in kisisel sesli asistanisin. Turkce konus. " +
  "Cevaplarin kisa olsun (1-3 cumle), cunku sesli okunacak. " +
  "Madde isareti, emoji veya markdown kullanma. " +
  "Eren sana kalici olarak hatirlaman gereken bir sey soylerse, " +
  "cevabinin en sonuna [HATIRLA: kisa not] ekle. Bu etiketi baska durumda kullanma.";

function beyinSec(metin) {
  const m = metin.toLocaleLowerCase("tr").trim();
  if (m.startsWith("sansürsüz") || m.startsWith("sansursuz")) return "openrouter";
  if (m.startsWith("claude")) return "claude";
  return "gemini";
}

async function kvOku(env, k, v0) {
  if (!env.HAFIZA) return v0;
  const v = await env.HAFIZA.get(k);
  return v ? JSON.parse(v) : v0;
}
async function kvYaz(env, k, v) {
  if (env.HAFIZA) await env.HAFIZA.put(k, JSON.stringify(v));
}

// ---------------- Gorev dagitimi: her is icin en uygun model ----------------
// Cloudflare'de Text degiskeniyle degistirilebilir.
const MODELLER = (env) => ({
  sohbet: env.SOHBET_MODEL || "gemini-flash-lite-latest", // hizli konusma
  kod: env.KOD_MODEL || "gemini-pro-latest", // en iyi kod
  kodYedek: env.KOD_YEDEK_MODEL || env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra:free",
  dinle: env.DINLE_MODEL || "gemini-flash-lite-latest",
});

async function sorGemini(env, sistem, gecmis, modelAdi, secenek = {}) {
  const model = modelAdi || env.GEMINI_MODEL || "gemini-flash-latest";
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistem }] },
        contents: gecmis.map((g, i) => ({
          role: g.role === "user" ? "user" : "model",
          parts: [{ text: g.content }, ...(i === gecmis.length - 1 && secenek.ekParcalar ? secenek.ekParcalar : [])],
        })),
        ...(secenek.json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      }),
    }
  );
  if (!r.ok) throw new Error("Gemini " + r.status);
  const j = await r.json();
  const p = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  return (p && p.map((x) => x.text || "").join("")) || "Model bos cevap verdi, tekrar dene.";
}

async function sorOpenRouter(env, sistem, gecmis, modelAdi) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.OPENROUTER_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: modelAdi || env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
      messages: [{ role: "system", content: sistem }, ...gecmis],
    }),
  });
  if (!r.ok) throw new Error("OpenRouter " + r.status);
  const j = await r.json();
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  return (msg && (msg.content || msg.reasoning)) || "Model bos cevap verdi, tekrar dene.";
}

async function sorClaude(env, sistem, gecmis) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: 300, system: sistem, messages: gecmis }),
  });
  if (!r.ok) throw new Error("Claude " + r.status);
  const j = await r.json();
  return j.content[0].text;
}

const SAYFA = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jarvis</title>
<style>
body{margin:0;background:#05080f;color:#e6f1ff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;height:100vh}
#ust{display:flex;justify-content:center;padding:20px 0 8px}
#cember{width:110px;height:110px;border-radius:50%;border:3px solid #38bdf8;box-shadow:0 0 25px #38bdf8,inset 0 0 25px #0ea5e9;transition:.3s}
#cember.aktif{transform:scale(1.12);box-shadow:0 0 50px #38bdf8,inset 0 0 40px #38bdf8}
#log{flex:1;overflow-y:auto;padding:12px 16px;font-size:16px;line-height:1.5}
.sen{color:#7dd3fc;margin:8px 0}.jarvis{margin:8px 0}
#alt{display:flex;gap:8px;padding:12px}
#yazi{flex:1;padding:14px;border-radius:14px;border:1px solid #1e3a5f;background:#0b1424;color:#fff;font-size:16px}
#gonder,#btn{border:none;border-radius:14px;color:#fff;font-size:18px;padding:0 18px}
#gonder{background:#1e3a5f}#btn{background:#2563eb}#btn.dinliyor{background:#dc2626}
</style></head><body>
<div id="ust"><div id="cember"></div></div>
<div id="log"></div>
<div id="alt"><input id="yazi" placeholder="Yaz veya mikrofona bas"><button id="gonder">&#10148;</button><button id="btn">Mik</button></div>
<script>
var log=document.getElementById("log"),btn=document.getElementById("btn"),cember=document.getElementById("cember"),yazi=document.getElementById("yazi");
var sifre=null;try{sifre=localStorage.getItem("jarvis_sifre")}catch(e){}
if(!sifre){sifre=prompt("Jarvis sifresi:")||"";try{localStorage.setItem("jarvis_sifre",sifre)}catch(e){}}
function ekle(s,t){var d=document.createElement("div");d.className=s;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight}
var oynatici=null;
function tarayiciSesi(t){var u=new SpeechSynthesisUtterance(t);u.lang="tr-TR";u.rate=1.15;u.onstart=function(){cember.classList.add("aktif")};u.onend=function(){cember.classList.remove("aktif")};speechSynthesis.cancel();speechSynthesis.speak(u)}
var sesSirasi=0;
function sesAl(t){return fetch("/ses",{method:"POST",headers:{"Content-Type":"application/json","x-secret":sifre},body:JSON.stringify({metin:t})}).then(function(r){if(!r.ok)throw new Error("ses");return r.blob()})}
function cal(blob){return new Promise(function(ok){oynatici=new Audio(URL.createObjectURL(blob));oynatici.onplay=function(){cember.classList.add("aktif")};oynatici.onended=function(){cember.classList.remove("aktif");ok()};oynatici.onerror=ok;oynatici.play().catch(ok)})}
async function konus(t){
  var benim=++sesSirasi;if(oynatici)oynatici.pause();
  var cumleler=(t.match(/[^.!?]+[.!?]*/g)||[t]).map(function(x){return x.trim()}).filter(Boolean);
  var parcalar=[];for(var i=0;i<cumleler.length;i++){var son=parcalar[parcalar.length-1];if(son&&son.length<60)parcalar[parcalar.length-1]=son+" "+cumleler[i];else parcalar.push(cumleler[i])}
  var istekler=parcalar.map(sesAl);
  try{for(var j=0;j<istekler.length;j++){var b=await istekler[j];if(benim!==sesSirasi)return;await cal(b)}}
  catch(e){if(benim===sesSirasi)tarayiciSesi(t)}
}
async function gonder(metin,sesli){
  if(!metin.trim())return;
  ekle("sen","Sen: "+metin);
  try{
    var res=await fetch("/sohbet",{method:"POST",headers:{"Content-Type":"application/json","x-secret":sifre},body:JSON.stringify({metin:metin})});
    if(res.status===401){try{localStorage.removeItem("jarvis_sifre")}catch(e){}ekle("jarvis","Sifre yanlis, sayfayi yenile.");return}
    var v=await res.json();
    ekle("jarvis","Jarvis ("+v.beyin+"): "+v.cevap);if(v.link){var a=document.createElement("a");a.href=v.link;a.target="_blank";a.textContent="Aç";a.style.color="#38bdf8";log.appendChild(a)}
    if(sesli)konus(v.cevap);
  }catch(err){ekle("jarvis","Sunucuya ulasamadim.")}
}
document.getElementById("gonder").onclick=function(){gonder(yazi.value,false);yazi.value=""};
yazi.onkeydown=function(e){if(e.key==="Enter"){gonder(yazi.value,false);yazi.value=""}};
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
var kayit=null,parcalar=[],akis=null,zaman=null;
function eskiDinle(){
  if(!SR){ekle("jarvis","Bu tarayici ses tanimayi desteklemiyor. Chrome kullan.");return}
  var r=new SR();r.lang="tr-TR";
  r.onstart=function(){btn.classList.add("dinliyor");cember.classList.add("aktif")};
  r.onend=function(){btn.classList.remove("dinliyor");cember.classList.remove("aktif")};
  r.onerror=function(){ekle("jarvis","Seni duyamadim, tekrar dene.")};
  r.onresult=function(e){gonder(e.results[0][0].transcript,true)};
  r.start();
}
function wavaCevir(ab){
  var Ctx=window.AudioContext||window.webkitAudioContext;var ctx=new Ctx();
  return ctx.decodeAudioData(ab).then(function(buf){
    var hz=16000,oran=buf.sampleRate/hz,n=Math.floor(buf.length/oran),ham=buf.getChannelData(0);
    var dv=new DataView(new ArrayBuffer(44+n*2));
    function y(o,t){for(var i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))}
    y(0,"RIFF");dv.setUint32(4,36+n*2,true);y(8,"WAVE");y(12,"fmt ");dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
    dv.setUint32(24,hz,true);dv.setUint32(28,hz*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);y(36,"data");dv.setUint32(40,n*2,true);
    for(var i=0;i<n;i++){var v=Math.max(-1,Math.min(1,ham[Math.floor(i*oran)]));dv.setInt16(44+i*2,v<0?v*0x8000:v*0x7fff,true)}
    ctx.close();
    var by=new Uint8Array(dv.buffer),s="";for(var j=0;j<by.length;j+=0x8000)s+=String.fromCharCode.apply(null,by.subarray(j,j+0x8000));
    return btoa(s);
  });
}
function durdur(){if(kayit&&kayit.state==="recording")kayit.stop()}
btn.onclick=async function(){
  if(kayit&&kayit.state==="recording"){durdur();return}
  if(oynatici)oynatici.pause();speechSynthesis.cancel();
  if(!navigator.mediaDevices||!window.MediaRecorder){eskiDinle();return}
  try{akis=await navigator.mediaDevices.getUserMedia({audio:true})}catch(e){ekle("jarvis","Mikrofon izni yok.");return}
  parcalar=[];kayit=new MediaRecorder(akis);
  kayit.ondataavailable=function(e){if(e.data.size)parcalar.push(e.data)};
  kayit.onstop=async function(){
    clearTimeout(zaman);akis.getTracks().forEach(function(t){t.stop()});
    btn.classList.remove("dinliyor");btn.textContent="Mik";
    var d=document.createElement("div");d.className="jarvis";d.textContent="Dinledim, anlıyorum...";log.appendChild(d);
    try{
      var b64=await wavaCevir(await new Blob(parcalar).arrayBuffer());
      var r=await fetch("/konus",{method:"POST",headers:{"Content-Type":"application/json","x-secret":sifre},body:JSON.stringify({ses:b64})});
      if(!r.ok)throw new Error("konus");
      var v=await r.json();d.remove();
      if(v.komut){gonder(v.duydum,true);return}
      if(v.duydum)ekle("sen","Sen: "+v.duydum);
      ekle("jarvis","Jarvis: "+v.cevap);konus(v.cevap);
    }catch(e){d.remove();ekle("jarvis","Ses çözülemedi, telefonun ses tanımasıyla deniyorum.");eskiDinle()}
  };
  kayit.start();btn.classList.add("dinliyor");btn.textContent="Bitir";
  zaman=setTimeout(durdur,30000);
};
</script></body></html>`;


// ---------------- GitHub (kendi kodunu yazma + kurgu) ----------------
const REPO = "akaimecr-rgb/Jarvis";
const SABLON_REPO = "akaimecr-rgb/remotion-sablonlar";
const KOD_YOLU = "src/index.js";
const CIT = "`".repeat(3);

async function gh(env, yol, secenek = {}) {
  const r = await fetch("https://api.github.com" + yol, {
    ...secenek,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "jarvis-worker",
      "content-type": "application/json",
      ...(secenek.headers || {}),
    },
  });
  if (!r.ok) throw new Error("GitHub " + r.status + " " + (await r.text()).slice(0, 150));
  return r.status === 204 ? null : r.json();
}

function b64Coz(s) {
  const bin = atob(s.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function b64Yap(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function dosyaOku(env, yol) {
  const j = await gh(env, `/repos/${REPO}/contents/${yol}`);
  return { icerik: b64Coz(j.content), sha: j.sha };
}

async function dosyaYaz(env, yol, icerik, sha, mesaj) {
  return gh(env, `/repos/${REPO}/contents/${yol}`, {
    method: "PUT",
    body: JSON.stringify({ message: mesaj, content: b64Yap(icerik), sha }),
  });
}

async function kodIstegi(env, istek) {
  const { icerik, sha } = await dosyaOku(env, KOD_YOLU);
  const sistem =
    "Sen bir Cloudflare Worker gelistiricisisin. Sana Jarvis'in tum kaynak kodu ve bir degisiklik istegi verilecek. " +
    "Istenen degisikligi yap ve var olan hicbir ozelligi bozma. Cevabin TAM OLARAK su bicimde olsun:\n" +
    "OZET: <Turkce, 1-3 cumle, ne degistirdin>\n" + CIT + "js\n<dosyanin TAMAMI, degistirilmis hali>\n" + CIT;
  const M = MODELLER(env);
  const mesaj = [{ role: "user", content: "ISTEK: " + istek + "\n\nMEVCUT KOD:\n" + CIT + "js\n" + icerik + "\n" + CIT }];
  let cevap;
  try {
    cevap = await sorGemini(env, sistem, mesaj, M.kod);
  } catch (e) {
    cevap = await sorOpenRouter(env, sistem, mesaj, M.kodYedek);
  }
  const bas = cevap.indexOf(CIT);
  const son = cevap.lastIndexOf(CIT);
  const kod = bas >= 0 && son > bas ? cevap.slice(cevap.indexOf("\n", bas) + 1, son).trim() + "\n" : null;
  const ozet = ((cevap.match(/OZET:\s*(.+)/) || [])[1] || "Değişiklik hazır.").trim();
  if (!kod || !kod.includes("export default") || kod.length < icerik.length * 0.6) {
    throw new Error("Model eksik ya da bozuk kod döndürdü, isteği daha açık yazıp tekrar dene.");
  }
  await kvYaz(env, "bekleyen_kod", { kod, sha, ozet, istek });
  return ozet + " Onaylıyor musun? 'Onayla' dersen kaydedip yayınlarım, 'iptal' dersen vazgeçerim.";
}

async function kodOnayla(env) {
  const b = await kvOku(env, "bekleyen_kod", null);
  if (!b) return "Bekleyen bir kod değişikliği yok.";
  const { icerik, sha } = await dosyaOku(env, KOD_YOLU);
  if (sha !== b.sha) return "Kod bu arada değişmiş. İsteği tekrar söyle, güncel kod üzerinden yazayım.";
  await kvYaz(env, "onceki_kod", { kod: icerik });
  await dosyaYaz(env, KOD_YOLU, b.kod, sha, "Jarvis: " + b.istek.slice(0, 60));
  await kvYaz(env, "bekleyen_kod", null);
  return "Kaydettim. Bir iki dakika içinde yeni sürüm yayında olur. Kod hata verirse eski sürüm çalışmaya devam eder; sorun olursa 'geri al' de.";
}

async function geriAl(env) {
  const o = await kvOku(env, "onceki_kod", null);
  if (!o) return "Geri alınacak bir değişiklik bulamadım.";
  const { sha } = await dosyaOku(env, KOD_YOLU);
  await dosyaYaz(env, KOD_YOLU, o.kod, sha, "Jarvis: son degisiklik geri alindi");
  await kvYaz(env, "onceki_kod", null);
  return "Son değişikliği geri aldım. Bir iki dakika içinde eski sürüm yayında olur.";
}

async function kurgula(env, metin) {
  const linkler = metin.match(/https?:\/\/\S+/g) || [];
  const malzeme = linkler.find((l) => l.includes("/folders/")) || "";
  const video = linkler.find((l) => !l.includes("/folders/"));
  if (!video) return "Video linkini de yaz. Örnek: kurgula shorts <video linki> malzeme <klasör linki>";
  const format = /uzun/i.test(metin) ? "uzun" : "shorts";
  const talimat = metin
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*kurgula\s*/i, "")
    .replace(/\b(shorts|uzun|malzeme)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { format, video_url: video, malzeme_url: malzeme, talimat, plan: "" } }),
  });
  return `Kurguyu başlattım (${format}${malzeme ? ", malzeme klasörüyle" : ""}). 5-10 dakika sürer. 'Kurgu durumu' diye sorabilirsin.`;
}

async function stilCikar(env, metin) {
  const linkler = metin.match(/https?:\/\/\S+/g) || [];
  if (!linkler.length) return "Örnek video linklerini de yaz. Örnek: stil çıkar shorts <link1> <link2> <link3>";
  const format = /uzun/i.test(metin) ? "uzun" : "shorts";
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/stil.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { format, linkler: linkler.join(" ") } }),
  });
  return `${linkler.length} örnek videodan ${format} stilini çıkarıyorum. 5-10 dakika sürer. Bitince bundan sonraki kurgular bu stille yapılır.`;
}

async function kurguDurumu(env) {
  const j = await gh(env, `/repos/${SABLON_REPO}/actions/runs?per_page=1`);
  const r = j.workflow_runs && j.workflow_runs[0];
  if (!r) return "Henüz bir kurgu çalışması yok.";
  const durum =
    r.status !== "completed" ? "hâlâ çalışıyor" : r.conclusion === "success" ? "bitti, video hazır" : "hata verdi";
  return { cevap: `Son kurgu ${durum}.`, link: r.html_url };
}

function komut(metin) {
  const m = metin.toLocaleLowerCase("tr").trim().replace(/[.!?]+$/, "");
  if (m === "onayla" || m === "onaylıyorum") return "onayla";
  if (m === "iptal" || m === "vazgeç") return "iptal";
  if (m === "geri al") return "geri_al";
  if (m.startsWith("kod:") || m.startsWith("kendine ")) return "kod";
  if (m.startsWith("kurgula")) return "kurgula";
  if (m.startsWith("stil çıkar") || m.startsWith("stil cikar")) return "stil";
  if (m.includes("kurgu durumu")) return "kurgu_durumu";
  return null;
}

// ---------------- Jarvis sesi (Gemini TTS) ----------------
function wavYap(pcm, hz) {
  const h = new ArrayBuffer(44), v = new DataView(h);
  const yaz = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  yaz(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); yaz(8, "WAVE"); yaz(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, hz, true); v.setUint32(28, hz * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  yaz(36, "data"); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h), 0); out.set(pcm, 44);
  return out;
}

async function sesUret(env, metin) {
  const model = env.TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const tarz = env.SES_TARZI ||
    "Sakin, derin, kendinden emin ve kibar bir yapay zeka asistani gibi, biraz hizli ve akici konus: ";
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: tarz + metin }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.SES_ADI || "Charon" } } },
        },
      }),
    }
  );
  if (!r.ok) throw new Error("TTS " + r.status);
  const j = await r.json();
  const p = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData);
  if (!p) throw new Error("TTS bos");
  const bin = atob(p.inlineData.data);
  const pcm = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const hz = parseInt((p.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || "24000");
  return wavYap(pcm, hz);
}

// ---------------- Dinleme (Gemini ile sesi yaziya cevirme) ----------------
async function sesiYaziyaCevir(env, b64) {
  const model = MODELLER(env).dinle;
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: "audio/wav", data: b64 } },
          { text: "Bu ses kaydini oldugu gibi yaziya dok. Konusma genelde Turkce, arada Ingilizce kelimeler olabilir. Sadece soylenen metni yaz, aciklama ekleme. Konusma yoksa bos cevap ver." },
        ] }],
        generationConfig: { temperature: 0 },
      }),
    }
  );
  if (!r.ok) throw new Error("Dinleme " + r.status);
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
}

// ---------------- Groq (cok hizli konusma ve dinleme) ----------------
async function sorGroq(env, sistem, gecmis) {
  const model = env.GROQ_MODEL || "openai/gpt-oss-120b";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: sistem }, ...gecmis],
      max_tokens: 600,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }),
  });
  if (!r.ok) throw new Error("Groq " + r.status);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

async function groqDinle(env, b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "ses.wav");
  form.append("model", env.GROQ_DINLE_MODEL || "whisper-large-v3-turbo");
  form.append("language", "tr");
  form.append("response_format", "json");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.GROQ_API_KEY },
    body: form,
  });
  if (!r.ok) throw new Error("Groq dinleme " + r.status);
  return ((await r.json()).text || "").trim();
}

// ---------------- Sohbet (yazili veya sesli) ----------------
async function sohbetEt(env, metin, sesB64) {
  metin = metin || "";
  if (metin && metin.toLocaleLowerCase("tr").includes("sohbeti sil")) {
    await kvYaz(env, "gecmis", []);
    return { cevap: "Sohbet gecmisini sildim. Notlarim duruyor.", beyin: "sistem" };
  }
  const M = MODELLER(env);
  let gecmis = await kvOku(env, "gecmis", []);
  const notlar = await kvOku(env, "notlar", []);
  const sistem = SISTEM_TEMEL + (notlar.length ? "\n\nEren hakkinda bildiklerin:\n- " + notlar.join("\n- ") : "");
  let cevap, beyin, duydum = metin;

  if (sesB64 && env.GROQ_API_KEY) {
    try {
      metin = await groqDinle(env, sesB64);
      duydum = metin;
      if (!metin) return { duydum: "", cevap: "Seni duyamadım, tekrar dene.", beyin: "sistem" };
      if (komut(metin)) return { duydum: metin, komut: true };
      sesB64 = null; // yazili yoldan devam
    } catch (e) {
      // Groq olmazsa Gemini ile dene
    }
  }

  if (sesB64) {
    // Tek istekte: sesi anla + cevap ver
    beyin = "gemini";
    const taslak = gecmis.slice(-29).concat([{ role: "user", content:
      "Ekteki ses kaydi Eren'in sana soyledigi sey. Once soyledigini oldugu gibi yaziya dok, sonra ona cevap ver. " +
      'SADECE su JSON ile cevap ver: {"duydum": "...", "cevap": "..."}' }]);
    while (taslak.length && taslak[0].role !== "user") taslak.shift();
    const ham = await sorGemini(env, sistem, taslak, M.sohbet, {
      json: true,
      ekParcalar: [{ inlineData: { mimeType: "audio/wav", data: sesB64 } }],
    });
    let j;
    try { j = JSON.parse(ham); } catch (e) { j = { duydum: "", cevap: ham }; }
    duydum = String(j.duydum || "").trim();
    cevap = String(j.cevap || "");
    if (!duydum) return { duydum: "", cevap: "Seni duyamadım, tekrar dene.", beyin: "sistem" };
    const k = komut(duydum);
    if (k) return { duydum, komut: true };
    gecmis.push({ role: "user", content: duydum });
  } else {
    gecmis.push({ role: "user", content: metin });
    beyin = beyinSec(metin);
    if (beyin === "gemini" && env.GROQ_API_KEY) beyin = "groq";
    const son = gecmis.slice(-30);
    while (son.length && son[0].role !== "user") son.shift();
    try {
      if (beyin === "openrouter") cevap = await sorOpenRouter(env, sistem, son);
      else if (beyin === "claude") cevap = await sorClaude(env, sistem, son);
      else if (beyin === "groq") cevap = await sorGroq(env, sistem, son);
      else cevap = await sorGemini(env, sistem, son, M.sohbet);
      if (!cevap) throw new Error("bos cevap");
    } catch (e) {
      try {
        if (beyin === "groq") cevap = await sorGemini(env, sistem, son, M.sohbet);
        else if (beyin === "gemini") cevap = await sorOpenRouter(env, sistem, son);
        else cevap = await sorGemini(env, sistem, son, M.sohbet);
      } catch (e2) {
        return { cevap: "Beyinlere ulasamadim. Hata: " + e.message + " / " + e2.message, beyin };
      }
    }
  }

  cevap = String(cevap || "");
  const yeni = [...cevap.matchAll(/\[HATIRLA:\s*([^\]]+)\]/g)].map((m) => m[1].trim());
  cevap = cevap.replace(/\[HATIRLA:[^\]]*\]/g, "").trim();
  if (yeni.length) await kvYaz(env, "notlar", notlar.concat(yeni).slice(-100));
  gecmis.push({ role: "assistant", content: cevap });
  await kvYaz(env, "gecmis", gecmis.slice(-30));
  return { duydum, cevap, beyin };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(SAYFA, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (request.method === "POST" && url.pathname === "/konus") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      try {
        const { ses = "" } = await request.json();
        return Response.json(await sohbetEt(env, "", ses));
      } catch (e) {
        return Response.json({ hata: e.message }, { status: 502 });
      }
    }
    if (request.method === "POST" && url.pathname === "/dinle") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      try {
        const { ses = "" } = await request.json();
        return Response.json({ metin: await sesiYaziyaCevir(env, ses) });
      } catch (e) {
        return Response.json({ metin: "", hata: e.message }, { status: 502 });
      }
    }
    if (request.method === "POST" && url.pathname === "/ses") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      try {
        const { metin = "" } = await request.json();
        const wav = await sesUret(env, metin.slice(0, 1500));
        return new Response(wav, { headers: { "content-type": "audio/wav" } });
      } catch (e) {
        return new Response(e.message, { status: 502 });
      }
    }
    if (request.method === "POST" && url.pathname === "/sohbet") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      const body = await request.json();
      const metin = body.metin || "";

      const k = komut(metin);
      if (k) {
        if (!env.GITHUB_TOKEN) return Response.json({ cevap: "GitHub anahtarı (GITHUB_TOKEN) eklenmemiş.", beyin: "sistem" });
        try {
          let c;
          if (k === "onayla") c = await kodOnayla(env);
          else if (k === "iptal") { await kvYaz(env, "bekleyen_kod", null); c = "Vazgeçtim, kod değişmedi."; }
          else if (k === "geri_al") c = await geriAl(env);
          else if (k === "kod") c = await kodIstegi(env, metin.replace(/^kod:\s*/i, ""));
          else if (k === "kurgula") c = await kurgula(env, metin);
          else if (k === "stil") c = await stilCikar(env, metin);
          else if (k === "kurgu_durumu") {
            const d = await kurguDurumu(env);
            return Response.json({ cevap: typeof d === "string" ? d : d.cevap, link: d.link, beyin: "sistem" });
          }
          return Response.json({ cevap: c, beyin: "sistem" });
        } catch (e) {
          return Response.json({ cevap: "Olmadı: " + e.message, beyin: "sistem" });
        }
      }

      return Response.json(await sohbetEt(env, metin));
    }
    return new Response("Bulunamadi", { status: 404 });
  },
};
