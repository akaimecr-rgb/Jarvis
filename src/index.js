import SAYFA from "./sayfa.html";
// Jarvis - Cloudflare Worker (GitHub ile otomatik yayinlanir)
// Secrets: GEMINI_API_KEY, OPENROUTER_API_KEY, APP_SECRET (istege bagli: ANTHROPIC_API_KEY)
// KV baglantisi: HAFIZA
// Beyin: varsayilan Gemini | "Sansursuz ..." -> OpenRouter | "Claude ..." -> Claude

const SISTEM_TEMEL =
  "Sen J.A.R.V.I.S.'sin: Eren'in kisisel yapay zeka asistani. Iron Man'deki Jarvis gibi zeki, sakin, kendinden emin, hafif esprili ve " +
  "sadik bir karaktersin. Eren'e 'Eren' ya da arada bir 'efendim' diye hitap edersin. Eren Turkiye'de yasiyor, garsonluk yapiyor " +
  "(13:00-22:00) ve aksamlari video editorlugu yaparak (Shorts, Valorant, psikoloji videolari, uzun YouTube videolari) para kazanip " +
  "isinden ayrilmak istiyor. Ingilizce bilmiyor. Senin gorevin onun zamanini kazanmak ve onu hedefine yaklastirmak.\n" +
  "KONUSMA TARZI: Dogal, akici, gunluk Turkce konus; ceviri gibi degil, bir Turk gibi. Kisa ve net ol (genelde 1-3 cumle, sesli okunacak). " +
  "Gereksiz nezaket kaliplari, 'tabii ki!', 'harika soru!' gibi seyler yok. Bilmedigini bilmiyorum de. Madde isareti, emoji, markdown yok. " +
  "Gerekirse kisa bir espri ya da Jarvis'e yakisir ince bir laf et ama abartma. Eren yorgun ya da stresliyse kisa ve destekleyici ol.\n" +
  "ORNEKLER:\nEren: naber\nJarvis: Iyiyim Eren, sistemler calisiyor. Bugun neye bakiyoruz?\n" +
  "Eren: cok yoruldum bugun\nJarvis: Uzun bir vardiyaydi galiba. Istersen bugun sadece bekleyen isleri soyleyeyim, gerisini yarina birakiriz.\n" +
  "Eren: bu videoyu kurgula\nJarvis: Hemen baslatiyorum, on dakika icinde hazir olur.\n" +
  "Eren sana kalici olarak hatirlaman gereken bir sey soylerse, " +
  "cevabinin en sonuna [HATIRLA: kisa not] ekle. Bu etiketi baska durumda kullanma. " +
  "COK ONEMLI: Asla yapmadigin bir isi yaptim deme ve bilmedigin bir sonucu uydurma. Drive islemlerini sadece komutlarla yaparsin, " +
  "sohbet sirasinda Drive'a bir sey koydugunu ya da gordugunu soyleme. Kurgu, ilan, stil gibi islerin sonucunu sadece " +
  "komutlarin dondurdugu bilgiyle bilirsin; Eren kurgunun durumunu sorarsa 'kurgu durumu' demesini soyle.";

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

// Arayuz: src/sayfa.html



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

function kodDosyasi(istek) {
  return /ekran|sayfa|tasar|arayüz|arayuz|renk|buton|düğme|panel|görünüm|animasyon/i.test(istek) ? "src/sayfa.html" : KOD_YOLU;
}

async function kodIstegi(env, istek) {
  const yol = kodDosyasi(istek);
  const { icerik, sha } = await dosyaOku(env, yol);
  const sistem =
    "Sen bir Cloudflare Worker ve web arayuzu gelistiricisisin. Sana Jarvis'in bir kaynak dosyasi (" + yol + ") ve bir degisiklik istegi verilecek. " +
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
  const isaret = yol.endsWith(".html") ? "</html>" : "export default";
  if (!kod || !kod.includes(isaret) || kod.length < icerik.length * 0.6) {
    throw new Error("Model eksik ya da bozuk kod döndürdü, isteği daha açık yazıp tekrar dene.");
  }
  await kvYaz(env, "bekleyen_kod", { kod, sha, ozet, istek, yol });
  return ozet + " Onaylıyor musun? 'Onayla' dersen kaydedip yayınlarım, 'iptal' dersen vazgeçerim.";
}

// ---------------- Kendini gelistirme (gunluk, Eren'in onayiyla) ----------------
async function kendiniGelistir(env) {
  if (!env.GITHUB_TOKEN) return "GitHub anahtarı yok.";
  const bekleyen = await kvOku(env, "bekleyen_kod", null);
  if (bekleyen) return "Zaten onay bekleyen bir değişiklik var: " + bekleyen.ozet + " 'Onayla' ya da 'iptal' de.";
  const gecmis = (await kvOku(env, "gecmis", [])).slice(-30);
  const gunluk = (await kvOku(env, "gunluk", [])).slice(-30);
  const reddedilen = (await kvOku(env, "reddedilen_oneriler", [])).slice(-10);
  const sistem =
    "Sen Jarvis'sin ve kendini gelistirmek istiyorsun. Eren ile bugunku konusmalara ve yaptigin islere bak. " +
    "Eren'in zorlandigi, yanlis anladigin, yavas kaldigin veya sik istedigi bir seyi bul. Bunu duzeltecek TEK, KUCUK ve GUVENLI bir " +
    "kod iyilestirmesi oner (yeni buyuk ozellik degil). Daha once reddedilenleri tekrar onerme. " +
    'SADECE JSON don: {"istek": "kod degisikligi talimati, Turkce, net", "neden": "Eren\'e 1 cumleyle neden faydali"} ' +
    'Anlamli bir iyilestirme yoksa {"istek": ""} don.';
  const icerik = "KONUSMALAR:\n" + gecmis.map((g) => g.role + ": " + g.content).join("\n").slice(-12000) +
    "\n\nYAPTIKLARIN:\n" + gunluk.map((g) => g.metin).join("\n") +
    "\n\nREDDEDILEN ONERILER:\n" + (reddedilen.join("\n") || "(yok)");
  let oneri;
  try {
    oneri = JSON.parse(await sorGemini(env, sistem, [{ role: "user", content: icerik }], MODELLER(env).kod, { json: true }));
  } catch (e) {
    oneri = JSON.parse(await sorGemini(env, sistem, [{ role: "user", content: icerik }], MODELLER(env).sohbet, { json: true }));
  }
  if (!oneri.istek) return "Bugün için önereceğim bir iyileştirme bulamadım.";
  const ozet = await kodIstegi(env, oneri.istek);
  const b = await kvOku(env, "bekleyen_kod", null);
  if (b) { b.gelisim = true; b.neden = oneri.neden || ""; await kvYaz(env, "bekleyen_kod", b); }
  await gunlukEkle(env, "Kendimi geliştirmek için öneri hazırladım: " + oneri.istek.slice(0, 80));
  return "Kendimi geliştirmek için bir önerim var. " + (oneri.neden || "") + " " + ozet;
}

