import SAYFA from "./sayfa.html";
// Jarvis - Cloudflare Worker (GitHub ile otomatik yayinlanir)
// Secrets: GEMINI_API_KEY, OPENROUTER_API_KEY, APP_SECRET (istege bagli: ANTHROPIC_API_KEY)
// KV baglantisi: HAFIZA
// Beyin: varsayilan Gemini | "Sansursuz ..." -> OpenRouter | "Claude ..." -> Claude

const SISTEM_TEMEL =
  "Sen Jarvis'sin, Eren'in kisisel sesli asistanisin. Turkce konus. " +
  "Cevaplarin kisa olsun (1-3 cumle), cunku sesli okunacak. " +
  "Madde isareti, emoji veya markdown kullanma. " +
  "Eren sana kalici olarak hatirlaman gereken bir sey soylerse, " +
  "cevabinin en sonuna [HATIRLA: kisa not] ekle. Bu etiketi baska durumda kullanma. " +
  "COK ONEMLI: Asla yapmadigin bir isi yaptim deme ve bilmedigin bir sonucu uydurma. Google Drive'a HENUZ BAGLI DEGILSIN: " +
  "Drive'a dosya koyamaz, Drive'da klasor acamaz, Drive'daki dosyalari goremezsin. Kurgu, ilan, stil gibi islerin sonucunu sadece " +
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
  const linkler = metin.match(/https?:\/\/\S+/g) || [];
  const malzeme = linkler.find((l) => l.includes("/folders/")) || "";
  const video = linkler.find((l) => !l.includes("/folders/"));
  if (!video) return "Video linkini de yaz. Örnek: kurgula shorts <video linki> malzeme <klasör linki>";
  const format = /uzun/i.test(metin) ? "uzun" : "shorts";
  const stil = ((metin.match(/(?:stil|müşteri|musteri)\s+([a-z0-9-]+)/i) || [])[1] || "").toLowerCase();
  const talimat = metin
    .replace(/(?:stil|müşteri|musteri)\s+[a-z0-9-]+/i, "")
    .replace(/https?:\/\/\S+/g, "")
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
  const linkler = metin.match(/https?:\/\/\S+/g) || [];
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

async function kurguDurumu(env) {
  const j = await gh(env, `/repos/${SABLON_REPO}/actions/runs?per_page=1`);
  const r = j.workflow_runs && j.workflow_runs[0];
  if (!r) return "Henüz bir kurgu çalışması yok.";
  const durum =
    r.status !== "completed" ? "hâlâ çalışıyor" : r.conclusion === "success" ? "bitti, video hazır" : "hata verdi";
  if (r.status === "completed" && r.conclusion === "success") {
    try {
      const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/kurgu-${r.run_number}`);
      return { cevap: "Son kurgu bitti, video hazır. 'Aç'a dokunup indirebilirsin.", link: rel.html_url };
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
  let cevap, beyin, duydum = metin;

  if (sesB64 && env.GROQ_API_KEY) {
    try {
      metin = await groqDinle(env, sesB64);
      duydum = metin;
      if (!metin) return { duydum: "", cevap: "", sessiz: true, beyin: "sistem" };
      if (metin === "?") return { duydum: "", cevap: "Tam anlayamadım, tekrar söyler misin?", beyin: "sistem" };
      if (UYKU.test(metin)) return { duydum: metin, cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", bitis: true, uyku: true, beyin: "sistem" };
      if (BITIS.test(metin)) return { duydum: metin, cevap: "Görüşürüz Eren.", bitis: true, beyin: "sistem" };
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
    if (hayaletMi(duydum)) return { duydum: "", cevap: "", sessiz: true, beyin: "sistem" };
    const k = komut(duydum);
      if (UYKU.test(duydum)) return { duydum: duydum, cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", bitis: true, uyku: true, beyin: "sistem" };
    if (BITIS.test(duydum)) return { duydum, cevap: "Görüşürüz Eren.", bitis: true, beyin: "sistem" };
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
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
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
        drive: env.DRIVE_URL || "",
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
      const metin = body.metin || "";

          if (UYKU.test(metin)) return Response.json({ cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", uyku: true, beyin: "sistem" });
  const k = komut(metin);
      if (k) {
        if (!env.GITHUB_TOKEN && !["alarm", "hatirlat", "not", "temizle"].includes(k)) return Response.json({ cevap: "GitHub anahtarı (GITHUB_TOKEN) eklenmemiş.", beyin: "sistem" });
        try {
          let c;
          if (k === "onayla") c = await kodOnayla(env);
          else if (k === "iptal") {
            const b = await kvOku(env, "bekleyen_kod", null);
            if (b && b.gelisim) { const r = await kvOku(env, "reddedilen_oneriler", []); r.push(b.istek); await kvYaz(env, "reddedilen_oneriler", r.slice(-20)); }
            await kvYaz(env, "bekleyen_kod", null); c = "Vazgeçtim, kod değişmedi.";
          }
          else if (k === "gelistir") c = await kendiniGelistir(env);
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
