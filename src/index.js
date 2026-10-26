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

async function sorGemini(env, sistem, gecmis) {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistem }] },
        contents: gecmis.map((g) => ({ role: g.role === "user" ? "user" : "model", parts: [{ text: g.content }] })),
      }),
    }
  );
  if (!r.ok) throw new Error("Gemini " + r.status);
  const j = await r.json();
  const p = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  return (p && p.map((x) => x.text || "").join("")) || "Model bos cevap verdi, tekrar dene.";
}

async function sorOpenRouter(env, sistem, gecmis) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.OPENROUTER_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
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
async function konus(t){
  try{
    var r=await fetch("/ses",{method:"POST",headers:{"Content-Type":"application/json","x-secret":sifre},body:JSON.stringify({metin:t})});
    if(!r.ok)throw new Error("ses");
    var b=await r.blob();
    if(oynatici){oynatici.pause()}
    oynatici=new Audio(URL.createObjectURL(b));
    oynatici.onplay=function(){cember.classList.add("aktif")};
    oynatici.onended=function(){cember.classList.remove("aktif")};
    await oynatici.play();
  }catch(e){tarayiciSesi(t)}
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
btn.onclick=function(){
  if(!SR){ekle("jarvis","Bu tarayici ses tanimayi desteklemiyor. Chrome kullan.");return}
  speechSynthesis.cancel();
  var r=new SR();r.lang="tr-TR";
  r.onstart=function(){btn.classList.add("dinliyor");cember.classList.add("aktif")};
  r.onend=function(){btn.classList.remove("dinliyor");cember.classList.remove("aktif")};
  r.onerror=function(){ekle("jarvis","Seni duyamadim, tekrar dene.")};
  r.onresult=function(e){gonder(e.results[0][0].transcript,true)};
  r.start();
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
  const model = env.KOD_MODEL || env.GEMINI_MODEL || "gemini-flash-latest";
  const cevap = await sorGemini({ ...env, GEMINI_MODEL: model }, sistem, [
    { role: "user", content: "ISTEK: " + istek + "\n\nMEVCUT KOD:\n" + CIT + "js\n" + icerik + "\n" + CIT },
  ]);
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
  const link = (metin.match(/https?:\/\/\S+/) || [])[0];
  if (!link) return "Video linkini de yaz. Örnek: kurgula shorts https://drive.google.com/...";
  const format = /uzun/i.test(metin) ? "uzun" : "shorts";
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { format, video_url: link, plan: "" } }),
  });
  return `Kurguyu başlattım (${format}). 5-10 dakika sürer. 'Kurgu durumu' diye sorabilirsin.`;
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(SAYFA, { headers: { "content-type": "text/html; charset=utf-8" } });
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
          else if (k === "kurgu_durumu") {
            const d = await kurguDurumu(env);
            return Response.json({ cevap: typeof d === "string" ? d : d.cevap, link: d.link, beyin: "sistem" });
          }
          return Response.json({ cevap: c, beyin: "sistem" });
        } catch (e) {
          return Response.json({ cevap: "Olmadı: " + e.message, beyin: "sistem" });
        }
      }

      const kucuk = metin.toLocaleLowerCase("tr");
      if (kucuk.includes("sohbeti sil")) {
        await kvYaz(env, "gecmis", []);
        return Response.json({ cevap: "Sohbet gecmisini sildim. Notlarim duruyor.", beyin: "sistem" });
      }
      let gecmis = await kvOku(env, "gecmis", []);
      const notlar = await kvOku(env, "notlar", []);
      gecmis.push({ role: "user", content: metin });
      gecmis = gecmis.slice(-30);
      while (gecmis.length && gecmis[0].role !== "user") gecmis.shift();
      const sistem = SISTEM_TEMEL + (notlar.length ? "\n\nEren hakkinda bildiklerin:\n- " + notlar.join("\n- ") : "");
      const beyin = beyinSec(metin);
      let cevap;
      try {
        if (beyin === "openrouter") cevap = await sorOpenRouter(env, sistem, gecmis);
        else if (beyin === "claude") cevap = await sorClaude(env, sistem, gecmis);
        else cevap = await sorGemini(env, sistem, gecmis);
      } catch (e) {
        try {
          if (beyin === "gemini") cevap = await sorOpenRouter(env, sistem, gecmis);
          else cevap = await sorGemini(env, sistem, gecmis);
        } catch (e2) {
          return Response.json({ cevap: "Beyinlere ulasamadim. Hata: " + e.message + " / " + e2.message, beyin });
        }
      }
      cevap = String(cevap || "");
      const yeni = [...cevap.matchAll(/\[HATIRLA:\s*([^\]]+)\]/g)].map((m) => m[1].trim());
      cevap = cevap.replace(/\[HATIRLA:[^\]]*\]/g, "").trim();
      if (yeni.length) await kvYaz(env, "notlar", notlar.concat(yeni).slice(-100));
      gecmis.push({ role: "assistant", content: cevap });
      await kvYaz(env, "gecmis", gecmis);
      return Response.json({ cevap, beyin });
    }
    return new Response("Bulunamadi", { status: 404 });
  },
};