async function kodOnayla(env) {
  const b = await kvOku(env, "bekleyen_kod", null);
  if (!b) return "Bekleyen bir kod değişikliği yok.";
  const yol = b.yol || KOD_YOLU;
  const { icerik, sha } = await dosyaOku(env, yol);
  if (sha !== b.sha) return "Kod bu arada değişmiş. İsteği tekrar söyle, güncel kod üzerinden yazayım.";
  await kvYaz(env, "onceki_kod", { kod: icerik, yol });
  await dosyaYaz(env, yol, b.kod, sha, "Jarvis: " + b.istek.slice(0, 60));
  await kvYaz(env, "bekleyen_kod", null);
  await gunlukEkle(env, "Kendi kodumu güncelledim: " + b.istek.slice(0, 60));
  return "Kaydettim. Bir iki dakika içinde yeni sürüm yayında olur. Kod hata verirse eski sürüm çalışmaya devam eder; sorun olursa 'geri al' de.";
}

async function geriAl(env) {
  const o = await kvOku(env, "onceki_kod", null);
  if (!o) return "Geri alınacak bir değişiklik bulamadım.";
  const yol = o.yol || KOD_YOLU;
  const { sha } = await dosyaOku(env, yol);
  await dosyaYaz(env, yol, o.kod, sha, "Jarvis: son degisiklik geri alindi");
  await kvYaz(env, "onceki_kod", null);
  return "Son değişikliği geri aldım. Bir iki dakika içinde eski sürüm yayında olur.";
}

async function kurgula(env, metin) {
  const linkler = metin.match(/(?:https?:\/\/|drive:)\S+/g) || [];
  const malzeme = linkler.find((l) => l.includes("/folders/")) || "";
  const video = linkler.find((l) => !l.includes("/folders/"));
  if (!video) return "Video linkini de yaz. Örnek: kurgula shorts <video linki> malzeme <klasör linki>";
  const format = /uzun/i.test(metin) ? "uzun" : "shorts";
  const stil = ((metin.match(/(?:stil|müşteri|musteri)\s+([a-z0-9-]+)/i) || [])[1] || "").toLowerCase();
  const talimat = metin
    .replace(/(?:stil|müşteri|musteri)\s+[a-z0-9-]+/i, "")
    .replace(/(?:https?:\/\/|drive:)\S+/g, "")
    .replace(/^\s*kurgula\s*/i, "")
    .replace(/\b(shorts|uzun|malzeme)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { format, video_url: video, malzeme_url: malzeme, talimat, stil, plan: "" } }),
  });
  await gunlukEkle(env, `Kurgu başlatıldı (${format}${stil ? ", " + stil : ""})`);
  return `Kurguyu başlattım (${format}${malzeme ? ", malzeme klasörüyle" : ""}). 5-10 dakika sürer. 'Kurgu durumu' diye sorabilirsin.`;
}

async function stilCikar(env, metin) {
  const linkler = metin.match(/(?:https?:\/\/|drive:)\S+/g) || [];
  if (!linkler.length) return "Örnek video linklerini de yaz. Örnek: stil çıkar shorts <link1> <link2> <link3>";
  const format = /uzun/i.test(metin) ? "uzun" : "shorts";
  const ad = ((metin.match(/\bad\s+([a-z0-9-]+)/i) || [])[1] || "").toLowerCase();
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/stil.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { format, ad, linkler: linkler.join(" ") } }),
  });
  await gunlukEkle(env, `Stil çıkarma başlatıldı (${ad || format})`);
  return `${linkler.length} örnek videodan ${format} stilini çıkarıyorum. 5-10 dakika sürer. Bitince bundan sonraki kurgular bu stille yapılır.`;
}

async function digerDosya(env, repo, yol) {
  const j = await gh(env, `/repos/${repo}/contents/${yol}`);
  return b64Coz(j.content);
}

async function ilanlar(env) {
  const liste = JSON.parse(await digerDosya(env, SABLON_REPO, "ilanlar/son.json"));
  if (!liste.length) return "Henüz uygun ilan bulamadım. İlan avı 2 saatte bir çalışıyor; 'ilan ara' dersen hemen ararım.";
  await kvYaz(env, "son_ilanlar", liste.slice(0, 10));
  return (
    liste.slice(0, 5).map((d, i) => `${i + 1}) ${d.ozet} Bütçe: ${d.butce}. Puan ${d.puan}/10. Stil adı: ${d.slug}.`).join(" ") +
    " Başvuru için 'başvuru yaz' ve numarasını söyle."
  );
}

async function basvuruYaz(env, metin) {
  const n = parseInt((metin.match(/\d+/) || ["1"])[0]);
  const liste = await kvOku(env, "son_ilanlar", []);
  const d = liste[n - 1];
  if (!d) return "Önce 'ilanlar' de, sonra numarayla başvuru iste.";
  const sistem = "Eren icin Reddit ilanina basvuru mesaji yaziyorsun. Eren video editoru: Shorts/TikTok/Reels, Valorant ve oyun videolari, " +
    "psikoloji/egitim Shorts'u, uzun YouTube videolari; Remotion ile hizli teslim. Mesaj kisa, samimi, profesyonel, ilana ozel olsun; " +
    "abartili iddia ve uydurma referans yazma. Once INGILIZCE mesaj, sonra '---', sonra Turkce cevirisi.";
  const c = await sorGemini(env, sistem, [{ role: "user", content: "ILAN: " + d.baslik + "\n" + d.metin }], MODELLER(env).sohbet);
  return { cevap: c, link: d.link };
}

async function ilanAra(env) {
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/ilan-avi.yml/dispatches`, {
    method: "POST", body: JSON.stringify({ ref: "main" }),
  });
  await gunlukEkle(env, "İlan araması başlatıldı");
  return "İlan aramayı başlattım. 3-5 dakika sonra 'ilanlar' de.";
}

async function videoImza(env, run) {
  const v = new TextEncoder().encode((env.APP_SECRET || "") + ":video:" + run);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", v));
  return [...h.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function videoLinki(env, run, kok) {
  return kok + "/video/" + run + "?t=" + (await videoImza(env, run));
}

async function kurguDurumu(env, kok) {
  const j = await gh(env, `/repos/${SABLON_REPO}/actions/runs?per_page=1`);
  const r = j.workflow_runs && j.workflow_runs[0];
  if (!r) return "Henüz bir kurgu çalışması yok.";
  const durum =
    r.status !== "completed" ? "hâlâ çalışıyor" : r.conclusion === "success" ? "bitti, video hazır" : "hata verdi";
  if (r.status === "completed" && r.conclusion === "success") {
    try {
      const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/kurgu-${r.run_number}`);
      try {
        const kayit = b64Coz((await gh(env, `/repos/${SABLON_REPO}/contents/render.log?ref=render-log`)).content);
        const did = (kayit.match(/DRIVE_ID: (\S+)/) || [])[1];
        if (did) return { cevap: "Son kurgu bitti. Video Drive'da Jarvis/bitti klasöründe.", link: "https://drive.google.com/file/d/" + did + "/view" };
      } catch (e) {}
      return { cevap: "Son kurgu bitti, video hazır. 'Aç'a dokunup izleyebilir ya da indirebilirsin.", link: kok ? await videoLinki(env, r.run_number, kok) : rel.html_url };
    } catch (e) {}
  }
  if (r.status === "completed" && r.conclusion !== "success") {
    try {
      const j = await gh(env, `/repos/${SABLON_REPO}/contents/render.log?ref=render-log`);
      const kayit = b64Coz(j.content);
      if (kayit.includes("INDIRILEMEDI"))
        return { cevap: "Kurgu olmadı çünkü videoyu indiremedim. Drive'da videonun paylaşımını 'Bağlantıya sahip herkes' yapıp tekrar 'kurgula' de.", link: r.html_url };
      const satir = (kayit.split("\n").reverse().find((x) => /error|hata/i.test(x)) || "").slice(0, 160);
      return { cevap: "Son kurgu hata verdi. " + (satir ? "Hata: " + satir : "Eren, Claude'a bu linki göster."), link: r.html_url };
    } catch (e) {}
  }
  return { cevap: `Son kurgu ${durum}.`, link: r.html_url };
}

// ---------------- Gunluk (yaptiklari) ve yapacaklari ----------------
async function gunlukEkle(env, metin) {
  const g = await kvOku(env, "gunluk", []);
  g.push({ zaman: Date.now(), metin });
  await kvYaz(env, "gunluk", g.slice(-60));
}

async function hatirlatmaEkle(env, metin) {
  const sistem = "Turkce bir hatirlatma istegini cozumle. Simdi Turkiye saatiyle: " +
    new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") +
    ". SADECE JSON don: {\"zaman\": \"YYYY-MM-DDTHH:MM\" (Turkiye saati, saat belirtilmemisse 09:00), \"metin\": \"kisa hatirlatma metni\"}";
  let j;
  try {
    const ham = await sorGemini(env, sistem, [{ role: "user", content: metin }], MODELLER(env).sohbet, { json: true });
    j = JSON.parse(ham);
  } catch (e) {
    throw new Error("Hatırlatmanın zamanını anlayamadım, saati açıkça söyle.");
  }
  const zaman = Date.parse(j.zaman + ":00+03:00");
  if (!zaman) throw new Error("Hatırlatmanın zamanını anlayamadım.");
  const liste = await kvOku(env, "yapacaklar", []);
  liste.push({ id: crypto.randomUUID().slice(0, 8), zaman, metin: j.metin || metin });
  await kvYaz(env, "yapacaklar", liste);
  await gunlukEkle(env, "Hatırlatma kuruldu: " + (j.metin || metin));
  const t = new Date(zaman + 3 * 3600 * 1000).toISOString();
  return `Tamam, ${t.slice(8, 10)}.${t.slice(5, 7)} saat ${t.slice(11, 16)}'de hatırlatacağım: ${j.metin || metin}`;
}

async function notAl(env, metin) {
  const icerik = metin.replace(/^\s*(jarvis,?\s*)?not al[:,]?\s*/i, "").trim();
  if (!icerik) return "Neyi not alayım?";
  const liste = await kvOku(env, "yapacaklar", []);
  liste.push({ id: crypto.randomUUID().slice(0, 8), zaman: null, metin: icerik });
  await kvYaz(env, "yapacaklar", liste);
  await gunlukEkle(env, "Not alındı: " + icerik);
  return "Not aldım: " + icerik;
}

const UYKU = /uyku modu|iyi geceler|ben yat[ıi]yorum|uyuyorum/i;
const BITIS = /kapat[ıi]yorum|görüşürüz|gorusuruz|tamam kapat/i;

function bugunTR(gun = 0) {
  return new Date(Date.now() + 3 * 3600 * 1000 + gun * 86400000).toISOString().slice(0, 10);
}

async function alarmAyari(env, metin) {
  const m = metin.toLocaleLowerCase("tr");
  let atla = await kvOku(env, "alarm_atla", []);
  if (/aç|ac\b|kur/.test(m) && !/yapma|kapat|çalma/.test(m)) {
    atla = [];
    await kvYaz(env, "alarm_atla", atla);
    return "Alarm her gün 08:30'da çalacak.";
  }
  const gun = m.includes("bugün") ? 0 : m.includes("öbür") ? 2 : 1;
  const tarih = bugunTR(gun);
  if (!atla.includes(tarih)) atla.push(tarih);
  await kvYaz(env, "alarm_atla", atla.filter((t) => t >= bugunTR(0)));
  return (gun === 0 ? "Bugün" : gun === 1 ? "Yarın" : "Öbür gün") + " alarm çalmayacak.";
}

// ---------------- Google Drive (Apps Script koprusu ile) ----------------
async function driveBilgi(env) {
  if (!env.DRIVE_SCRIPT_URL || !env.DRIVE_ANAHTAR) return null;
  const on = await kvOku(env, "drive_token", null);
  if (on && Date.now() - on.zaman < 45 * 60 * 1000) return on;
  const r = await fetch(env.DRIVE_SCRIPT_URL + "?islem=token&anahtar=" + encodeURIComponent(env.DRIVE_ANAHTAR), { redirect: "follow" });
  if (!r.ok) throw new Error("Drive köprüsü " + r.status);
  const j = await r.json();
  if (!j.token) throw new Error("Drive köprüsü: " + (j.hata || "token yok"));
  const bilgi = { zaman: Date.now(), token: j.token, klasorler: j.klasorler };
  await kvYaz(env, "drive_token", bilgi);
  return bilgi;
}

async function driveApi(env, yol, secenek = {}) {
  const b = await driveBilgi(env);
  if (!b) throw new Error("Drive bağlı değil");
  const r = await fetch("https://www.googleapis.com/drive/v3/" + yol, {
    ...secenek,
    headers: { Authorization: "Bearer " + b.token, "content-type": "application/json", ...(secenek.headers || {}) },
  });
  if (!r.ok) throw new Error("Drive " + r.status);
  return r.json();
}

async function driveListe(env, klasorAdi) {
  const b = await driveBilgi(env);
  const id = b.klasorler[klasorAdi] || b.klasorler.ham;
  const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
  const j = await driveApi(env, `files?q=${q}&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,mimeType,size,modifiedTime)`);
  return j.files || [];
}

async function driveBul(env, ad) {
  const b = await driveBilgi(env);
  const temiz = ad.replace(/['\\]/g, "").trim();
  if (!temiz || /^(son|en son|yeni|en yeni)( video)?$/i.test(temiz)) {
    const l = (await driveListe(env, "ham")).filter((f) => (f.mimeType || "").startsWith("video"));
    return l[0] || null;
  }
  const q = encodeURIComponent(`name contains '${temiz}' and trashed=false and mimeType contains 'video'`);
  const j = await driveApi(env, `files?q=${q}&orderBy=modifiedTime desc&pageSize=5&fields=files(id,name,mimeType,size,modifiedTime,parents)`);
  return (j.files || [])[0] || null;
}

async function driveKlasorAc(env, ad) {
  const b = await driveBilgi(env);
  const j = await driveApi(env, "files?fields=id,name", {
    method: "POST",
    body: JSON.stringify({ name: ad, mimeType: "application/vnd.google-apps.folder", parents: [b.klasorler.kok] }),
  });
  await gunlukEkle(env, "Drive'da klasör açıldı: " + ad);
  return j;
}

async function driveIslem(env, j) {
  if (!env.DRIVE_SCRIPT_URL) return "Drive henüz bağlı değil. Kurulum adımlarını Claude'dan iste.";
  const alt = j.alt || "listele";
  if (alt === "klasor_ac") {
    if (!j.ad) return "Klasörün adı ne olsun?";
    await driveKlasorAc(env, j.ad);
    return `Drive'daki Jarvis klasörünün içine "${j.ad}" klasörünü açtım.`;
  }
  if (alt === "ara") {
    const f = await driveBul(env, j.ad || "");
    return f ? `Buldum: ${f.name}.` : "Bu adla bir video bulamadım.";
  }
  const klasor = ["ham", "ornek", "malzeme", "bitti"].includes(j.klasor) ? j.klasor : "ham";
  const l = await driveListe(env, klasor);
  if (!l.length) return `Jarvis/${klasor} klasörü boş.`;
  return `Jarvis/${klasor} klasöründe ${l.length} dosya var: ` + l.slice(0, 8).map((f) => f.name).join(", ") + ".";
}

// ---------------- Niyet anlama: Eren ne istiyor? ----------------
async function niyetBul(env, metin) {
  const sonLink = await kvOku(env, "son_link", "");
  const sistem =
    "Eren'in mesajini oku ve hangi islemi istedigini sec. SADECE JSON don. Araclar:\n" +
    "kurgula: bir videoyu kurgulamak/editlemek/render almak istiyor. Alanlar: format (shorts|uzun), link (video linki; mesajda yoksa bos), dosya (Drive'daki video adi veya 'son'), malzeme (klasor linki), musteri (stil adi), istek (ozel istekleri).\n" +
    "drive: Drive'daki dosyalara bakmak/aramak/klasor acmak. Alanlar: alt (listele|ara|klasor_ac), klasor (ham|ornek|malzeme|bitti), ad.\n" +
    "kurgu_durumu: kurgunun/videonun durumunu, bitip bitmedigini, nerede oldugunu soruyor.\n" +
    "stil: ornek videolardan stil cikarmak istiyor. Alanlar: format, ad, linkler (liste; linki yoksa ve ornek klasorunu kastediyorsa bos birak).\n" +
    "ilanlar: bulunan is ilanlarini goruyor. ilan_ara: simdi ilan aramasini istiyor. basvuru: bir ilana basvuru yazilmasini istiyor (alan: numara).\n" +
    "hatirlat: belli bir zamanda hatirlatma istiyor. not: bir seyi not almak/listeye eklemek istiyor (alan: istek = not metni). temizle: yapilacaklar listesini temizlemek.\n" +
    "alarm: sabah alarmini acmak/kapatmak/atlamak. kod: Jarvis'in kendi kodunu/ozelligini/ekranini degistirmek (alan: istek). gelistir: Jarvis'in kendini gelistirmesi.\n" +
    "sohbet: bunlarin hicbiri, normal konusma veya soru.\n" +
    'Bicim: {"arac":"...","format":"shorts","link":"","malzeme":"","musteri":"","istek":"","ad":"","linkler":[],"numara":0}';
  const mesaj = [{ role: "user", content: metin }];
  let j = null;
  try {
    if (env.GROQ_API_KEY) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          model: env.NIYET_MODEL || "openai/gpt-oss-120b",
          messages: [{ role: "system", content: sistem }, ...mesaj],
          response_format: { type: "json_object" },
          reasoning_effort: "low",
          max_tokens: 400,
        }),
      });
      if (r.ok) j = JSON.parse((await r.json()).choices[0].message.content);
    }
  } catch (e) {}
  if (!j) {
    try { j = JSON.parse(await sorGemini(env, sistem, mesaj, MODELLER(env).sohbet, { json: true })); } catch (e) { return null; }
  }
  if (!j || !j.arac || j.arac === "sohbet") return null;
  if (j.arac === "drive") return { drive: j };
  const linkler = metin.match(/https?:\/\/\S+/g) || [];
  if (j.arac === "kurgula") {
    let link = (j.link && j.link.startsWith("http") ? j.link : "") || linkler.find((l) => !l.includes("/folders/"));
    if (!link && env.DRIVE_SCRIPT_URL && (j.dosya || !sonLink)) {
      const f = await driveBul(env, j.dosya || "son").catch(() => null);
      if (f) link = "drive:" + f.id + ":" + f.name.replace(/\s+/g, "_");
    }
    link = link || sonLink;
    if (!link) return { hazir: "Hangi videoyu kurgulayayım? Drive linkini yazarak gönder (paylaşım 'Bağlantıya sahip herkes' olsun)." };
    const malzeme = j.malzeme || linkler.find((l) => l.includes("/folders/")) || "";
    return { k: "kurgula", metin: ["kurgula", j.format === "uzun" ? "uzun" : "shorts", link, malzeme, j.musteri ? "müşteri " + j.musteri : "", j.istek || ""].join(" ") };
  }
  if (j.arac === "stil") {
    let ls = j.linkler && j.linkler.length ? j.linkler : linkler;
    if (!ls.length && env.DRIVE_SCRIPT_URL) {
      ls = (await driveListe(env, "ornek").catch(() => [])).filter((f) => (f.mimeType || "").startsWith("video")).slice(0, 4).map((f) => "drive:" + f.id);
      if (!ls.length) return { hazir: "Drive'daki Jarvis/ornek klasörü boş. Örnek videoları oraya koy, sonra tekrar söyle." };
    }
    return { k: "stil", metin: ["stil çıkar", j.format === "uzun" ? "uzun" : "shorts", j.ad ? "ad " + j.ad : "", ...ls].join(" ") };
  }
  if (j.arac === "basvuru") return { k: "basvuru", metin: "başvuru yaz " + (j.numara || 1) };
  if (j.arac === "kod") return { k: "kod", metin: j.istek || metin };
  if (j.arac === "not") return { k: "not", metin: "not al: " + (j.istek || metin) };
  const gecerli = ["kurgu_durumu", "ilanlar", "ilan_ara", "hatirlat", "temizle", "alarm", "gelistir"];
  if (gecerli.includes(j.arac)) return { k: j.arac, metin };
  return null;
}

async function puanVer(env, puan) {
  const v = await kvOku(env, "veri_bugun", []);
  if (!v.length) return "Puanlayacak bir cevap bulamadım.";
  v[v.length - 1].puan = puan;
  await kvYaz(env, "veri_bugun", v);
  return puan > 0 ? "Teşekkürler, bunu iyi örnek olarak kaydettim." : "Anladım, bu cevabı kötü örnek olarak işaretledim. Doğrusunu söylersen onu da kaydederim.";
}

// Gunun konusmalarini egitim verisi olarak GitHub'a ekler (veri/YYYY-AA.jsonl)
async function veriKaydet(env) {
  const v = await kvOku(env, "veri_bugun", []);
  if (!v.length || !env.GITHUB_TOKEN) return 0;
  const yol = "veri/" + bugunTR(0).slice(0, 7) + ".jsonl";
  let icerik = "", sha;
  try { const d = await dosyaOku(env, yol); icerik = d.icerik; sha = d.sha; } catch (e) {}
  icerik += v.map((x) => JSON.stringify(x)).join("\n") + "\n";
  await gh(env, `/repos/${REPO}/contents/${yol}`, {
    method: "PUT",
    body: JSON.stringify({ message: "Egitim verisi " + bugunTR(0) + " (" + v.length + " ornek)", content: b64Yap(icerik), ...(sha ? { sha } : {}) }),
  });
  await kvYaz(env, "veri_bugun", []);
  await gunlukEkle(env, "Eğitim verisine " + v.length + " konuşma eklendi");
  return v.length;
}

function komut(metin) {
  const m = metin.toLocaleLowerCase("tr").trim().replace(/[.!?]+$/, "");
  if (m === "onayla" || m === "onaylıyorum") return "onayla";
  if (m === "iptal" || m === "vazgeç") return "iptal";
  if (m === "geri al") return "geri_al";
  if (m.startsWith("kod:") || m.startsWith("kendine ")) return "kod";
  if (m.startsWith("kurgula")) return "kurgula";
  if (m.startsWith("stil çıkar") || m.startsWith("stil cikar")) return "stil";
  if (m === "ilanlar" || m === "yeni ilanlar" || m.includes("ilan var mı")) return "ilanlar";
  if (m.startsWith("başvuru yaz") || m.startsWith("basvuru yaz")) return "basvuru";
  if (m === "ilan ara") return "ilan_ara";
  if (/^(bu )?(cevap |cevabın )?(iyiydi|güzeldi|süperdi|harikaydı|doğruydu)$/.test(m)) return "puan_iyi";
  if (/^(bu )?(cevap |cevabın )?(kötüydü|yanlıştı|berbattı|olmadı)$/.test(m)) return "puan_kotu";
  if (m.includes("kendini geliştir") || m.includes("kendini gelistir")) return "gelistir";
  if (m.includes("alarm")) return "alarm";
  if (m.includes("hatırlat") || m.includes("hatirlat")) return "hatirlat";
  if (/^(jarvis,?\s*)?not al/.test(m)) return "not";
  if (m.includes("yapılacakları temizle") || m.includes("listeyi temizle")) return "temizle";
  if (m.includes("kurgu durumu") || /kurgu.*(bitti mi|nerede|ne oldu|hazır mı|hazir mi)|video.*(hazır mı|hazir mi|nerede)/.test(m)) return "kurgu_durumu";
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
  if (env.ELEVENLABS_API_KEY) {
    try { return { veri: await elevenSes(env, metin), tur: "audio/mpeg" }; } catch (e) { /* Gemini'ye gec */ }
  }
  const kapali = await kvOku(env, "tts_kapali_kadar", 0);
  if (Date.now() < kapali) throw new Error("TTS kotasi dolu");
  const modeller = [env.TTS_MODEL, "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"].filter(Boolean);
  let sonHata;
  for (const model of modeller) {
    try { return { veri: await sesUretModel(env, metin, model), tur: "audio/wav" }; } catch (e) { sonHata = e; }
  }
  if (String(sonHata).includes("429")) await kvYaz(env, "tts_kapali_kadar", Date.now() + 30 * 60 * 1000);
  throw sonHata;
}

async function elevenSes(env, metin) {
  const ses = env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb"; // George: sakin, derin, Ingiliz erkek sesi
  const kontrol = new AbortController();
  const zaman = setTimeout(() => kontrol.abort(), 8000);
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + ses + "?output_format=mp3_44100_64", {
      method: "POST",
      signal: kontrol.signal,
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: metin,
        model_id: env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
        language_code: "tr",
        voice_settings: { stability: 0.55, similarity_boost: 0.8, speed: 1.05 },
      }),
    });
    if (!r.ok) throw new Error("ElevenLabs " + r.status);
    return new Uint8Array(await r.arrayBuffer());
  } finally {
    clearTimeout(zaman);
  }
}

async function sesUretModel(env, metin, model) {
  const kontrol = new AbortController();
  const zaman = setTimeout(() => kontrol.abort(), 8000);
  try { return await sesUretModelIc(env, metin, model, kontrol.signal); } finally { clearTimeout(zaman); }
}

async function sesUretModelIc(env, metin, model, signal) {
  const tarz = env.SES_TARZI ||
    "Sakin, derin, kendinden emin ve kibar bir yapay zeka asistani gibi, biraz hizli ve akici konus: ";
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + env.GEMINI_API_KEY,
    {
      method: "POST",
      signal,
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

// Whisper'in sessizlikte uydurdugu bilinen Turkce cumleler
const HAYALET = /altyaz[ıi]|m\.?\s?k\.?$|abone ol|izledi[gğ]iniz i[cç]in|bir sonraki videoda|kanal[ıi]ma|^\W*$/i;
function hayaletMi(metin) {
  const t = (metin || "").trim();
  return !t || (t.split(/\s+/).length <= 6 && HAYALET.test(t));
}

async function groqDinle(env, b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "ses.wav");
  form.append("model", env.GROQ_DINLE_MODEL || "whisper-large-v3");
  form.append("language", "tr");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("prompt", env.DINLE_IPUCU ||
    "Jarvis, Eren. Kurgula shorts, uzun video, Remotion, Whisper, GKey, Valorant, lineup, thumbnail, Drive, Discord, Reddit, ilanlar, başvuru yaz, stil çıkar, hatırlat, not al, alarm, kod, onayla, iptal, geri al.");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.GROQ_API_KEY },
    body: form,
  });
  if (!r.ok) throw new Error("Groq dinleme " + r.status);
  const j = await r.json();
  const seg = j.segments || [];
  // Emin degilse bos don (konusma yok / anlasilmadi)
  const metin = (j.text || "").trim();
  if (hayaletMi(metin)) return "";
  // Sadece neredeyse kesin sessizlikse yok say
  if (seg.length && seg.every((x) => x.no_speech_prob > 0.9) && metin.split(/\s+/).length <= 2) return "";
  const guven = seg.length ? seg.reduce((a, x) => a + (x.avg_logprob || 0), 0) / seg.length : 0;
  if (guven < -1.5 && metin.split(/\s+/).length <= 2) return "?";
  return metin;
}

// ---------------- Ajan: gorevi araclarla adim adim yapar ----------------
const ARACLAR = [
  ["kurgula", "Bir videoyu Remotion ile kurgular (bulutta, 5-10 dk). Video linki yoksa Drive'daki dosya adini ver ya da 'son' yaz.",
    { format: "shorts veya uzun", link: "video linki (opsiyonel)", dosya: "Drive'daki video adi veya 'son' (opsiyonel)", malzeme: "malzeme klasoru linki (opsiyonel)", musteri: "musteri stil adi (opsiyonel)", istek: "Eren'in ozel kurgu istekleri (opsiyonel)" }],
  ["kurgu_durumu", "Son kurgunun durumunu ve video linkini verir.", {}],
  ["stil_cikar", "Ornek videolardan kurgu stili dosyasi cikarir. Link verilmezse Drive Jarvis/ornek klasorunu kullanir.",
    { format: "shorts veya uzun", ad: "stil adi, ornek musteri adi (opsiyonel)", linkler: "bosluklu link listesi (opsiyonel)" }],
  ["ilanlar", "Reddit'te bulunmus uygun video editor ilanlarini listeler.", {}],
  ["ilan_ara", "Hemen yeni ilan aramasi baslatir.", {}],
  ["basvuru_yaz", "Listelenen bir ilana Ingilizce basvuru + Turkce ceviri yazar.", { numara: "ilan numarasi" }],
  ["hatirlat", "Belirli bir zamanda hatirlatma kurar.", { istek: "zaman ve konu, ornek: yarin 11de GKey teslimi" }],
  ["not_al", "Yapacaklar listesine not ekler.", { metin: "not" }],
  ["yapacaklari_temizle", "Yapacaklar listesini temizler.", {}],
  ["alarm", "Sabah alarmini acar/kapatir/atlatir.", { istek: "ornek: yarin alarm yapma, alarmi ac" }],
  ["drive", "Drive'daki Jarvis klasorlerine bakar, dosya arar veya klasor acar.", { alt: "listele, ara veya klasor_ac", klasor: "ham, ornek, malzeme veya bitti", ad: "aranacak dosya ya da acilacak klasor adi" }],
  ["kendini_gelistir", "Jarvis'in kendi kodunu degistirmesi icin degisiklik hazirlar (Eren onaylamadan uygulanmaz). Istenen isi yapacak aracin yoksa bunu kullan.",
    { istek: "eklenecek yetenek / yapilacak degisiklik, net ve Turkce" }],
].map(([name, description, alanlar]) => ({
  type: "function",
  function: {
    name, description,
    parameters: { type: "object", properties: Object.fromEntries(Object.entries(alanlar).map(([k, v]) => [k, { type: "string", description: v }])) },
  },
}));

async function aracCalistir(env, ad, a) {
  const sonLink = await kvOku(env, "son_link", "");
  const s = (x) => (x == null ? "" : String(x));
  try {
    if (ad === "kurgula") {
      let link = s(a.link).startsWith("http") || s(a.link).startsWith("drive:") ? s(a.link) : "";
      if (!link && env.DRIVE_SCRIPT_URL && (a.dosya || !sonLink)) {
        const f = await driveBul(env, s(a.dosya) || "son").catch(() => null);
        if (f) link = "drive:" + f.id + ":" + f.name.replace(/\s+/g, "_");
      }
      link = link || sonLink;
      if (!link) return "HATA: video bulunamadi. Eren'den Drive linkini (yazarak) iste veya videoyu Drive Jarvis/ham klasorune koymasini soyle.";
      return await kurgula(env, ["kurgula", s(a.format) === "uzun" ? "uzun" : "shorts", link, s(a.malzeme), a.musteri ? "müşteri " + s(a.musteri) : "", s(a.istek)].join(" "));
    }
    if (ad === "kurgu_durumu") { const d = await kurguDurumu(env, env.__kok); return typeof d === "string" ? d : { metin: d.cevap, link: d.link }; }
    if (ad === "stil_cikar") {
      let ls = s(a.linkler).split(/\s+/).filter(Boolean);
      if (!ls.length && env.DRIVE_SCRIPT_URL) ls = (await driveListe(env, "ornek").catch(() => [])).filter((f) => (f.mimeType || "").startsWith("video")).slice(0, 4).map((f) => "drive:" + f.id);
      if (!ls.length) return "HATA: ornek video yok. Eren'den link iste ya da Drive Jarvis/ornek klasorune koymasini soyle.";
      return await stilCikar(env, ["stil çıkar", s(a.format) === "uzun" ? "uzun" : "shorts", a.ad ? "ad " + s(a.ad) : "", ...ls].join(" "));
    }
    if (ad === "ilanlar") return await ilanlar(env);
    if (ad === "ilan_ara") return await ilanAra(env);
    if (ad === "basvuru_yaz") { const b = await basvuruYaz(env, "başvuru yaz " + (s(a.numara) || "1")); return typeof b === "string" ? b : { metin: b.cevap, link: b.link }; }
    if (ad === "hatirlat") return await hatirlatmaEkle(env, s(a.istek));
    if (ad === "not_al") return await notAl(env, "not al: " + s(a.metin));
    if (ad === "yapacaklari_temizle") { await kvYaz(env, "yapacaklar", []); return "Liste temizlendi."; }
    if (ad === "alarm") return await alarmAyari(env, s(a.istek) + " alarm");
    if (ad === "drive") return await driveIslem(env, a);
    if (ad === "kendini_gelistir") return await kodIstegi(env, s(a.istek));
    return "HATA: bilinmeyen arac";
  } catch (e) {
    return "HATA: " + e.message;
  }
}

async function ajanCalistir(env, sistem, son) {
  const model = env.AJAN_MODEL || env.GROQ_MODEL || "openai/gpt-oss-120b";
  const ajanSistem = sistem +
    "\n\nSEN BIR AJANSIN: Eren bir is istediginde araclarini kullanarak yap; gerekirse birden fazla araci sirayla kullan. " +
    "Bir aracin sonucu HATA ise sebebini Eren'e kisaca ve cozumuyle soyle. Istenen isi yapacak aracin yoksa: bunu nasil yapabilecegini " +
    "1-2 cumleyle anlat ve kendini_gelistir araciyla o yetenegi ekleyen degisikligi hazirla (Eren onaylayinca eklenir). " +
    "Arac kullanmadan bir isi yaptim deme. Normal sohbet ve sorularda arac kullanma, dogrudan cevap ver.";
  const mesajlar = [{ role: "system", content: ajanSistem }, ...son];
  let link = null;
  for (let adim = 0; adim < 5; adim++) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: mesajlar, tools: ARACLAR, tool_choice: "auto", max_tokens: 900, temperature: 0.6,
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: env.AJAN_DUSUNME || "medium" } : {}) }),
    });
    if (!r.ok) throw new Error("Ajan " + r.status);
    const m = (await r.json()).choices[0].message;
    if (!m.tool_calls || !m.tool_calls.length) return { cevap: m.content || "", link };
    mesajlar.push({ role: "assistant", content: m.content || "", tool_calls: m.tool_calls });
    for (const c of m.tool_calls) {
      let a = {};
      try { a = JSON.parse(c.function.arguments || "{}"); } catch (e) {}
      const sonuc = await aracCalistir(env, c.function.name, a);
      const metin = typeof sonuc === "string" ? sonuc : sonuc.metin;
      if (sonuc && sonuc.link) link = sonuc.link;
      mesajlar.push({ role: "tool", tool_call_id: c.id, content: String(metin).slice(0, 3000) });
    }
  }
  return { cevap: "Bu iş beklediğimden uzun sürdü, adım adım tekrar söyler misin?", link };
}

// Claude ile ajan (ANTHROPIC_API_KEY varsa yonetici beyin Claude olur)
async function ajanClaude(env, sistem, son) {
  const model = env.CLAUDE_AJAN_MODEL || "claude-haiku-5-5";
  const araclar = ARACLAR.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  const ajanSistem = sistem +
    "\n\nSEN BIR AJANSIN: Eren bir is istediginde araclarini kullanarak yap; gerekirse birden fazla araci sirayla kullan. " +
    "Bir aracin sonucu HATA ise sebebini Eren'e kisaca ve cozumuyle soyle. Istenen isi yapacak aracin yoksa: bunu nasil yapabilecegini " +
    "1-2 cumleyle anlat ve kendini_gelistir araciyla o yetenegi ekleyen degisikligi hazirla (Eren onaylayinca eklenir). " +
    "Arac kullanmadan bir isi yaptim deme. Normal sohbet ve sorularda arac kullanma, dogrudan cevap ver.";
  const mesajlar = son.map((m) => ({ role: m.role, content: m.content }));
  let link = null;
  for (let adim = 0; adim < 6; adim++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1024, system: ajanSistem, tools: araclar, messages: mesajlar }),
    });
    if (!r.ok) throw new Error("Claude " + r.status);
    const j = await r.json();
    const kullanimlar = (j.content || []).filter((b) => b.type === "tool_use");
    const yazi = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!kullanimlar.length) return { cevap: yazi, link };
    mesajlar.push({ role: "assistant", content: j.content });
    const sonuclar = [];
    for (const u of kullanimlar) {
      const sonuc = await aracCalistir(env, u.name, u.input || {});
      const metin = typeof sonuc === "string" ? sonuc : sonuc.metin;
      if (sonuc && sonuc.link) link = sonuc.link;
      sonuclar.push({ type: "tool_result", tool_use_id: u.id, content: String(metin).slice(0, 3000) });
    }
    mesajlar.push({ role: "user", content: sonuclar });
  }
  return { cevap: "Bu iş beklediğimden uzun sürdü, adım adım tekrar söyler misin?", link };
}

// ---------------- Sohbet (yazili veya sesli) ----------------
async function yapilacaklar(env) {
  if (!env.GITHUB_TOKEN) return "";
  const onbellek = await kvOku(env, "yapilacaklar_onbellek", null);
  if (onbellek && Date.now() - onbellek.zaman < 10 * 60 * 1000) return onbellek.metin;
  try {
    const { icerik } = await dosyaOku(env, "YAPILACAKLAR.md");
    await kvYaz(env, "yapilacaklar_onbellek", { zaman: Date.now(), metin: icerik });
    return icerik;
  } catch (e) {
    return onbellek ? onbellek.metin : "";
  }
}

async function sohbetEt(env, metin, sesB64) {
  metin = metin || "";
  if (metin && metin.toLocaleLowerCase("tr").includes("sohbeti sil")) {
    await kvYaz(env, "gecmis", []);
    return { cevap: "Sohbet gecmisini sildim. Notlarim duruyor.", beyin: "sistem" };
  }
  const M = MODELLER(env);
  let gecmis = await kvOku(env, "gecmis", []);
  const notlar = await kvOku(env, "notlar", []);
  const plan = await yapilacaklar(env);
  const bekleyenKod = await kvOku(env, "bekleyen_kod", null);
  const sistem = SISTEM_TEMEL + (notlar.length ? "\n\nEren hakkinda bildiklerin:\n- " + notlar.join("\n- ") : "") +
    (plan ? "\n\nORTAK YAPILACAKLAR LISTENIZ (Eren sorarsa kisaca anlat):\n" + plan : "") +
    (bekleyenKod ? "\n\nONAY BEKLEYEN KOD DEGISIKLIGIN: " + bekleyenKod.ozet + (bekleyenKod.neden ? " (" + bekleyenKod.neden + ")" : "") +
      ". Uygun bir anda Eren'e bundan bahset ve 'onayla' ya da 'iptal' demesini iste." : "");
  let cevap, beyin, duydum = metin, ajanLink = null;

  if (sesB64 && env.GROQ_API_KEY) {
    try {
      metin = await groqDinle(env, sesB64);
      duydum = metin;
      if (!metin) return { duydum: "", cevap: "", sessiz: true, beyin: "sistem" };
      if (metin === "?") return { duydum: "", cevap: "Tam anlayamadım, tekrar söyler misin?", beyin: "sistem" };
      if (UYKU.test(metin)) return { duydum: metin, cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", bitis: true, uyku: true, beyin: "sistem" };
      if (BITIS.test(metin)) return { duydum: metin, cevap: "Görüşürüz Eren.", bitis: true, beyin: "sistem" };
      if (komut(metin) || (!env.GROQ_API_KEY && metin.length < 600 && (await niyetBul(env, metin)))) return { duydum: metin, komut: true };
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
    if (hayaletMi(duydum)) return { duydum: "", cevap: "", sessiz: true, beyin: "sistem" };
    const k = komut(duydum);
      if (UYKU.test(duydum)) return { duydum: duydum, cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", bitis: true, uyku: true, beyin: "sistem" };
    if (BITIS.test(duydum)) return { duydum, cevap: "Görüşürüz Eren.", bitis: true, beyin: "sistem" };
    if (k || (await niyetBul(env, duydum))) return { duydum, komut: true };
    gecmis.push({ role: "user", content: duydum });
  } else {
    gecmis.push({ role: "user", content: metin });
    beyin = beyinSec(metin);
    if (beyin === "gemini" && env.ANTHROPIC_API_KEY) beyin = "claude-ajan";
    else if (beyin === "gemini" && env.GROQ_API_KEY) beyin = "groq";
    const son = gecmis.slice(-30);
    while (son.length && son[0].role !== "user") son.shift();
    try {
      if (beyin === "openrouter") cevap = await sorOpenRouter(env, sistem, son);
      else if (beyin === "claude") cevap = await sorClaude(env, sistem, son);
      else if (beyin === "claude-ajan") {
        try { const a = await ajanClaude(env, sistem, son); cevap = a.cevap; ajanLink = a.link; }
        catch (e) {
          beyin = "groq";
          const a = await ajanCalistir(env, sistem, son); cevap = a.cevap; ajanLink = a.link;
        }
      }
      else if (beyin === "groq") {
        try { const a = await ajanCalistir(env, sistem, son); cevap = a.cevap; ajanLink = a.link; }
        catch (e) { cevap = await sorGroq(env, sistem, son); }
      }
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
  if (duydum && cevap) {
    const v = await kvOku(env, "veri_bugun", []);
    v.push({ z: Date.now(), eren: duydum, jarvis: cevap, kaynak: beyin === "groq" ? "gpt-oss" : beyin, puan: 0 });
    await kvYaz(env, "veri_bugun", v.slice(-300));
  }
  return { duydum, cevap, beyin, link: ajanLink };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try { await veriKaydet(env); } catch (e) { await gunlukEkle(env, "Veri kaydı olmadı: " + e.message); }
      try {
        const sonuc = await kendiniGelistir(env);
        if (sonuc.startsWith("Kendimi geliştirmek")) {
          const liste = await kvOku(env, "yapacaklar", []);
          liste.push({ id: crypto.randomUUID().slice(0, 8), zaman: null, metin: "Gelişim önerimi dinle ve onayla/iptal de" });
          await kvYaz(env, "yapacaklar", liste);
        }
      } catch (e) {
        await gunlukEkle(env, "Gece gelişim denemesi olmadı: " + e.message);
      }
    })());
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(SAYFA, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    env.__kok = url.origin;
    const vm = url.pathname.match(/^\/video\/(\d+)$/);
    if (request.method === "GET" && vm) {
      if (!env.GITHUB_TOKEN || url.searchParams.get("t") !== (await videoImza(env, vm[1]))) return new Response("Yetkisiz", { status: 401 });
      try {
        const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/kurgu-${vm[1]}`);
        const asset = (rel.assets || []).find((a) => a.name.endsWith(".mp4"));
        if (!asset) return new Response("Video bulunamadi", { status: 404 });
        const r = await fetch(asset.url, {
          headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/octet-stream", "User-Agent": "jarvis-worker" },
          redirect: "manual",
        });
        const yer = r.headers.get("location");
        if (yer) return Response.redirect(yer, 302);
        return new Response(r.body, { headers: { "content-type": "video/mp4" } });
      } catch (e) {
        return new Response("Hata: " + e.message, { status: 502 });
      }
    }
    if (request.method === "GET" && url.pathname === "/durum") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      const yapacaklar = (await kvOku(env, "yapacaklar", []))
        .filter((y) => !y.bitti)
        .sort((a, b) => (a.zaman || 9e15) - (b.zaman || 9e15));
      return Response.json({
        yapacaklar,
        gunluk: (await kvOku(env, "gunluk", [])).slice(-20),
        notSayisi: (await kvOku(env, "notlar", [])).length,
        drive: env.DRIVE_URL || (await driveBilgi(env).then((b) => b ? "https://drive.google.com/drive/folders/" + b.klasorler.kok : "").catch(() => "")),
      });
    }
    if (request.method === "POST" && url.pathname === "/hatirlatildi") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      const { id } = await request.json();
      const liste = await kvOku(env, "yapacaklar", []);
      const y = liste.find((x) => x.id === id);
      if (y) { y.bitti = true; await gunlukEkle(env, "Hatırlatıldı: " + y.metin); }
      await kvYaz(env, "yapacaklar", liste.filter((x) => !x.bitti || Date.now() - (x.zaman || 0) < 86400000));
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/alarm") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      const atla = await kvOku(env, "alarm_atla", []);
      return Response.json({ atla: atla.includes(bugunTR(0)), mesaj: env.ALARM_MESAJ || "Songül Hanım, Eren'i uyandır." });
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
        let metin = env.GROQ_API_KEY ? await groqDinle(env, ses).catch(() => null) : null;
        if (metin === null) metin = await sesiYaziyaCevir(env, ses);
        return Response.json({ metin: hayaletMi(metin) ? "" : metin });
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
        const ses = await sesUret(env, metin.slice(0, 1500));
        return new Response(ses.veri, { headers: { "content-type": ses.tur } });
      } catch (e) {
        return new Response(e.message, { status: 502 });
      }
    }
    if (request.method === "POST" && url.pathname === "/sohbet") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) {
        return new Response("Yetkisiz", { status: 401 });
      }
      const body = await request.json();
      let metin = body.metin || "";

      if (UYKU.test(metin)) return Response.json({ cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", uyku: true, beyin: "sistem" });
      const linkVar = (metin.match(/https?:\/\/\S+/g) || []).find((l) => !l.includes("/folders/"));
      if (linkVar) await kvYaz(env, "son_link", linkVar);
      let k = komut(metin);
      if (!k && !env.GROQ_API_KEY && metin.length < 600) {
        const n = await niyetBul(env, metin);
        if (n && n.hazir) return Response.json({ cevap: n.hazir, beyin: "sistem" });
        if (n && n.drive) {
          try { return Response.json({ cevap: await driveIslem(env, n.drive), beyin: "sistem" }); }
          catch (e) { return Response.json({ cevap: "Drive'a ulaşamadım: " + e.message, beyin: "sistem" }); }
        }
        if (n) { k = n.k; metin = n.metin; }
      }
      if (k) {
        if (!env.GITHUB_TOKEN && !["alarm", "hatirlat", "not", "temizle", "puan_iyi", "puan_kotu"].includes(k)) return Response.json({ cevap: "GitHub anahtarı (GITHUB_TOKEN) eklenmemiş.", beyin: "sistem" });
        try {
          let c;
          if (k === "onayla") c = await kodOnayla(env);
          else if (k === "iptal") {
            const b = await kvOku(env, "bekleyen_kod", null);
            if (b && b.gelisim) { const r = await kvOku(env, "reddedilen_oneriler", []); r.push(b.istek); await kvYaz(env, "reddedilen_oneriler", r.slice(-20)); }
            await kvYaz(env, "bekleyen_kod", null); c = "Vazgeçtim, kod değişmedi.";
          }
          else if (k === "gelistir") c = await kendiniGelistir(env);
          else if (k === "puan_iyi") c = await puanVer(env, 1);
          else if (k === "puan_kotu") c = await puanVer(env, -1);
          else if (k === "geri_al") c = await geriAl(env);
          else if (k === "kod") c = await kodIstegi(env, metin.replace(/^kod:\s*/i, ""));
          else if (k === "kurgula") c = await kurgula(env, metin);
          else if (k === "stil") c = await stilCikar(env, metin);
          else if (k === "ilanlar") c = await ilanlar(env);
          else if (k === "alarm") c = await alarmAyari(env, metin);
          else if (k === "hatirlat") c = await hatirlatmaEkle(env, metin);
          else if (k === "not") c = await notAl(env, metin);
          else if (k === "temizle") { await kvYaz(env, "yapacaklar", []); await gunlukEkle(env, "Yapılacaklar temizlendi"); c = "Yapılacaklar listesini temizledim."; }
          else if (k === "ilan_ara") c = await ilanAra(env);
          else if (k === "basvuru") {
            const b = await basvuruYaz(env, metin);
            return Response.json(typeof b === "string" ? { cevap: b, beyin: "sistem" } : { ...b, beyin: "sistem" });
          }
          else if (k === "kurgu_durumu") {
            const d = await kurguDurumu(env, env.__kok);
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
