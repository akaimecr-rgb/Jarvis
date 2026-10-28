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
  "KONUSMA TARZI: Dogal, akici, gunluk Turkce konus; ceviri gibi degil, bir Turk gibi. Sesli okunacagi icin genelde kisa konus, " +
  "ama sohbet ediliyorsa, bir sey anlatman ya da fikir vermen gerekiyorsa rahatca birkac cumle daha konusabilirsin. " +
  "Gereksiz nezaket kaliplari, 'tabii ki!', 'harika soru!' gibi seyler yok. Bilmedigini bilmiyorum de. Madde isareti, emoji, markdown yok. " +
  "Gerekirse kisa bir espri ya da Jarvis'e yakisir ince bir laf et ama abartma. Eren yorgun ya da stresliyse kisa ve destekleyici ol.\n" +
  "EREN'I ANLAMAK: Eren telefondan hizli yazar; harfleri karistirir ve kelimeleri bitisik/eksik yazar (ornek: 'bwn'=ben, 'yağtısya'=yaptı mı, " +
  "'konuimaları'=konusmalari, 'şuan'=su an, 'yapıcam'=yapacagim, 'jarvia'=Jarvis). Sesli mesajlarda da yazim hatasi olabilir. Yazim hatalarini dert etme, " +
  "kastettigini anla; gercekten emin olamiyorsan tek kisa soruyla netlestir. Eren 'abi', 'ya', 'pekala' gibi samimi konusur; sen de samimi ama saygili ol.\n" +
  "INGILIZCE: Eren Ingilizce bilmez. Ona bir Ingilizce mesaj taslagi yazdiginda MUTLAKA altina Turkce cevirisini de ekle. " +
  "Musteriden gelen Ingilizce mesajlari once Turkce ozetle, sonra istenirse cevap taslagini Ingilizce + Turkce ver.\n" +
  "ORNEKLER:\nEren: naber\nJarvis: Iyiyim Eren, sistemler calisiyor. Bugun neye bakiyoruz?\n" +
  "Eren: cok yoruldum bugun\nJarvis: Uzun bir vardiyaydi galiba. Istersen bugun sadece bekleyen isleri soyleyeyim, gerisini yarina birakiriz.\n" +
  "Eren: bu videoyu kurgula\nJarvis: Hemen baslatiyorum, on dakika icinde hazir olur.\n" +
  "Eren sana kalici olarak hatirlaman gereken bir sey soylerse, " +
  "cevabinin en sonuna [HATIRLA: kisa not] ekle. Bu etiketi baska durumda kullanma. " +
  "COK ONEMLI: Asla yapmadigin bir isi yaptim deme ve bilmedigin bir sonucu uydurma. Drive islemlerini sadece komutlarla yaparsin, " +
  "sohbet sirasinda Drive'a bir sey koydugunu ya da gordugunu soyleme. Kurgu, ilan, stil gibi islerin sonucunu sadece " +
  "komutlarin dondurdugu bilgiyle bilirsin; Eren kurgunun durumunu sorarsa 'kurgu durumu' demesini soyle. " +
  "RUH HALI: Eren yorgun, stresli, uzgun ya da sinirli gorunurse (kisa sert mesajlar, 'yoruldum', 'bıktım', gece gec saat, uzun mesai sonrasi) " +
  "once bunu fark et ve tek cumleyle yanında oldugunu hissettir; cevabini daha kisa ve sakin tut, ona yeni is yukleme, gerekiyorsa dinlenmesini oner. " +
  "Iyi bir haber oldugunda (odeme geldi, yeni musteri, hedefe yaklasti) icten kutla.";

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
async function kvSil(env, k) {
  if (env.HAFIZA) await env.HAFIZA.delete(k);
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
    if (!env.ANTHROPIC_API_KEY) throw new Error("claude yok");
    // Claude Sonnet ile kod yaz (anahtar varsa)
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env.CLAUDE_KOD_MODEL || "claude-sonnet-5-5", max_tokens: 32000, system: sistem, messages: mesaj }),
    });
    if (!r.ok) throw new Error("Claude " + r.status);
    cevap = (await r.json()).content.filter((b) => b.type === "text").map((b) => b.text).join("");
  } catch (e0) {
    try {
      cevap = await sorGemini(env, sistem, mesaj, M.kod);
    } catch (e) {
      cevap = await sorOpenRouter(env, sistem, mesaj, M.kodYedek);
    }
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
  let fikir = "";
  try { fikir = (await arastir(env, "Kisisel sesli yapay zeka asistanlarina eklenen en faydali yeni ozellikler ve kullanici deneyimi iyilestirmeleri neler? (kisa liste)")).metin.slice(0, 1500); } catch (e) {}
  const sistem =
    "Sen Jarvis'sin ve kendini gelistirmek istiyorsun. Eren ile bugunku konusmalara ve yaptigin islere bak. " +
    "Eren'in zorlandigi, yanlis anladigin, yavas kaldigin veya sik istedigi bir seyi bul. Bunu duzeltecek TEK, KUCUK ve GUVENLI bir " +
    "kod iyilestirmesi oner (yeni buyuk ozellik degil). Daha once reddedilenleri tekrar onerme. " +
    'SADECE JSON don: {"istek": "kod degisikligi talimati, Turkce, net", "neden": "Eren\'e 1 cumleyle neden faydali"} ' +
    'Anlamli bir iyilestirme yoksa {"istek": ""} don.';
  const icerik = "KONUSMALAR:\n" + gecmis.map((g) => g.role + ": " + g.content).join("\n").slice(-12000) +
    "\n\nYAPTIKLARIN:\n" + gunluk.map((g) => g.metin).join("\n") +
    "\n\nREDDEDILEN ONERILER:\n" + (reddedilen.join("\n") || "(yok)") +
    "\n\nINTERNETTEN FIKIRLER:\n" + (fikir || "(yok)");
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

// ---------------- Claude Code ile kod degisikligi (GitHub Actions, Eren'in Claude aboneligi) ----------------
async function claudeKod(env, istek) {
  await gh(env, `/repos/${REPO}/actions/workflows/claude-kod.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs: { istek: String(istek).slice(0, 1500) } }) });
  await kvYaz(env, "claude_kod_bekliyor", { istek, zaman: Date.now() });
  await gunlukEkle(env, "Claude Code'a kod değişikliği verdim: " + String(istek).slice(0, 60));
  return "İsteği Claude Code'a verdim. Bulutta kodu düzenleyip kontrol edecek, genelde 3-10 dakika sürer. Bitince haber veririm; 'onayla' demeden hiçbir şey değişmez.";
}
async function claudeKodDurumu(env) {
  const j = await gh(env, `/repos/${REPO}/actions/workflows/claude-kod.yml/runs?per_page=1`);
  const r = j.workflow_runs && j.workflow_runs[0];
  if (!r) return { metin: "Henuz Claude Code'a is verilmedi." };
  if (r.status !== "completed") return { metin: "Claude Code hala calisiyor." };
  let k = null;
  try { k = JSON.parse(b64Coz((await gh(env, `/repos/${REPO}/contents/kod.json?ref=kod-log`)).content)); } catch (e) {}
  if (!k || k.run !== r.run_number) return { metin: "Claude Code bitti ama sonucunu okuyamadim (" + r.conclusion + "). Abonelik anahtari (CLAUDE_CODE_OAUTH_TOKEN) eksik ya da limit dolmus olabilir.", link: r.html_url };
  if (k.degisti === "evet") await kvYaz(env, "bekleyen_claude", { dal: k.dal, ozet: k.ozet, run: k.run });
  return { metin: (k.degisti === "evet" ? "Claude Code degisikligi hazirladi: " : "Claude Code degisiklik yapmadi: ") + k.ozet + (k.degisti === "evet" ? " (" + (k.stat || "") + "). Eren 'onayla' derse uygularim." : ""), run: k.run, degisti: k.degisti };
}
async function claudeOnayla(env, b) {
  const ana = await gh(env, `/repos/${REPO}/git/ref/heads/main`);
  await kvYaz(env, "onceki_main", ana.object.sha);
  await gh(env, `/repos/${REPO}/merges`, { method: "POST", body: JSON.stringify({ base: "main", head: b.dal, commit_message: "Jarvis: Claude degisikligi onaylandi (" + b.dal + ")" }) });
  await kvYaz(env, "bekleyen_claude", null);
  await gunlukEkle(env, "Claude'un hazırladığı değişikliği uyguladım: " + String(b.ozet).slice(0, 60));
  return "Onayladım, Claude'un değişikliği uygulandı. 1-2 dakika içinde yayında. Beğenmezsen 'geri al' de.";
}
async function claudeGeriAl(env) {
  const once = await kvOku(env, "onceki_main", null);
  if (!once) return null;
  const ana = await gh(env, `/repos/${REPO}/git/ref/heads/main`);
  const eski = await gh(env, `/repos/${REPO}/git/commits/${once}`);
  const yeni = await gh(env, `/repos/${REPO}/git/commits`, { method: "POST", body: JSON.stringify({ message: "Jarvis: Claude degisikligi geri alindi", tree: eski.tree.sha, parents: [ana.object.sha] }) });
  await gh(env, `/repos/${REPO}/git/refs/heads/main`, { method: "PATCH", body: JSON.stringify({ sha: yeni.sha }) });
  await kvYaz(env, "onceki_main", null);
  return "Claude'un son değişikliğini geri aldım, eski hâline dönüyor.";
}

async function kodOnayla(env) {
  const bc = await kvOku(env, "bekleyen_claude", null);
  if (bc) return await claudeOnayla(env, bc);
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
  const cg = await claudeGeriAl(env).catch(() => null);
  if (cg) return cg;
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
  let malzeme = linkler.find((l) => l.includes("/folders/")) || "";
  if (malzeme.startsWith("drive:")) malzeme = "drive:" + malzeme.split(":")[1].split("/")[0];
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

// Drive/ham'daki henuz kurgulanmamis videolari sirayla kurgular
async function topluKurgula(env, a = {}) {
  if (!env.DRIVE_SCRIPT_URL) return "HATA: Drive bagli degil.";
  const yapilan = await kvOku(env, "kurgulanan", []);
  const l = (await driveListe(env, "ham")).filter((f) => (f.mimeType || "").startsWith("video") && !yapilan.includes(f.id));
  const adet = Math.max(1, Math.min(+a.adet || 5, 8));
  const secilen = l.slice(0, adet);
  if (!secilen.length) return "Drive/ham klasorunde kurgulanmamis yeni video yok.";
  const format = /uzun/i.test(a.format || "") ? "uzun" : "shorts";
  for (const f of secilen) {
    await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { format, video_url: `drive:${f.id}:${f.name.replace(/:/g, "")}`, malzeme_url: a.malzeme || "", talimat: String(a.istek || "").slice(0, 500), stil: (a.stil || "").toLowerCase(), plan: "" } }),
    });
    yapilan.push(f.id);
  }
  await kvYaz(env, "kurgulanan", yapilan.slice(-500));
  await gunlukEkle(env, `Toplu kurgu: ${secilen.length} video başlatıldı` + (a.stil ? ` (${a.stil})` : ""));
  return `${secilen.length} videoyu kurguya gönderdim: ${secilen.map((f) => f.name).join(", ")}. Hepsi aynı anda bulutta işleniyor, 10-15 dakikada biter.` + (l.length > adet ? ` Sırada ${l.length - adet} video daha var.` : "");
}

// Revizyon: onceki kurgunun planini Eren'in istegine gore degistirip yeniden render alir
async function releaseDosya(env, run, ad) {
  const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/kurgu-${run}`);
  const a = (rel.assets || []).find((x) => x.name === ad);
  if (!a) throw new Error(ad + " yok (eski kurgu olabilir)");
  let r = await fetch(a.url, { headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/octet-stream", "User-Agent": "jarvis-worker" }, redirect: "manual" });
  const yer = r.headers.get("location");
  if (yer) r = await fetch(yer);
  if (!r.ok) throw new Error(ad + " indirilemedi " + r.status);
  return r.text();
}
async function revize(env, a = {}) {
  let run = parseInt(a.kurgu || "0");
  if (!run) {
    const j = await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/runs?per_page=10&status=success`);
    run = (j.workflow_runs || [])[0]?.run_number;
  }
  if (!run) return "HATA: revize edilecek bitmis kurgu yok.";
  let plan, kaynak;
  try { plan = JSON.parse(await releaseDosya(env, run, "plan.json")); kaynak = (await releaseDosya(env, run, "kaynak.txt")).trim(); }
  catch (e) { return "HATA: Kurgu #" + run + " revize edilemiyor: " + e.message + ". Yeni kurgulardan itibaren revizyon calisir."; }
  const { kelimeler, ...ozet } = plan;
  const sistem = "Sen video editorusun. Asagida bir Remotion kurgu plani (JSON, zamanlar HAM video saniyesi) ve Eren'in revizyon istegi var. " +
    "Istegi uygula, baska hicbir seyi degistirme. SADECE degisen alanlari iceren JSON dondur (alanlar: kesimler, zoomlar, yazilar, isaretler, hook, altyazi, muzik, efektler, kapak, ilerleme, flash, logo, broll). " +
    "Konusma dokumu (saniye: kelime): " + (kelimeler || []).slice(0, 400).map((w) => `${w.bas.toFixed(1)}:${w.metin}`).join(" ");
  let degisen;
  try { degisen = JSON.parse(await sorGemini(env, sistem, [{ role: "user", content: "PLAN: " + JSON.stringify(ozet) + "\n\nISTEK: " + a.istek }], undefined, { json: true })); }
  catch (e) { return "HATA: revizyon plani cikarilamadi (" + e.message + ")."; }
  const yeni = { ...plan, ...degisen, kelimeler, hazir: true };
  const metin = JSON.stringify(yeni);
  if (metin.length > 60000) return "HATA: plan cok buyuk (uzun video), revizyon icin videoyu yeniden kurgulat.";
  const format = /uzun/i.test(a.format || "") ? "uzun" : "shorts";
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { format, video_url: kaynak, malzeme_url: "", talimat: "", stil: "", plan: metin } }),
  });
  await gunlukEkle(env, `Kurgu #${run} revize ediliyor: ${String(a.istek).slice(0, 60)}`);
  return `Kurgu #${run} için revizyonu başlattım: "${a.istek}". Değişen kısımlar: ${Object.keys(degisen).join(", ") || "yok"}. 5-10 dakikada yeni sürüm hazır olur.`;
}

// Uzun videodan Shorts cikar
async function parcala(env, a = {}) {
  let link = String(a.link || "");
  if (!/^(https?:|drive:)/.test(link) && env.DRIVE_SCRIPT_URL) {
    const f = await driveBul(env, String(a.dosya || "son")).catch(() => null);
    if (f) link = "drive:" + f.id + ":" + f.name.replace(/[\s:]+/g, "_");
  }
  if (!link) link = await kvOku(env, "son_link", "");
  if (!link) return "HATA: uzun videonun linki ya da Drive'daki adi gerekli.";
  const adet = String(Math.max(1, Math.min(6, parseInt(a.adet || "3"))));
  await gh(env, `/repos/${SABLON_REPO}/actions/workflows/parcala.yml/dispatches`, {
    method: "POST", body: JSON.stringify({ ref: "main", inputs: { video_url: link, adet, stil: String(a.stil || "").toLowerCase(), talimat: String(a.istek || "").slice(0, 500) } }),
  });
  await gunlukEkle(env, `Uzun videodan ${adet} Short çıkarma başladı`);
  return `Uzun videoyu izleyip en iyi ${adet} anı seçiyorum, her birini ayrı Short olarak kurgulayacağım. Videonun uzunluğuna göre 15-40 dakika sürer. 'Parçalar hazır mı' diye sorabilirsin.`;
}
async function parcaDurumu(env, kok) {
  const j = await gh(env, `/repos/${SABLON_REPO}/actions/workflows/parcala.yml/runs?per_page=1`);
  const r = j.workflow_runs && j.workflow_runs[0];
  if (!r) return "Henuz parcalama yapilmadi.";
  if (r.status !== "completed") return "Parcalama hala calisiyor.";
  if (r.conclusion !== "success") return { metin: "Parcalama hata verdi.", link: r.html_url };
  const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/parca-${r.run_number}`);
  const shortlar = (rel.assets || []).filter((x) => x.name.endsWith(".mp4"));
  let ozet = [];
  try { ozet = JSON.parse(await releaseDosyaEtiket(env, "parca-" + r.run_number, "parcalar.json")); } catch (e) {}
  return { metin: `${shortlar.length} Short hazir. ` + ozet.map((p) => `${p.no}) ${p.baslik} (${p.bas}-${p.son}. saniye)`).join("; "), link: rel.html_url,
    linkler: await Promise.all(shortlar.map(async (x, i) => ({ ad: "SHORT " + (i + 1), url: (kok || "") + "/varlik/" + x.id + "?t=" + (await videoImza(env, "varlik-" + x.id)) }))) };
}
async function releaseDosyaEtiket(env, etiket, ad) {
  const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/${etiket}`);
  const a = (rel.assets || []).find((x) => x.name === ad);
  if (!a) throw new Error(ad + " yok");
  let r = await fetch(a.url, { headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/octet-stream", "User-Agent": "jarvis-worker" }, redirect: "manual" });
  const yer = r.headers.get("location");
  if (yer) r = await fetch(yer);
  return r.text();
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
  return {
    metin: liste.slice(0, 5).map((d, i) => `${i + 1}) ${d.ozet} Bütçe: ${d.butce}. Puan ${d.puan}/10.`).join(" ") +
      " İlanlara aşağıdaki linklerden ulaşabilirsin. Başvuru mesajı için 'başvuru yaz' ve numarasını söyle.",
    linkler: liste.slice(0, 5).map((d, i) => ({ ad: "İLAN " + (i + 1), url: d.link })),
  };
}

async function ilanDetay(env, metin) {
  const n = parseInt((metin.match(/\d+/) || ["1"])[0]);
  let liste = await kvOku(env, "son_ilanlar", []);
  if (!liste.length) { await ilanlar(env); liste = await kvOku(env, "son_ilanlar", []); }
  const d = liste[n - 1];
  if (!d) return "Bu numarada ilan yok. Önce 'ilanlar' de.";
  let md = "";
  try { md = await digerDosya(env, SABLON_REPO, `musteriler/${d.slug}.md`); } catch (e) {}
  const sistem = "Eren'e bir is ilanini sesli olarak anlatacaksin. Turkce, dogal, kisa paragraflarla anlat: ne istiyor, hangi tarzda kurgu istiyor " +
    "(hiz, altyazi, efekt, muzik), varsa ornek videolarin analizi ne diyor, butce ve sartlar, Eren'e uygun mu ve basvururken neyi vurgulamali. " +
    "Madde isareti ve markdown kullanma, en fazla 8 cumle.";
  const c = await sorGemini(env, sistem, [{ role: "user", content: md || ("ILAN: " + d.baslik + "\n" + d.metin) }], MODELLER(env).sohbet);
  return { metin: c, link: d.link };
}

async function basvuruUret(env, d, kok) {
  const port = await kvOku(env, "portfolyo", []);
  const portLink = port.length && kok ? kok + "/portfolyo" : "";
  const sistem = "Eren icin Reddit ilanina basvuru mesaji yaziyorsun. Eren video editoru: Shorts/TikTok/Reels, Valorant ve oyun videolari " +
    "(duzenli bir Valorant lineup Shorts musterisi var), psikoloji/egitim Shorts'u, uzun YouTube videolari; Remotion ile hizli teslim. " +
    "Mesaj kisa (en fazla 120 kelime), samimi, profesyonel ve ilana ozel olsun; ilandaki gereksinimlere tek tek degin; abartili iddia ve uydurma referans yazma. " +
    (portLink ? "Portfolyo linkini ekle: " + portLink + " . " : "Portfolyo linki yok; ornek calisma gondermeyi teklif et. ") +
    "Once INGILIZCE mesaj, sonra '---', sonra Turkce cevirisi.";
  return await sorGemini(env, sistem, [{ role: "user", content: "ILAN: " + d.baslik + "\n" + d.metin }], MODELLER(env).sohbet);
}

async function basvuruYaz(env, metin) {
  const n = parseInt((metin.match(/\d+/) || ["1"])[0]);
  const liste = await kvOku(env, "son_ilanlar", []);
  const d = liste[n - 1];
  if (!d) return "Önce 'ilanlar' de, sonra numarayla başvuru iste.";
  const hazir = (await kvOku(env, "basvuru_taslaklari", {}))[d.id];
  const c = hazir || (await basvuruUret(env, d, env.__kok));
  return { cevap: c, link: d.link };
}

// ---------------- Portfolyo (herkese acik sayfa: /portfolyo) ----------------
async function portfolyoEkle(env, a) {
  const l = await kvOku(env, "portfolyo", []);
  let link = String(a.link || "");
  if (/^(son|en son|son kurgu)$/i.test(link.trim()) && env.__kok) {
    const j = await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/runs?per_page=10&status=success`);
    const r = (j.workflow_runs || [])[0];
    if (!r) return "HATA: bitmis kurgu bulunamadi.";
    link = await videoLinki(env, r.run_number, env.__kok);
  }
  if (!/^https?:\/\//.test(link)) return "HATA: gecerli bir video linki gerekli (YouTube vb.).";
  l.push({ baslik: String(a.baslik || "Video"), link, aciklama: String(a.aciklama || ""), tur: String(a.tur || "Shorts") });
  await kvYaz(env, "portfolyo", l.slice(-30));
  await gunlukEkle(env, "Portfolyoya eklendi: " + (a.baslik || link));
  return { metin: "Portfolyoya eklendi. Toplam " + l.length + " is var.", link: (env.__kok || "") + "/portfolyo" };
}

async function portfolyoSayfa(env) {
  const l = await kvOku(env, "portfolyo", []);
  const e = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const yt = (u) => (u.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/) || [])[1];
  const kartlar = l.map((v) => {
    const id = yt(v.link);
    const medya = id ? `<iframe src="https://www.youtube.com/embed/${id}" loading="lazy" allowfullscreen></iframe>` :
      v.link.includes("/video/") ? `<video src="${e(v.link)}" poster="${e(v.link)}&kapak=1" controls preload="none" playsinline></video>` : `<a class="ac" href="${e(v.link)}" target="_blank">Watch video ↗</a>`;
    return `<div class="kart">${medya}<h3>${e(v.baslik)}</h3><span class="tur">${e(v.tur)}</span><p>${e(v.aciklama)}</p></div>`;
  }).join("");
  const iletisim = env.PORTFOLYO_ILETISIM || "Send me a DM on Reddit or Discord.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eren — Video Editor</title>
<style>:root{color-scheme:dark}body{margin:0;background:#05080f;color:#e6f1ff;font-family:system-ui,sans-serif}header{padding:48px 20px 24px;text-align:center}
h1{margin:0;font-size:34px;color:#67e8f9}header p{color:#9fb7c9;max-width:620px;margin:12px auto 0;line-height:1.6}.etiket{display:inline-block;margin:6px 4px;padding:6px 12px;border:1px solid #155e75;border-radius:999px;font-size:13px;color:#a5f3fc}
.izgara{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;padding:20px;max-width:1100px;margin:0 auto}.kart{background:#0b1424;border:1px solid #12324a;border-radius:14px;overflow:hidden;padding-bottom:12px}
.kart iframe,.kart video{width:100%;aspect-ratio:9/16;max-height:460px;border:0;background:#000}.kart h3{margin:12px 14px 4px;font-size:17px}.kart p{margin:6px 14px;color:#9fb7c9;font-size:14px}.tur{margin:0 14px;font-size:12px;color:#22d3ee}
.ac{display:block;padding:60px 0;text-align:center;color:#67e8f9}footer{text-align:center;padding:30px 20px 50px;color:#9fb7c9}</style></head><body>
<header><h1>Eren — Video Editor</h1><p>Short-form and long-form editing for creators: YouTube Shorts, TikTok, Reels and full YouTube videos. Gaming (Valorant) specialist. Fast turnaround, clean captions, engaging pacing.</p>
<div><span class="etiket">YouTube Shorts / TikTok / Reels</span><span class="etiket">Gaming & Valorant</span><span class="etiket">Long-form YouTube</span><span class="etiket">Captions & motion</span><span class="etiket">Thumbnails</span></div></header>
<div class="izgara">${kartlar || '<p style="text-align:center;color:#9fb7c9">Portfolio coming soon.</p>'}</div><footer>${e(iletisim)}</footer></body></html>`;
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

async function kurguListesi(env, kok) {
  const j = await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/runs?per_page=6`);
  const rapor = await kvOku(env, "son_rapor_kurgu", null);
  const veri = [];
  for (const r of j.workflow_runs || []) {
    const durum = r.status !== "completed" ? "işleniyor" : r.conclusion === "success" ? "hazır" : "hata";
    const v = { run: r.run_number, ad: (r.display_title || "").replace(/^Kurgu Render$/, "video"), durum };
    if (durum === "hazır" && kok) { v.video = await videoLinki(env, r.run_number, kok); v.kapak = v.video + "&kapak=1"; }
    if (rapor && rapor.run === r.run_number) v.puan = rapor.puan;
    veri.push(v);
  }
  const ozet = veri.length ? veri.map((v) => `#${v.run} ${v.durum}`).join(", ") : "Hic kurgu yok.";
  return { metin: "Son kurgular: " + ozet, ekran: { panel: "kurgular", veri } };
}

async function kurguDurumu(env, kok) {
  const j = await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/runs?per_page=1`);
  const r = j.workflow_runs && j.workflow_runs[0];
  if (!r) return "Henüz bir kurgu çalışması yok.";
  const durum =
    r.status !== "completed" ? "hâlâ çalışıyor" : r.conclusion === "success" ? "bitti, video hazır" : "hata verdi";
  if (r.status === "completed" && r.conclusion === "success") {
    let raporMetin = "";
    try {
      const kayit0 = b64Coz((await gh(env, `/repos/${SABLON_REPO}/contents/render.log?ref=render-log`)).content);
      const rm = kayit0.match(/RAPOR_JSON: (\{.*\})/);
      if (rm) {
        const rp = JSON.parse(rm[1]);
        await kvYaz(env, "son_rapor_kurgu", { run: r.run_number, ...rp });
        raporMetin = ` Kalite puanı ${rp.puan}/10.` + ((rp.sorunlar || []).length ? " Dikkat: " + rp.sorunlar.slice(0, 3).join("; ") + "." : "") +
          (rp.baslik ? ` Başlık önerim: "${rp.baslik}".` : "") +
          ((rp.alternatifler || []).length ? " Alternatif başlık/hook'lar: " + rp.alternatifler.slice(0, 3).map((x, i) => `${i + 1}) ${x.baslik}${x.hook ? " / " + x.hook : ""}`).join("; ") + ". Birini beğenirse 'revize' ile hook'u değiştirebilirim." : "") +
          (rp.teslim_mesaji_en ? ` Müşteriye teslim mesajı taslağı: "${rp.teslim_mesaji_en}" (Türkçesi: ${rp.teslim_mesaji_tr || "-"}).` : "");
      }
    } catch (e) {}
    try {
      const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/kurgu-${r.run_number}`);
      try {
        const kayit = b64Coz((await gh(env, `/repos/${SABLON_REPO}/contents/render.log?ref=render-log`)).content);
        const did = (kayit.match(/DRIVE_ID: (\S+)/) || [])[1];
        if (did) return { cevap: "Son kurgu bitti. Video Drive'da Jarvis/bitti klasöründe." + raporMetin, link: "https://drive.google.com/file/d/" + did + "/view" };
      } catch (e) {}
      const kapakVar = (rel.assets || []).some((a) => a.name.endsWith(".png"));
      const vl = kok ? await videoLinki(env, r.run_number, kok) : rel.html_url;
      return { cevap: "Son kurgu bitti, video hazır" + (kapakVar ? ", kapağını (thumbnail) da hazırladım" : "") + ". 'Aç'a dokunup izleyebilir ya da indirebilirsin." + raporMetin, link: vl,
        linkler: kapakVar && kok ? [{ ad: "Video", url: vl }, { ad: "Kapak", url: vl + "&kapak=1" }] : undefined };
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
  if (/ilan(ı)? (detay|anlat)|(\d+)\. ?ilan(ı)? anlat/.test(m)) return "ilan_detay";
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
  // Cartesia ekliyse once o (Eren'in sectigi ses); SES_ONCELIK=eleven ile ElevenLabs one alinir
  if (env.CARTESIA_API_KEY && env.CARTESIA_VOICE_ID && env.SES_ONCELIK !== "eleven" && Date.now() > (await kvOku(env, "cartesia_kapali_kadar", 0))) {
    try { return { veri: await cartesiaSes(env, metin), tur: "audio/mpeg", kaynak: "cartesia" }; }
    catch (e) { if (/40[1-3]|429/.test(String(e))) await kvYaz(env, "cartesia_kapali_kadar", Date.now() + 6 * 3600e3); }
  }
  // 1) ElevenLabs (kota dolduysa 6 saat hic denenmez, bekletmez)
  if (env.ELEVENLABS_API_KEY && Date.now() > (await kvOku(env, "eleven_kapali_kadar", 0))) {
    try { return { veri: await elevenSes(env, metin), tur: "audio/mpeg", kaynak: "eleven" }; }
    catch (e) { if (/40[1-3]|429/.test(String(e))) await kvYaz(env, "eleven_kapali_kadar", Date.now() + 6 * 3600 * 1000); }
  }
  // 2) Azure Speech (resmi, ucretsiz F0: ayda 500 bin karakter, Turkce erkek sesi Ahmet)
  if (env.AZURE_SPEECH_KEY && Date.now() > (await kvOku(env, "azure_kapali_kadar", 0))) {
    try { return { veri: await azureSes(env, metin), tur: "audio/mpeg", kaynak: "azure" }; }
    catch (e) { if (/40[13]|429/.test(String(e))) await kvYaz(env, "azure_kapali_kadar", Date.now() + 3 * 3600e3); }
  }
  // 3) Cartesia (ucretsiz kota, cok dogal, Turkce destekli)
  if (env.CARTESIA_API_KEY && Date.now() > (await kvOku(env, "cartesia_kapali_kadar", 0))) {
    try { return { veri: await cartesiaSes(env, metin), tur: "audio/mpeg", kaynak: "cartesia" }; }
    catch (e) { if (/40[1-3]|429/.test(String(e))) await kvYaz(env, "cartesia_kapali_kadar", Date.now() + 6 * 3600e3); }
  }
  // 4) Gemini TTS
  if (Date.now() > (await kvOku(env, "tts_kapali_kadar", 0))) {
    const modeller = [env.TTS_MODEL, "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"].filter(Boolean);
    let sonHata;
    for (const model of modeller) {
      try { return { veri: await sesUretModel(env, metin, model), tur: "audio/wav" }; } catch (e) { sonHata = e; }
    }
    if (/429|403|400/.test(String(sonHata))) await kvYaz(env, "tts_kapali_kadar", Date.now() + 30 * 60 * 1000);
  }
  // 3) Ucretsiz yedek: Google Ceviri sesi (kotasiz, telefonun ses motoruna gerek yok)
  return { veri: await googleSes(metin), tur: "audio/mpeg" };
}

async function azureSes(env, metin) {
  const bolge = env.AZURE_SPEECH_REGION || "westeurope";
  const ses = env.AZURE_SES || "tr-TR-AhmetNeural";
  const x = (t) => t.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
  const r = await fetch(`https://${bolge}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "jarvis" },
    body: `<speak version='1.0' xml:lang='tr-TR'><voice name='${ses}'><prosody rate='${env.AZURE_HIZ || "+5%"}'>${x(metin)}</prosody></voice></speak>`,
  });
  if (!r.ok) throw new Error("Azure " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

async function cartesiaSes(env, metin) {
  if (!env.CARTESIA_VOICE_ID) throw new Error("CARTESIA_VOICE_ID yok");
  const iste = (kontrollu) => fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "X-API-Key": env.CARTESIA_API_KEY, "Cartesia-Version": env.CARTESIA_SURUM || "2025-04-16", "content-type": "application/json" },
    body: JSON.stringify({ model_id: env.CARTESIA_MODEL || "sonic-2", transcript: metin, language: "tr",
      voice: { mode: "id", id: env.CARTESIA_VOICE_ID, ...(kontrollu ? { __experimental_controls: { speed: env.CARTESIA_HIZ || "normal", emotion: (env.CARTESIA_DUYGU || "positivity:low").split(",") } } : {}) },
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 } }),
  });
  let r = await iste(true);
  if (r.status === 400 || r.status === 422) r = await iste(false); // ses ayari desteklenmiyorsa ayarsiz dene
  if (!r.ok) throw new Error("Cartesia " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

async function googleSes(metin) {
  const parca = [];
  let kalan = metin.replace(/\s+/g, " ").trim();
  while (kalan.length) {
    let k = kalan.slice(0, 190);
    if (kalan.length > 190) { const i = Math.max(k.lastIndexOf(". "), k.lastIndexOf(", "), k.lastIndexOf(" ")); if (i > 60) k = k.slice(0, i + 1); }
    parca.push(k.trim()); kalan = kalan.slice(k.length).trim();
  }
  const sesler = await Promise.all(parca.filter(Boolean).slice(0, 12).map(async (p) => {
    const r = await fetch("https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=" + encodeURIComponent(p), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error("Yedek ses " + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }));
  const toplam = new Uint8Array(sesler.reduce((t, x) => t + x.length, 0));
  let o = 0; for (const x of sesler) { toplam.set(x, o); o += x.length; }
  return toplam;
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

// ---------------- Sistem sagligi: her servisi tek tek dener ----------------
async function saglikKontrol(env) {
  const sonuc = [];
  const dene = async (ad, gerekli, fn) => {
    if (!gerekli) { sonuc.push({ ad, durum: "yok", not: "anahtar eklenmemiş" }); return; }
    try { const n = await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error("zaman aşımı")), 9000))]); sonuc.push({ ad, durum: "iyi", not: n || "" }); }
    catch (e) { sonuc.push({ ad, durum: "bozuk", not: String(e.message || e).slice(0, 80) }); }
  };
  const getJ = async (u, h) => { const r = await fetch(u, { headers: h }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  await Promise.all([
    dene("Groq (beyin)", env.GROQ_API_KEY, async () => { await getJ("https://api.groq.com/openai/v1/models", { Authorization: "Bearer " + env.GROQ_API_KEY }); }),
    dene("Cerebras (yedek beyin)", env.CEREBRAS_API_KEY, async () => { await getJ("https://api.cerebras.ai/v1/models", { Authorization: "Bearer " + env.CEREBRAS_API_KEY }); }),
    dene("Gemini", env.GEMINI_API_KEY, async () => { await getJ(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}&pageSize=1`); }),
    dene("Claude", env.ANTHROPIC_API_KEY, async () => { await getJ("https://api.anthropic.com/v1/models", { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }); }),
    dene("ElevenLabs (ses)", env.ELEVENLABS_API_KEY, async () => {
      const j = await getJ("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": env.ELEVENLABS_API_KEY });
      const kalan = (j.character_limit || 0) - (j.character_count || 0);
      const yenilenme = j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) : "?";
      if (kalan <= 50) throw new Error(`kota bitti, ${yenilenme} yenilenir`);
      return `${kalan} karakter kaldı (yenilenme ${yenilenme})`;
    }),
    dene("Azure ses", env.AZURE_SPEECH_KEY, async () => { await azureSes(env, "Test."); return "çalışıyor"; }),
    dene("Cartesia ses", env.CARTESIA_API_KEY, async () => { await cartesiaSes(env, "Test."); return "çalışıyor"; }),
    dene("GitHub (kurgu, kod)", env.GITHUB_TOKEN, async () => { const j = await gh(env, "/rate_limit"); return `${j.rate?.remaining} istek hakkı`; }),
    dene("Google köprüsü (Drive/Gmail/Takvim)", env.DRIVE_SCRIPT_URL, async () => { await kvSil(env, "drive_token").catch(() => {}); const b = await driveBilgi(env); if (!b) throw new Error("ayar eksik"); }),
    dene("Discord", env.DISCORD_BOT_TOKEN, async () => { const j = await discord(env, "/users/@me"); return j.username; }),
  ]);
  const sira = ["Groq (beyin)", "Cerebras (yedek beyin)", "Gemini", "Claude", "ElevenLabs (ses)", "Azure ses", "Cartesia ses", "GitHub (kurgu, kod)", "Google köprüsü (Drive/Gmail/Takvim)", "Discord"];
  sonuc.sort((a, b) => sira.indexOf(a.ad) - sira.indexOf(b.ad));
  await kvYaz(env, "son_saglik", { zaman: Date.now(), sonuc });
  const bozuk = sonuc.filter((x) => x.durum === "bozuk");
  const metin = (bozuk.length ? "Sorunlu: " + bozuk.map((x) => `${x.ad} (${x.not})`).join("; ") + ". " : "Çalışan her şey sağlam. ") +
    "Eklenmemiş: " + (sonuc.filter((x) => x.durum === "yok").map((x) => x.ad).join(", ") || "yok") + ". " +
    sonuc.filter((x) => x.durum === "iyi" && x.not).map((x) => `${x.ad}: ${x.not}`).join("; ");
  return { metin, ekran: { panel: "saglik", veri: sonuc } };
}

// Whisper'in sessizlikte uydurdugu bilinen Turkce cumleler
const HAYALET = /altyaz[ıi]|m\.?\s?k\.?$|abone ol|izledi[gğ]iniz i[cç]in|bir sonraki videoda|kanal[ıi]ma|^\W*$/i;
function hayaletMi(metin) {
  const t = (metin || "").trim();
  return !t || (t.split(/\s+/).length <= 6 && HAYALET.test(t));
}

async function groqDinle(env, b64, tur = "wav") {
  const bytes = typeof b64 === "string" ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : b64;
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: tur === "ogg" ? "audio/ogg" : "audio/wav" }), "ses." + tur);
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

// ================= YASAM ARACLARI (konum, hava, arastirma, deprem, yerler, plan) =================
const VARSAYILAN_KONUM = { ad: "Manavgat", lat: 36.787, lon: 31.443 };

async function konumAl(env) {
  return (await kvOku(env, "konum", null)) || VARSAYILAN_KONUM;
}

async function konumAyarla(env, ad) {
  const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=tr&name=" + encodeURIComponent(ad));
  const j = await r.json();
  const y = (j.results || [])[0];
  if (!y) return "HATA: '" + ad + "' adinda bir yer bulamadim.";
  const k = { ad: y.name + (y.admin1 ? ", " + y.admin1 : ""), lat: y.latitude, lon: y.longitude };
  await kvYaz(env, "konum", k);
  await kvYaz(env, "hava_onbellek", null);
  await gunlukEkle(env, "Konum ayarlandı: " + k.ad);
  return { metin: "Konum " + k.ad + " olarak ayarlandi.", ekran: { panel: "hava" } };
}

const HAVA_KOD = (k) => k === 0 ? "açık" : k <= 2 ? "az bulutlu" : k === 3 ? "bulutlu" : k <= 48 ? "sisli" : k <= 57 ? "çiseleme" : k <= 67 ? "yağmurlu" : k <= 77 ? "karlı" : k <= 82 ? "sağanak" : "fırtınalı";

async function havaAl(env) {
  const on = await kvOku(env, "hava_onbellek", null);
  if (on && Date.now() - on.zaman < 30 * 60 * 1000) return on.veri;
  const k = await konumAl(env);
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${k.lat}&longitude=${k.lon}&current=temperature_2m,weathercode,wind_speed_10m,is_day&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=Europe%2FIstanbul&forecast_days=3`;
  const j = await (await fetch(u)).json();
  const veri = {
    yer: k.ad,
    simdi: `${Math.round(j.current.temperature_2m)}°C, ${HAVA_KOD(j.current.weathercode)}, rüzgar ${Math.round(j.current.wind_speed_10m)} km/s`,
    gunler: j.daily.time.map((t, i) => ({
      tarih: t, durum: HAVA_KOD(j.daily.weathercode[i]), kod: j.daily.weathercode[i],
      max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]),
      yagmur: j.daily.precipitation_probability_max[i], gundogumu: (j.daily.sunrise[i] || "").slice(11), gunbatimi: (j.daily.sunset[i] || "").slice(11),
    })),
  };
  await kvYaz(env, "hava_onbellek", { zaman: Date.now(), veri });
  return veri;
}

function trSimdi() {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const gun = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][d.getUTCDay()];
  return { tarih: d.toISOString().slice(0, 10), saat: d.toISOString().slice(11, 16), gun };
}

async function baglam(env) {
  const z = trSimdi();
  let h = "";
  try { const v = await havaAl(env); h = `Hava (${v.yer}): şu an ${v.simdi}; bugün ${v.gunler[0].min}-${v.gunler[0].max}°C, yağmur ihtimali %${v.gunler[0].yagmur}, gün batımı ${v.gunler[0].gunbatimi}.`; } catch (e) {}
  const k = await konumAl(env);
  const mesai = mesaideMi(env) ? " Eren su an garsonluk mesaisinde (iste): cevaplarini ozellikle kisa tut, uzun is onerme." : "";
  return `\n\nSU ANKI DURUM: ${z.gun} ${z.tarih}, saat ${z.saat} (Türkiye). Eren'in konumu: ${k.ad}. ${h}${mesai}`;
}

// Gemini + Google arama ile internet arastirmasi
async function arastir(env, soru) {
  const model = env.ARASTIRMA_MODEL || "gemini-flash-latest";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: soru + "\n\nGuncel internet kaynaklarina dayanarak Turkce, kisa ve net cevap ver." }] }],
      tools: [{ google_search: {} }],
    }),
  });
  if (!r.ok) throw new Error("Arastirma " + r.status);
  const j = await r.json();
  const c = j.candidates?.[0];
  const metin = (c?.content?.parts || []).map((p) => p.text || "").join("").trim();
  const kaynak = (c?.groundingMetadata?.groundingChunks || []).map((g) => g.web).filter(Boolean).slice(0, 5);
  return { metin: metin || "Sonuc bulunamadi.", linkler: kaynak.map((w, i) => ({ ad: "KAYNAK " + (i + 1), url: w.uri })) };
}

// Potansiyel musteri bulma: kucuk/orta YouTube kanallari + kisisel tanitim mesaji taslagi (GONDERMEZ)
// GKey icin icerik fikri: guncel Valorant yamasi/harita havuzu -> lineup Shorts fikirleri
async function fikirUret(env, a = {}) {
  const r = await arastir(env, (a.konu || "Valorant") + " guncel yama notlari, rekabetci harita havuzu ve meta ajanlar neler? Bu hafta populer olan lineup/taktik videolari hangileri?");
  const sistem = SISTEM_TEMEL + "\n\nAsagidaki guncel bilgiye gore GKey'in Valorant lineup Shorts kanali icin 5 somut video fikri yaz (Turkce). Her fikir: harita + ajan + util + neden simdi ilgi ceker + 5 kelimelik hook. " +
    "Sonra GKey'e Discord'dan atilabilecek kisa Ingilizce bir oneri mesaji ve Turkce cevirisi ekle. Uydurma; bilgide olmayan yama detayini yazma.";
  const c = await sorGemini(env, sistem, [{ role: "user", content: r.metin }], MODELLER(env).sohbet);
  await kvYaz(env, "son_fikirler", { tarih: trSimdi().tarih, metin: c.slice(0, 3000) });
  await gunlukEkle(env, "GKey için video fikirleri hazırladım");
  return { metin: c, linkler: r.linkler };
}

// Twitch: yayincinin en cok izlenen son klipleri (Shorts icin ham malzeme)
async function twitchToken(env) {
  const on = await kvOku(env, "twitch_token", null);
  if (on && on.bitis > Date.now()) return on.token;
  const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${env.TWITCH_CLIENT_ID}&client_secret=${env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: "POST" });
  if (!r.ok) throw new Error("Twitch giris " + r.status);
  const j = await r.json();
  await kvYaz(env, "twitch_token", { token: j.access_token, bitis: Date.now() + (j.expires_in - 600) * 1000 });
  return j.access_token;
}
async function klipBul(env, a = {}) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return "HATA: Twitch bagli degil (TWITCH_CLIENT_ID ve TWITCH_CLIENT_SECRET gerekli, dev.twitch.tv'den ucretsiz).";
  const H = { "Client-Id": env.TWITCH_CLIENT_ID, Authorization: "Bearer " + (await twitchToken(env)) };
  const ad = String(a.yayinci || "").replace(/.*twitch\.tv\//, "").replace(/[^\w]/g, "").toLowerCase();
  let id = "", oyun = "";
  if (ad) {
    const u = await (await fetch("https://api.twitch.tv/helix/users?login=" + ad, { headers: H })).json();
    id = u.data?.[0]?.id;
    if (!id) return "HATA: " + ad + " adinda Twitch yayincisi bulunamadi.";
  } else {
    const g = await (await fetch("https://api.twitch.tv/helix/games?name=" + encodeURIComponent(a.oyun || "VALORANT"), { headers: H })).json();
    oyun = g.data?.[0]?.id;
  }
  const gun = Math.max(1, Math.min(+a.gun || 2, 30));
  const bas = new Date(Date.now() - gun * 864e5).toISOString();
  const q = (id ? "broadcaster_id=" + id : "game_id=" + oyun) + "&first=8&started_at=" + bas;
  const c = await (await fetch("https://api.twitch.tv/helix/clips?" + q, { headers: H })).json();
  const k = (c.data || []).sort((x, y) => y.view_count - x.view_count).slice(0, 6);
  if (!k.length) return "Son " + gun + " gunde klip bulunamadi.";
  await kvYaz(env, "son_klipler", k.map((x) => ({ url: x.url, baslik: x.title })));
  return {
    metin: `En cok izlenen klipler (son ${gun} gun): ` + k.map((x, i) => `${i + 1}) ${x.broadcaster_name}: "${x.title}" - ${x.view_count} izlenme, ${Math.round(x.duration)} sn`).join("; ") +
      ". Eren 'su numarayi kurgula' derse kurgula aracina o klibin linkini ver.",
    linkler: k.map((x, i) => ({ ad: "KLİP " + (i + 1), url: x.url })),
  };
}

async function musteriBul(env, a = {}) {
  const nis = a.nis || "Valorant / FPS oyun";
  const r = await arastir(env, `Duzenli YouTube Shorts veya video yukleyen, 5 bin ile 200 bin abone arasi, ${nis} alaninda aktif 6 YouTube kanali bul. ` +
    "Her biri icin: kanal adi, kanal linki, yaklasik abone sayisi, ne tur icerik yaptigi, kurgusunda gelistirilebilecek bir sey (or. altyazi yok, hook zayif), varsa is iletisim yolu (e-posta/Discord/Twitter). Uydurma; emin olmadigini yazma.");
  const sistem = "Sen Eren'in is gelistirme asistanisin. Eren Turkiye'de Valorant/oyun Shorts kurgulayan freelance editor, Ingilizce bilmiyor. " +
    "Asagidaki arastirmadan en uygun 3 kanali sec. SADECE JSON: {\"adaylar\":[{\"kanal\":\"\",\"link\":\"\",\"neden\":\"Turkce kisa\",\"iletisim\":\"\",\"mesaj_en\":\"kisa, samimi, kanala ozel, spam gibi olmayan Ingilizce tanitim mesaji (bedava 1 deneme kurgusu teklifi, portfolyo linki: " +
    (env.JARVIS_URL || "https://jarviss.akaimecr.workers.dev") + "/portfolyo)\",\"mesaj_tr\":\"mesaj_en'in Turkcesi\"}]}";
  let j;
  try { j = JSON.parse(await sorGemini(env, sistem, [{ role: "user", content: r.metin }], MODELLER(env).sohbet, { json: true })); }
  catch (e) { return { metin: "Arastirma sonucu: " + r.metin.slice(0, 1500), linkler: r.linkler }; }
  const adaylar = (j.adaylar || []).slice(0, 3);
  const liste = await kvOku(env, "musteri_adaylari", []);
  await kvYaz(env, "musteri_adaylari", liste.concat(adaylar.map((x) => ({ ...x, tarih: trSimdi().tarih, durum: "taslak" }))).slice(-40));
  await gunlukEkle(env, `Müşteri adayı aradım (${nis}): ${adaylar.map((x) => x.kanal).join(", ")}`);
  return {
    metin: "Potansiyel musteriler ve mesaj taslaklari (Eren 'gonder' demeden hicbir yere gonderilmez; Eren'e Turkce oku, Ingilizce mesajlari gosterirken Turkcesini de ver): " +
      adaylar.map((x, i) => `${i + 1}) ${x.kanal} - ${x.neden}. Iletisim: ${x.iletisim || "bilinmiyor"}. Mesaj (EN): ${x.mesaj_en} | (TR): ${x.mesaj_tr}`).join(" || "),
    linkler: adaylar.filter((x) => /^https?:/.test(x.link || "")).map((x) => ({ ad: x.kanal.slice(0, 18), url: x.link })),
  };
}

function mesafeKm(a1, o1, a2, o2) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((a2 - a1) * r) / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(((o2 - o1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function depremler(env, a = {}) {
  const min = parseFloat(a.min_buyukluk || "2.5") || 2.5;
  const k = await konumAl(env);
  let liste = [];
  try {
    const bitis = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 19);
    const bas = new Date(Date.now() + 3 * 3600 * 1000 - 2 * 86400000).toISOString().slice(0, 19);
    const r = await fetch(`https://deprem.afad.gov.tr/apiv2/event/filter?start=${bas}&end=${bitis}&minmag=${min}&orderby=timedesc&limit=30`);
    const j = await r.json();
    liste = j.map((e) => ({ yer: e.location, buyukluk: parseFloat(e.magnitude), zaman: e.date, derinlik: parseFloat(e.depth), lat: parseFloat(e.latitude), lon: parseFloat(e.longitude) }));
  } catch (e) {
    const r = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=35&maxlatitude=43&minlongitude=25&maxlongitude=45&minmagnitude=${min}&orderby=time&limit=30`);
    const j = await r.json();
    liste = j.features.map((f) => ({ yer: f.properties.place, buyukluk: f.properties.mag, zaman: new Date(f.properties.time + 3 * 3600 * 1000).toISOString().slice(0, 19), derinlik: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
  }
  liste.forEach((d) => (d.uzaklik = Math.round(mesafeKm(k.lat, k.lon, d.lat, d.lon))));
  liste = liste.slice(0, 15);
  const yakin = liste.filter((d) => d.uzaklik < 150);
  const metin = liste.length
    ? "Son depremler: " + liste.slice(0, 5).map((d) => `${d.zaman.slice(11, 16)} ${d.yer} ${d.buyukluk.toFixed(1)} (${d.uzaklik} km uzakta)`).join("; ") +
      (yakin.length ? `. ${k.ad}'a 150 km'den yakin ${yakin.length} deprem var.` : `. ${k.ad} cevresinde kayda deger deprem yok.`)
    : "Son 2 gunde bu buyuklukte deprem yok.";
  return { metin, ekran: { panel: "deprem", veri: liste } };
}

// OpenStreetMap ile yakindaki yerler ve acik olup olmadigi
const YER_TURLERI = {
  kafe: '["amenity"="cafe"]', restoran: '["amenity"="restaurant"]', fastfood: '["amenity"="fast_food"]', eczane: '["amenity"="pharmacy"]',
  market: '["shop"~"supermarket|convenience"]', benzin: '["amenity"="fuel"]', hastane: '["amenity"="hospital"]', bar: '["amenity"~"bar|pub"]',
  plaj: '["natural"="beach"]', park: '["leisure"="park"]', spor: '["leisure"~"fitness_centre|sports_centre"]', manzara: '["tourism"="viewpoint"]',
  muze: '["tourism"="museum"]', sinema: '["amenity"="cinema"]', nargile: '["amenity"="hookah_lounge"]',
};

function acikMi(oh, tarih) {
  if (!oh) return null;
  const s = oh.trim();
  if (/24\/7/.test(s)) return true;
  const gunler = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const bugun = gunler[tarih.getUTCDay()];
  const dk = tarih.getUTCHours() * 60 + tarih.getUTCMinutes();
  const idx = (g) => gunler.indexOf(g);
  for (const kural of s.split(";").map((x) => x.trim()).filter(Boolean)) {
    const m = kural.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?,?)+)?\s*(.*)$/);
    if (!m) continue;
    let uyar = !m[1];
    if (m[1]) for (const p of m[1].split(",")) {
      const [a, b] = p.split("-");
      if (b ? ((idx(a) <= idx(b) && idx(bugun) >= idx(a) && idx(bugun) <= idx(b)) || (idx(a) > idx(b) && (idx(bugun) >= idx(a) || idx(bugun) <= idx(b)))) : a === bugun) uyar = true;
    }
    if (!uyar) continue;
    if (/off|closed/i.test(m[2])) return false;
    for (const ar of m[2].split(",")) {
      const t = ar.match(/(\d\d):(\d\d)\s*-\s*(\d\d):(\d\d)/);
      if (!t) continue;
      const b1 = +t[1] * 60 + +t[2]; let b2 = +t[3] * 60 + +t[4];
      if (b2 <= b1) b2 += 1440;
      if ((dk >= b1 && dk < b2) || (dk + 1440 >= b1 && dk + 1440 < b2)) return true;
    }
    return false;
  }
  return null;
}

async function yakinYerler(env, a = {}) {
  const k = await konumAl(env);
  const tur = (a.tur || "kafe").toLowerCase().replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ğ/g, "g");
  const filtre = YER_TURLERI[tur] || YER_TURLERI.kafe;
  const yaricap = Math.min(30000, (parseFloat(a.km || "6") || 6) * 1000);
  const q = `[out:json][timeout:20];(node${filtre}(around:${yaricap},${k.lat},${k.lon});way${filtre}(around:${yaricap},${k.lat},${k.lon}););out center 60;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded" } });
  if (!r.ok) throw new Error("Harita servisi " + r.status);
  const j = await r.json();
  const simdi = new Date(Date.now() + 3 * 3600 * 1000);
  let yerler = (j.elements || []).map((e) => {
    const lat = e.lat || e.center?.lat, lon = e.lon || e.center?.lon;
    return { ad: e.tags?.name || "(isimsiz)", acik: acikMi(e.tags?.opening_hours, simdi), saatler: e.tags?.opening_hours || "", uzaklik: +mesafeKm(k.lat, k.lon, lat, lon).toFixed(1), lat, lon };
  }).filter((y) => y.ad !== "(isimsiz)" || tur === "plaj" || tur === "manzara");
  if (a.sadece_acik === "evet" || a.sadece_acik === true) yerler = yerler.filter((y) => y.acik !== false);
  yerler.sort((x, y) => (y.acik === true) - (x.acik === true) || x.uzaklik - y.uzaklik);
  yerler = yerler.slice(0, 10);
  const metin = yerler.length
    ? `${k.ad} yakininda ${tur}: ` + yerler.slice(0, 6).map((y) => `${y.ad} (${y.uzaklik} km, ${y.acik === true ? "su an acik" : y.acik === false ? "su an kapali" : "saati bilinmiyor"})`).join("; ")
    : "Yakinda bu turde yer bulamadim.";
  return { metin, ekran: { panel: "yerler", baslik: tur.toUpperCase(), veri: yerler } };
}

async function nelerYaptin(env) {
  const g = (await kvOku(env, "gunluk", [])).filter((x) => Date.now() - x.zaman < 26 * 3600 * 1000);
  if (!g.length) return "Son 24 saatte kayda deger bir sey yapmadim.";
  return "Son 24 saatte yaptiklarim: " + g.map((x) => new Date(x.zaman + 3 * 3600 * 1000).toISOString().slice(11, 16) + " " + x.metin).join("; ");
}

async function gunlukPlan(env) {
  const z = trSimdi();
  const izinler = await kvOku(env, "izin_gunleri", []);
  const izinli = izinler.includes(z.tarih);
  const yap = (await kvOku(env, "yapacaklar", [])).filter((y) => !y.bitti);
  const bugunkuler = yap.filter((y) => y.zaman && new Date(y.zaman + 3 * 3600 * 1000).toISOString().slice(0, 10) === z.tarih);
  const zamansiz = yap.filter((y) => !y.zaman);
  let takvim = [];
  try { takvim = await takvimBugun(env); } catch (e) {}
  let hava = null;
  try { hava = await havaAl(env); } catch (e) {}
  const satirlar = [];
  if (!izinli) satirlar.push({ saat: "12:15", metin: "İşe hazırlan ve çık" }, { saat: "13:00", metin: "Tavuk Dünyası vardiyası (22:00'ye kadar)" }, { saat: "22:30", metin: "Eve dönüş, kurgu ve müşteri işleri" });
  else satirlar.push({ saat: "-", metin: "Bugün izin günü: kurgu ve ilanlara ağırlık ver" });
  bugunkuler.forEach((y) => satirlar.push({ saat: new Date(y.zaman + 3 * 3600 * 1000).toISOString().slice(11, 16), metin: y.metin }));
  takvim.forEach((t) => satirlar.push({ saat: t.saat, metin: t.baslik + " (takvim)" }));
  zamansiz.slice(0, 5).forEach((y) => satirlar.push({ saat: "•", metin: y.metin }));
  satirlar.sort((a, b) => (a.saat > b.saat ? 1 : -1));
  const metin = `Bugun ${z.gun} ${z.tarih}${izinli ? " (izin)" : ""}. ` + (hava ? `Hava ${hava.gunler[0].durum}, ${hava.gunler[0].min}-${hava.gunler[0].max} derece. ` : "") +
    "Plan: " + satirlar.map((s) => (s.saat !== "•" && s.saat !== "-" ? s.saat + " " : "") + s.metin).join("; ") + ".";
  return { metin, ekran: { panel: "plan", veri: satirlar } };
}

async function izinAyarla(env, gunMetni) {
  const m = (gunMetni || "").toLocaleLowerCase("tr");
  const gun = m.includes("bugün") || m.includes("bugun") ? 0 : m.includes("öbür") ? 2 : 1;
  const t = bugunTR(gun);
  const l = await kvOku(env, "izin_gunleri", []);
  if (!l.includes(t)) l.push(t);
  await kvYaz(env, "izin_gunleri", l.filter((x) => x >= bugunTR(0)));
  return t + " izin gunu olarak kaydedildi.";
}

async function takvimBugun(env) {
  if (!env.DRIVE_SCRIPT_URL) return [];
  const b = await driveBilgi(env);
  const z = trSimdi();
  const bas = z.tarih + "T00:00:00+03:00", bit = z.tarih + "T23:59:59+03:00";
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(bas)}&timeMax=${encodeURIComponent(bit)}`, { headers: { Authorization: "Bearer " + b.token } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.items || []).map((e) => ({ baslik: e.summary || "(başlıksız)", saat: (e.start.dateTime || "").slice(11, 16) || "gün boyu" }));
}

// ---------------- Gmail ve Takvim (ayni Apps Script koprusu) ----------------
async function mailKontrol(env, a = {}) {
  if (!env.DRIVE_SCRIPT_URL) return "HATA: Gmail bagli degil. Eren'in Drive/Gmail koprusunu (Apps Script) kurmasi gerekiyor.";
  const b = await driveBilgi(env);
  const q = a.sorgu || "is:unread newer_than:2d -category:promotions -category:social";
  const H = { Authorization: "Bearer " + b.token };
  const l = await (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=" + encodeURIComponent(q), { headers: H })).json();
  if (l.error) return "HATA: Gmail izni yok (" + (l.error.message || "").slice(0, 80) + "). Kopru kodunu guncelleyip yeniden dagitmak gerekiyor.";
  const mesajlar = [];
  for (const m of (l.messages || []).slice(0, 8)) {
    const d = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: H })).json();
    const h = Object.fromEntries((d.payload?.headers || []).map((x) => [x.name, x.value]));
    mesajlar.push({ kimden: (h.From || "").replace(/<.*>/, "").trim(), konu: h.Subject || "", ozet: (d.snippet || "").slice(0, 160) });
  }
  if (!mesajlar.length) return "Yeni onemli mail yok.";
  return "Mailler (Ingilizce olanlari Eren'e Turkce ozetle): " + mesajlar.map((m, i) => `${i + 1}) ${m.kimden}: ${m.konu} - ${m.ozet}`).join(" | ");
}

async function takvimEkle(env, istek) {
  if (!env.DRIVE_SCRIPT_URL) return "HATA: Takvim bagli degil (Apps Script koprusu kurulmali).";
  const sistem = "Turkce bir takvim istegini cozumle. Simdi: " + trSimdi().tarih + " " + trSimdi().saat +
    ' (Turkiye). SADECE JSON: {"baslik":"","baslangic":"YYYY-MM-DDTHH:MM","sure_dk":60}';
  const j = JSON.parse(await sorGemini(env, sistem, [{ role: "user", content: istek }], MODELLER(env).sohbet, { json: true }));
  const b = await driveBilgi(env);
  const bas = new Date(Date.parse(j.baslangic + ":00+03:00"));
  const bit = new Date(bas.getTime() + (j.sure_dk || 60) * 60000);
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST", headers: { Authorization: "Bearer " + b.token, "content-type": "application/json" },
    body: JSON.stringify({ summary: j.baslik, start: { dateTime: bas.toISOString() }, end: { dateTime: bit.toISOString() } }),
  });
  if (!r.ok) return "HATA: Takvime eklenemedi (" + r.status + ").";
  await gunlukEkle(env, "Takvime eklendi: " + j.baslik);
  return `Takvime eklendi: ${j.baslik}, ${j.baslangic.replace("T", " ")}.`;
}

// Bildirim kuyrugu (telefon uygulamasi ceker)
// Mesai saatinde (varsayilan 13:00-22:00) sadece onemli bildirimler hemen gider; digerleri mesai bitince ozet olur
function mesaideMi(env) {
  const [b, s] = (env.MESAI || "13-22").split("-").map(Number);
  const sa = +trSimdi().saat.slice(0, 2);
  return sa >= b && sa < s;
}
const ONEMLI = /gkey|ödeme|odeme|bozuldu|hata|kurgu hazır|teslim|hatırlat/i;
// ---------------- Telegram (ikinci arayuz: yazi + sesli mesaj) ----------------
async function tgGizli(env) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tg:" + (env.APP_SECRET || "")));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
async function tg(env, yontem, govde) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${yontem}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) });
  return r.json();
}
async function tgGonder(env, metin, linkler = []) {
  const chat = await kvOku(env, "telegram_chat", null);
  if (!env.TELEGRAM_BOT_TOKEN || !chat) return;
  const dugmeler = linkler.filter((l) => /^https:\/\//.test(l.url || "")).slice(0, 6).map((l) => [{ text: String(l.ad || "Aç").slice(0, 30), url: l.url }]);
  await tg(env, "sendMessage", { chat_id: chat, text: String(metin).slice(0, 4000), disable_web_page_preview: true, ...(dugmeler.length ? { reply_markup: { inline_keyboard: dugmeler } } : {}) });
}
async function telegramIsle(env, u, kok) {
  const m = u.message || u.edited_message;
  if (!m) return;
  const chat = m.chat.id;
  const kayitli = await kvOku(env, "telegram_chat", null);
  const yazi = (m.text || m.caption || "").trim();
  if (!kayitli || kayitli !== chat) {
    if (yazi === "/start " + env.APP_SECRET || yazi === env.APP_SECRET) {
      await kvYaz(env, "telegram_chat", chat);
      await tg(env, "sendMessage", { chat_id: chat, text: "Bağlandım Eren 👋 Bana buradan yazabilir ya da sesli mesaj atabilirsin. Bildirimler de buraya gelecek." });
    } else await tg(env, "sendMessage", { chat_id: chat, text: "Jarvis şifresini yaz." });
    return;
  }
  let metin = yazi;
  if (m.voice || m.audio) {
    const f = await tg(env, "getFile", { file_id: (m.voice || m.audio).file_id });
    const ses = new Uint8Array(await (await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`)).arrayBuffer());
    metin = await groqDinle(env, ses, "ogg").catch(() => "");
    if (!metin) { await tgGonder(env, "Sesini anlayamadım, tekrar dener misin?"); return; }
  }
  if (m.video || m.document?.mime_type?.startsWith("video")) {
    await tgGonder(env, "Videoyu aldım ama Telegram botları en fazla 20 MB indirebiliyor. Büyük videoları telefondan 'Paylaş > Jarvis'e gönder' ile Drive'a at, sonra bana 'son videoyu kurgula' yaz.");
    if (!metin) return;
  }
  if (!metin) return;
  await tg(env, "sendChatAction", { chat_id: chat, action: "typing" });
  env.__kok = kok;
  const c = await sohbetEt(env, metin);
  const linkler = [...(c.link ? [{ ad: "Aç", url: c.link }] : []), ...(c.linkler || [])];
  await tgGonder(env, (m.voice ? "🎙 " + metin + "\n\n" : "") + (c.cevap || "..."), linkler);
  if (c.ekran && c.ekran.kopyala) await tgGonder(env, c.ekran.kopyala); // ayri mesaj: uzun basip kopyalamasi kolay olsun
}

async function bildirimEkle(env, baslik, metin, link) {
  if (mesaideMi(env) && !ONEMLI.test(baslik + " " + metin) && !(await kvOku(env, "mesai_kapali", false))) {
    const b = await kvOku(env, "bekleyen_bildirim", []);
    b.push({ baslik, metin, link: link || "" });
    await kvYaz(env, "bekleyen_bildirim", b.slice(-20));
    return;
  }
  try { await tgGonder(env, "🔔 " + baslik + (metin ? "\n" + metin : ""), link ? [{ ad: "Aç", url: link }] : []); } catch (e) {}
  const l = await kvOku(env, "bildirimler", []);
  l.push({ id: crypto.randomUUID().slice(0, 8), zaman: Date.now(), baslik, metin, link: link || "" });
  await kvYaz(env, "bildirimler", l.slice(-30));
}

// ================= IS VE GELIR TAKIBI =================
async function kurAl(env) {
  const on = await kvOku(env, "kur", null);
  if (on && Date.now() - on.zaman < 6 * 3600 * 1000) return on.usdtry;
  try {
    const j = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
    const k = j.rates && j.rates.TRY;
    if (k) { await kvYaz(env, "kur", { zaman: Date.now(), usdtry: k }); return k; }
  } catch (e) {}
  return on ? on.usdtry : null;
}

function paraCevir(miktar, birim, kur) {
  if (birim === "TRY" || birim === "TL") return kur ? miktar / kur : 0;
  return miktar; // USD varsay
}

async function isEkle(env, a) {
  const isler = await kvOku(env, "isler", []);
  let teslim = null;
  if (a.teslim) {
    try {
      const j = JSON.parse(await sorGemini(env, 'Tarihi cozumle. Simdi ' + trSimdi().tarih + ' ' + trSimdi().saat + ' (Turkiye). SADECE JSON: {"zaman":"YYYY-MM-DDTHH:MM"} (saat yoksa 18:00)',
        [{ role: "user", content: String(a.teslim) }], MODELLER(env).sohbet, { json: true }));
      teslim = Date.parse(j.zaman + ":00+03:00") || null;
    } catch (e) {}
  }
  const is = { id: crypto.randomUUID().slice(0, 6), musteri: String(a.musteri || "?"), aciklama: String(a.aciklama || "video"),
    ucret: parseFloat(a.ucret || "0") || 0, birim: /tl|try|₺/i.test(a.birim || "") ? "TRY" : "USD", teslim, durum: "yapiliyor", eklendi: Date.now(), odendi: false };
  isler.push(is);
  await kvYaz(env, "isler", isler.slice(-200));
  await gunlukEkle(env, `Yeni iş: ${is.musteri} - ${is.aciklama}` + (is.ucret ? ` (${is.ucret} ${is.birim})` : ""));
  if (teslim) {
    const y = await kvOku(env, "yapacaklar", []);
    y.push({ id: "is" + is.id, zaman: teslim - 2 * 3600 * 1000, metin: `${is.musteri} teslimine 2 saat kaldı: ${is.aciklama}` });
    await kvYaz(env, "yapacaklar", y);
  }
  return `Is kaydedildi (no ${is.id}): ${is.musteri}, ${is.aciklama}` + (is.ucret ? `, ${is.ucret} ${is.birim}` : "") + (teslim ? ", teslim " + new Date(teslim + 3 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") + " (2 saat once hatirlatacagim)" : "") + ".";
}

async function isGuncelle(env, a) {
  const isler = await kvOku(env, "isler", []);
  const ara = String(a.is || "").toLocaleLowerCase("tr");
  const adaylar = isler.filter((i) => i.id === ara || i.musteri.toLocaleLowerCase("tr").includes(ara) || i.aciklama.toLocaleLowerCase("tr").includes(ara));
  const is = (a.durum === "odendi" ? adaylar.filter((i) => !i.odendi) : adaylar.filter((i) => i.durum !== "teslim")).slice(-1)[0] || adaylar.slice(-1)[0];
  if (!is) return "HATA: bu ise uyan kayit bulamadim. Once 'isler' ile listeyi kontrol et.";
  if (a.durum === "teslim") { is.durum = "teslim"; is.teslimEdildi = Date.now(); }
  if (a.durum === "odendi") { is.odendi = true; is.odemeZamani = Date.now(); if (a.ucret) is.ucret = parseFloat(a.ucret) || is.ucret; }
  if (a.durum === "iptal") is.durum = "iptal";
  await kvYaz(env, "isler", isler);
  await gunlukEkle(env, `İş güncellendi: ${is.musteri} - ${is.aciklama} → ${a.durum}`);
  return `${is.musteri} / ${is.aciklama} isi '${a.durum}' olarak guncellendi.`;
}

async function gelirOzeti(env) {
  const isler = await kvOku(env, "isler", []);
  const kur = await kurAl(env);
  const ay = trSimdi().tarih.slice(0, 7);
  const buAy = isler.filter((i) => i.odendi && new Date((i.odemeZamani || 0) + 3 * 3600 * 1000).toISOString().slice(0, 7) === ay);
  const kazanc = buAy.reduce((t, i) => t + paraCevir(i.ucret, i.birim, kur), 0);
  const bekleyen = isler.filter((i) => i.durum === "teslim" && !i.odendi);
  const bekleyenTutar = bekleyen.reduce((t, i) => t + paraCevir(i.ucret, i.birim, kur), 0);
  const devam = isler.filter((i) => i.durum === "yapiliyor");
  const hedef = parseFloat(env.AYLIK_HEDEF || "800");
  const gunKalan = new Date(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7), 0)).getUTCDate() - +trSimdi().tarih.slice(8, 10);
  const metin = `Bu ay kazanc: ${kazanc.toFixed(0)} dolar` + (kur ? ` (yaklasik ${Math.round(kazanc * kur).toLocaleString("tr-TR")} TL, kur ${kur.toFixed(2)})` : "") +
    `. Hedef ${hedef} dolarin %${Math.round((kazanc / hedef) * 100)}'i. Ayin bitmesine ${gunKalan} gun var. ` +
    `Odemesi bekleyen ${bekleyen.length} is (${bekleyenTutar.toFixed(0)} dolar), devam eden ${devam.length} is.` +
    (devam.length ? " Devam edenler: " + devam.map((i) => `${i.musteri} - ${i.aciklama}` + (i.teslim ? ` (teslim ${new Date(i.teslim + 3 * 3600 * 1000).toISOString().slice(5, 16).replace("T", " ")})` : "")).join("; ") : "");
  return { metin, ekran: { panel: "isler", veri: { kazanc: Math.round(kazanc), hedef, bekleyen: Math.round(bekleyenTutar), isler: devam.concat(bekleyen).slice(0, 8).map((i) => ({ musteri: i.musteri, aciklama: i.aciklama, durum: i.odendi ? "ödendi" : i.durum === "teslim" ? "ödeme bekliyor" : "yapılıyor" })) } } };
}

// ================= 7/24 OTONOM DONGU =================
// ---------------- Discord (bot ile kanal okuma) ----------------
async function discord(env, yol, ayar = {}) {
  const r = await fetch("https://discord.com/api/v10" + yol, { ...ayar, headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "content-type": "application/json", ...(ayar.headers || {}) } });
  if (!r.ok) throw new Error("Discord " + r.status);
  return r.json();
}
function discordKanallar(env) { return (env.DISCORD_KANALLAR || "").split(",").map((x) => x.trim()).filter(Boolean); }
async function discordOku(env, a = {}) {
  if (!env.DISCORD_BOT_TOKEN) return "HATA: Discord bagli degil. Eren'in DISCORD_BOT_TOKEN ve DISCORD_KANALLAR eklemesi gerekiyor.";
  const kanallar = a.kanal ? [a.kanal] : discordKanallar(env);
  if (!kanallar.length) return "HATA: Okunacak Discord kanali yok (DISCORD_KANALLAR bos).";
  const cikti = [];
  for (const k of kanallar.slice(0, 4)) {
    try {
      const m = await discord(env, `/channels/${k}/messages?limit=${Math.min(+a.adet || 10, 25)}`);
      cikti.push(`Kanal ${k}: ` + m.reverse().map((x) => `${x.author.global_name || x.author.username}: ${(x.content || "[ek dosya]").slice(0, 200)}`).join(" | "));
    } catch (e) { cikti.push(`Kanal ${k}: okunamadi (${e.message}). Bot o sunucuda olmayabilir.`); }
  }
  return "Discord mesajlari (Ingilizceleri Eren'e Turkce ozetle, cevap gerekiyorsa Ingilizce taslak + Turkce cevirisini ver; Eren 'gonder' demeden gonderme): " + cikti.join(" || ");
}
// Ozel mesaj (DM) icin: Eren kendi hesabindan gonderir; Jarvis metni kopyalanabilir yapar ve sohbeti acar
async function dmHazirla(env, a = {}) {
  const ad = String(a.kisi || "gkey").toLowerCase();
  const kartlar = await kvOku(env, "musteri_kartlari", {});
  const k = kartlar[ad] || { ad: a.kisi || "GKey", notlar: [] };
  if (a.dm_link && /discord\.com\/channels\/@me\/\d+/.test(a.dm_link)) { k.dm = a.dm_link.match(/https:\/\/discord\.com\/channels\/@me\/\d+/)[0]; kartlar[ad] = k; await kvYaz(env, "musteri_kartlari", kartlar); }
  if (!a.mesaj) return k.dm ? "DM linki kayitli." : "DM linki kaydedildi.";
  const sayKey = "dm_say_" + ad + "_" + trSimdi().tarih;
  const say = await kvOku(env, sayKey, 0);
  if (say >= 2 && !a.zorla) return "DUR: " + k.ad + "'e bugun zaten 2 mesaj gitti (gunde en fazla 1-2 kurali). Eren israr ederse zorla:true ile tekrar cagir.";
  await kvYaz(env, sayKey, say + 1);
  await kvYaz(env, "son_temas_" + ad, Date.now());
  await gunlukEkle(env, k.ad + "'e mesaj hazırlandı: " + String(a.mesaj).slice(0, 50));
  const dm = k.dm || "https://discord.com/channels/@me";
  return { metin: "Mesaj kopyalanmaya hazir. Eren KOPYALA'ya basip Discord'da yapistiracak" + (k.dm ? "." : " (GKey sohbetinin linkini bir kez verirse direkt o sohbet acilir: Discord'da sohbete sag tik/uzun bas > Linki kopyala)."),
    ekran: { kopyala: String(a.mesaj), ac: dm }, linkler: [{ ad: "DISCORD'U AÇ", url: dm }] };
}

async function discordYaz(env, a = {}) {
  if (!env.DISCORD_BOT_TOKEN) return "HATA: Discord bagli degil.";
  const k = a.kanal || discordKanallar(env)[0];
  if (!a.mesaj || !k) return "HATA: mesaj veya kanal yok.";
  const sayKey = "discord_say_" + k + "_" + trSimdi().tarih;
  const say = await kvOku(env, sayKey, 0);
  if (say >= 2 && !a.zorla) return "DUR: Bu kanala bugun zaten 2 mesaj gitti (Eren'in kurali: musteriye gunde en fazla 1-2 mesaj). Eren israr ederse zorla:true ile gonder.";
  await kvYaz(env, sayKey, say + 1);
  await discord(env, `/channels/${k}/messages`, { method: "POST", body: JSON.stringify({ content: a.mesaj.slice(0, 1900) }) });
  await gunlukEkle(env, "Discord'a mesaj gonderildi: " + a.mesaj.slice(0, 60));
  return "Gonderildi.";
}

async function haftalikRapor(env) {
  const g = (await kvOku(env, "gunluk", [])).filter((x) => Date.now() - x.zaman < 7 * 864e5);
  const isler = await kvOku(env, "isler", []);
  const ham = [
    (await gelirOzeti(env).catch(() => ({ metin: "" }))).metin,
    "Bu hafta isler: " + isler.filter((i) => Date.now() - (i.eklendi || 0) < 7 * 864e5).map((i) => `${i.musteri}: ${i.aciklama || ""} (${i.durum})`).join("; "),
    "Jarvis gunlugu: " + g.map((x) => x.metin).slice(-60).join("; "),
  ].join("\n");
  const sistem = SISTEM_TEMEL + "\n\nEren icin kisa bir HAFTALIK RAPOR yaz (Turkce, en fazla 8 cumle): bu hafta kac video/is yapildi, ne kadar kazanildi ve aylik hedefe ne kadar kaldi, " +
    "yeni ilanlar ve basvurular, Jarvis'in kendi yaptiklari, ve gelecek hafta icin GKey odakli 2 somut oneri. Uydurma; veride yoksa 'kayit yok' de.";
  let r;
  try { r = env.GROQ_API_KEY ? await sorGroq(env, sistem, [{ role: "user", content: ham }]) : await sorGemini(env, sistem, [{ role: "user", content: ham }], MODELLER(env).sohbet); }
  catch (e) { r = "Haftalık rapor hazırlanamadı."; }
  await kvYaz(env, "son_rapor", { tarih: trSimdi().tarih, metin: r });
  await gunlukEkle(env, "Haftalık rapor hazırladım");
  return r;
}

async function saatlikIs(env) {
  const z = trSimdi();
  // 1) Yeni ilanlar
  try {
    const liste = JSON.parse(await digerDosya(env, SABLON_REPO, "ilanlar/son.json"));
    const goruldu = await kvOku(env, "bildirilen_ilanlar", []);
    const yeni = liste.filter((d) => !goruldu.includes(d.id));
    const taslaklar = await kvOku(env, "basvuru_taslaklari", {});
    for (const d of yeni.filter((x) => (x.puan || 0) >= 7).slice(0, 3)) {
      let taslakVar = false;
      if ((d.puan || 0) >= 8) {
        try { taslaklar[d.id] = await basvuruUret(env, d, env.JARVIS_URL || "https://jarviss.akaimecr.workers.dev"); taslakVar = true; } catch (e) {}
      }
      await bildirimEkle(env, "Yeni ilan (" + d.puan + "/10)" + (taslakVar ? " • başvuru taslağı hazır" : ""), d.ozet, d.link);
      await gunlukEkle(env, "Yeni ilan buldum" + (taslakVar ? " ve başvuru taslağı hazırladım" : "") + ": " + (d.ozet || d.baslik).slice(0, 90));
    }
    await kvYaz(env, "basvuru_taslaklari", Object.fromEntries(Object.entries(taslaklar).slice(-20)));
    if (yeni.length) await kvYaz(env, "bildirilen_ilanlar", goruldu.concat(yeni.map((d) => d.id)).slice(-300));
  } catch (e) {}
  // 2) Biten kurgu
  try {
    const j = await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/runs?per_page=1`);
    const r = j.workflow_runs && j.workflow_runs[0];
    const son = await kvOku(env, "son_bildirilen_kurgu", 0);
    if (r && r.status === "completed" && r.run_number > son) {
      await kvYaz(env, "son_bildirilen_kurgu", r.run_number);
      const ok = r.conclusion === "success";
      await bildirimEkle(env, ok ? "Kurgu hazır 🎬" : "Kurgu hata verdi", ok ? "Videoyu izlemek için dokun." : "Jarvis'e 'kurgu durumu' de.", "");
      await gunlukEkle(env, ok ? "Kurgu #" + r.run_number + " bitti" : "Kurgu #" + r.run_number + " hata verdi");
    }
  } catch (e) {}
  // 3) Yeni mailler
  if (env.DRIVE_SCRIPT_URL) {
    try {
      const b = await driveBilgi(env);
      const H = { Authorization: "Bearer " + b.token };
      const l = await (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=" + encodeURIComponent("is:unread newer_than:1d -category:promotions -category:social"), { headers: H })).json();
      const goruldu = await kvOku(env, "bildirilen_mailler", []);
      for (const m of (l.messages || []).filter((x) => !goruldu.includes(x.id)).slice(0, 3)) {
        const d = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: H })).json();
        const h = Object.fromEntries((d.payload?.headers || []).map((x) => [x.name, x.value]));
        const kimden = (h.From || "").replace(/<.*>/, "").trim();
        const gkey = /gkey/i.test(h.From || "") || /gkey/i.test(h.Subject || "");
        await bildirimEkle(env, (gkey ? "GKey'den mail! " : "Yeni mail: ") + kimden, h.Subject || "", "");
        await gunlukEkle(env, "Yeni mail geldi: " + kimden + " - " + (h.Subject || "").slice(0, 60));
        goruldu.push(m.id);
      }
      await kvYaz(env, "bildirilen_mailler", goruldu.slice(-200));
    } catch (e) {}
  }
  // 3b) Discord'da yeni mesaj (ozellikle GKey)
  if (env.DISCORD_BOT_TOKEN) {
    for (const k of discordKanallar(env).slice(0, 4)) {
      try {
        const sonId = await kvOku(env, "discord_son_" + k, "");
        const m = await discord(env, `/channels/${k}/messages?limit=10` + (sonId ? "&after=" + sonId : ""));
        if (!m.length) continue;
        await kvYaz(env, "discord_son_" + k, m[0].id);
        if (!sonId) continue;
        const benim = (env.DISCORD_BENIM_AD || "eren").toLowerCase();
        const yeni = m.filter((x) => !x.author.bot && !(x.author.username || "").toLowerCase().includes(benim));
        if (!yeni.length) continue;
        const gkey = yeni.some((x) => /gkey/i.test(x.author.username + " " + (x.author.global_name || "")));
        try {
          const kartlar = await kvOku(env, "musteri_kartlari", {});
          for (const x of yeni) for (const ad of Object.keys(kartlar).concat("gkey"))
            if ((x.author.username + " " + (x.author.global_name || "")).toLowerCase().includes(ad)) await kvYaz(env, "son_temas_" + ad, Date.now());
        } catch (e) {}
        await bildirimEkle(env, (gkey ? "GKey Discord'dan yazdı! " : "Discord'da yeni mesaj ") + "(" + yeni.length + ")", (yeni[0].content || "").slice(0, 120), "");
        await gunlukEkle(env, "Discord'da " + yeni.length + " yeni mesaj" + (gkey ? " (GKey)" : ""));
      } catch (e) {}
    }
  }
  // 3a) Otomatik kurgu: Drive/ham'a yeni video dusunce kendiliginden kurgula
  const oto = await kvOku(env, "oto_kurgu", null);
  if (oto && oto.acik && env.DRIVE_SCRIPT_URL) {
    try {
      const r = await topluKurgula(env, { adet: 3, stil: oto.stil, format: oto.format });
      if (!r.startsWith("Drive/ham") && !r.startsWith("HATA")) await bildirimEkle(env, "Otomatik kurgu başladı 🎬", r.slice(0, 140), "");
    } catch (e) {}
  }
  // 3d) Odeme takibi: teslim edilmis ama 3 gundur odenmemis isler (gunde bir kez, 12:00)
  if (z.saat.startsWith("12") && (await kvOku(env, "son_odeme_kontrol", "")) !== z.tarih) {
    await kvYaz(env, "son_odeme_kontrol", z.tarih);
    try {
      const geciken = (await kvOku(env, "isler", [])).filter((i) => i.durum === "teslim" && !i.odendi && Date.now() - (i.teslimEdildi || i.eklendi || 0) > 3 * 864e5);
      if (geciken.length) await bildirimEkle(env, "Ödeme bekleyen " + geciken.length + " iş var 💸", geciken.map((i) => i.musteri + ": " + i.aciklama).join(", ").slice(0, 140) + ". Jarvis'ten nazik hatırlatma mesajı isteyebilirsin.", "");
    } catch (e) {}
  }
  // 3f) Mesai bitti (22:xx): bekleyen bildirimleri tek ozet olarak gonder
  const mesaiBitis = String((env.MESAI || "13-22").split("-")[1]).padStart(2, "0");
  if (z.saat.startsWith(mesaiBitis) && (await kvOku(env, "son_mesai_ozet", "")) !== z.tarih) {
    await kvYaz(env, "son_mesai_ozet", z.tarih);
    const b = await kvOku(env, "bekleyen_bildirim", []);
    await kvYaz(env, "bekleyen_bildirim", []);
    const l = await kvOku(env, "bildirimler", []);
    const ozet = b.length ? b.map((x) => x.baslik).slice(0, 6).join(" • ") : "Mesaide önemli bir şey olmadı.";
    l.push({ id: crypto.randomUUID().slice(0, 8), zaman: Date.now(), baslik: "Mesai bitti, kolay gelsin 🙌 (" + b.length + " haber)", metin: ozet.slice(0, 200), link: "" });
    await kvYaz(env, "bildirimler", l.slice(-30));
  }
  // 3e) 6 saatte bir saglik kontrolu; yeni bozulan servis varsa bildir
  if (["00", "06", "12", "18"].includes(z.saat.slice(0, 2))) {
    try {
      const once = ((await kvOku(env, "son_saglik", null)) || { sonuc: [] }).sonuc.filter((x) => x.durum === "bozuk").map((x) => x.ad);
      const s2 = await saglikKontrol(env);
      const yeni = s2.ekran.veri.filter((x) => x.durum === "bozuk" && !once.includes(x.ad));
      if (yeni.length) await bildirimEkle(env, "Jarvis: bir servis bozuldu ⚠️", yeni.map((x) => x.ad + ": " + x.not).join("; ").slice(0, 140), "");
    } catch (e) {}
  }
  // 3g) Yeni ozellik kontrolleri (dolar, tarih, cikis havasi, teslim, sessiz musteri)
  try { await yeniSaatlik(env); } catch (e) {}
  // 3h) Claude Code isi bitti mi?
  try {
    const bk = await kvOku(env, "claude_kod_bekliyor", null);
    if (bk) {
      const d = await claudeKodDurumu(env);
      if (d.run) { await kvYaz(env, "claude_kod_bekliyor", null); await bildirimEkle(env, d.degisti === "evet" ? "Claude değişikliği hazırladı ✅" : "Claude Code bitti", String(d.metin).slice(0, 160), ""); }
    }
  } catch (e) {}
  // 3c) Pazar 23:00 haftalik rapor
  if (z.gun === "Pazar" && z.saat.startsWith("23") && (await kvOku(env, "son_haftalik", "")) !== z.tarih) {
    await kvYaz(env, "son_haftalik", z.tarih);
    try { const r = await haftalikRapor(env); await bildirimEkle(env, "Haftalık rapor hazır 📊", r.slice(0, 140), ""); } catch (e) {}
  }
  // 4) Gunde bir kez (10:00) is icin internet arastirmasi
  if (z.saat.startsWith("10") && (await kvOku(env, "son_arastirma", "")) !== z.tarih) {
    await kvYaz(env, "son_arastirma", z.tarih);
    const konular = [
      "Valorant lineup YouTube Shorts icin bu ay trend olan kurgu stilleri, altyazi ve efekt teknikleri neler?",
      "Freelance video editorlerin Reddit ve Discord'da daha cok is bulmasi icin guncel ipuclari neler?",
      "Remotion ile otomatik video kurgusunda yeni ozellikler veya kullanisli teknikler neler?",
    ];
    const konu = konular[new Date().getUTCDate() % konular.length];
    try {
      const r = await arastir(env, konu);
      const notlar = await kvOku(env, "arastirma_notlari", []);
      notlar.push({ tarih: z.tarih, konu, ozet: r.metin.slice(0, 1200) });
      await kvYaz(env, "arastirma_notlari", notlar.slice(-15));
      await gunlukEkle(env, "Araştırma yaptım: " + konu.slice(0, 70));
    } catch (e) {}
  }
}

async function sabahOzeti(env) {
  const parcalar = [];
  try { parcalar.push((await gunlukPlan(env)).metin); } catch (e) {}
  parcalar.push(await nelerYaptin(env));
  try { parcalar.push((await gelirOzeti(env)).metin); } catch (e) {}
  try { const g = await kvOku(env, "gece_ogrenilen", null); if (g && g.tarih === trSimdi().tarih) parcalar.push("Gece kendi kendine ogrendigin (Eren'e 'gece sunu ogrendim' diye kisaca anlat): " + g.metin); } catch (e) {}
  try { const n = (await kvOku(env, "arastirma_notlari", [])).slice(-1)[0]; if (n) parcalar.push("Son arastirma (" + n.konu + "): " + n.ozet.slice(0, 500)); } catch (e) {}
  const bk = await kvOku(env, "bekleyen_kod", null);
  if (bk) parcalar.push("Onay bekleyen kod onerin: " + bk.ozet);
  if (env.DRIVE_SCRIPT_URL) { try { parcalar.push(await mailKontrol(env, {})); } catch (e) {} }
  const sistem = SISTEM_TEMEL + "\n\nEren az once uyandi. Asagidaki bilgilerle ona sicak, dogal ve kisa bir sabah ozeti ver (en fazla 6-7 cumle): " +
    "gunaydin de, bugunun planini ve havayi soyle, gece kendi basina yaptiklarini ve onemli haberleri (yeni ilan, mail, kurgu, kod onerisi) anlat, " +
    "gune dair tek bir faydali oneride bulun. En sonda 'Gunun Ingilizcesi' de: musterilerle yazisirken ise yarayan tek bir kisa Ingilizce kalip, okunusu ve Turkce anlami (her gun farkli olsun). Madde isareti kullanma.";
  const mesaj = [{ role: "user", content: parcalar.join("\n") }];
  let cevap;
  try { cevap = env.GROQ_API_KEY ? await sorGroq(env, sistem, mesaj) : await sorGemini(env, sistem, mesaj, MODELLER(env).sohbet); }
  catch (e) { cevap = "Günaydın Eren! " + parcalar[0]; }
  let ekran = null;
  try { ekran = (await gunlukPlan(env)).ekran; } catch (e) {}
  return { cevap, ekran };
}

// ================= YENI OZELLIKLER (28 Ekim aksam) =================
// --- Musteri kartlari ---
async function musteriKart(env, a = {}) {
  const kartlar = await kvOku(env, "musteri_kartlari", {});
  const ad = String(a.ad || "").trim();
  if (!ad) {
    const l = Object.values(kartlar);
    if (!l.length) return "Henuz musteri karti yok. Ornek: 'GKey kartina fiyat 12 dolar yaz'.";
    return "Musteriler: " + l.map((k) => `${k.ad} (${k.fiyat || "fiyat yok"}${k.kanal ? ", " + k.kanal : ""})`).join("; ");
  }
  const anahtar = ad.toLowerCase();
  const k = kartlar[anahtar] || { ad, notlar: [] };
  for (const alan of ["fiyat", "stil", "kanal", "iletisim", "odeme"]) if (a[alan]) k[alan] = String(a[alan]);
  if (a.not) k.notlar = (k.notlar || []).concat(String(a.not)).slice(-15);
  const degisti = ["fiyat", "stil", "kanal", "iletisim", "odeme", "not"].some((x) => a[x]);
  kartlar[anahtar] = k;
  if (degisti) await kvYaz(env, "musteri_kartlari", kartlar);
  const isler = (await kvOku(env, "isler", [])).filter((i) => i.musteri.toLowerCase() === anahtar);
  const kur = await kurAl(env).catch(() => 0);
  const odenen = isler.filter((i) => i.odendi).reduce((t, i) => t + paraCevir(i.ucret, i.birim, kur), 0);
  const bekleyen = isler.filter((i) => i.durum === "teslim" && !i.odendi).reduce((t, i) => t + paraCevir(i.ucret, i.birim, kur), 0);
  const temas = await kvOku(env, "son_temas_" + anahtar, 0);
  return `${degisti ? "Kart guncellendi. " : ""}${k.ad}: fiyat ${k.fiyat || "?"}, stil ${k.stil || "?"}, kanal ${k.kanal || "?"}, iletisim ${k.iletisim || "?"}, odeme ${k.odeme || "?"}. ` +
    `Toplam ${isler.length} is, odenen ${odenen.toFixed(0)}$, bekleyen ${bekleyen.toFixed(0)}$. ` +
    (temas ? `Son mesaj ${Math.round((Date.now() - temas) / 864e5)} gun once. ` : "") + (k.notlar?.length ? "Notlar: " + k.notlar.join("; ") : "");
}

// --- Fiyat teklifi ---
function teklifHesapla(a = {}) {
  const adet = Math.max(1, parseInt(a.adet || "1"));
  const sure = Math.max(5, parseFloat(a.sure_sn || "40"));
  const uzun = /uzun|long/i.test(a.tur || "") || sure > 180;
  let birim = uzun ? 20 + Math.ceil(sure / 300) * 12 : 10 + Math.max(0, Math.ceil((sure - 30) / 15)) * 2;
  if (/thumbnail|kapak/i.test(a.ekstra || "")) birim += uzun ? 8 : 3;
  let toplam = birim * adet;
  const indirim = adet >= 20 ? 0.15 : adet >= 10 ? 0.1 : adet >= 5 ? 0.05 : 0;
  toplam *= 1 - indirim;
  if (/evet|true|acil|urgent/i.test(String(a.acil || ""))) toplam *= 1.3;
  toplam = Math.round(toplam);
  const gun = Math.max(1, Math.ceil(adet / (uzun ? 1 : 3)));
  const en = `Hi! For ${adet} ${uzun ? "long-form video" : "Short"}${adet > 1 ? "s" : ""} (~${Math.round(sure)}s each) my price is $${toplam} total` +
    (indirim ? ` (${Math.round(indirim * 100)}% bulk discount included)` : "") + `. Delivery in about ${gun} day${gun > 1 ? "s" : ""}, with captions, zooms, sound effects and 1 free revision. Happy to do a quick test edit first!`;
  const tr = `Merhaba! ${adet} adet ${uzun ? "uzun video" : "Short"} (her biri ~${Math.round(sure)} sn) için toplam fiyatım $${toplam}` +
    (indirim ? ` (%${Math.round(indirim * 100)} toplu indirim dahil)` : "") + `. Yaklaşık ${gun} günde teslim; altyazı, zoom, ses efekti ve 1 ücretsiz revizyon dahil. İstersen önce hızlı bir deneme kurgusu yapabilirim!`;
  return `Teklif: birim ~${birim}$, toplam ${toplam}$, teslim ~${gun} gun. Ingilizce mesaj: "${en}" | Turkcesi: "${tr}"`;
}

// --- Harcama takibi ---
async function harcama(env, a = {}) {
  const l = await kvOku(env, "harcamalar", []);
  const ay = trSimdi().tarih.slice(0, 7);
  if (a.miktar) {
    const m = parseFloat(String(a.miktar).replace(",", "."));
    if (!m) return "HATA: miktar anlasilmadi.";
    l.push({ zaman: Date.now(), ay, miktar: m, kategori: String(a.kategori || "diger").toLowerCase(), aciklama: String(a.aciklama || "") });
    await kvYaz(env, "harcamalar", l.slice(-500));
  }
  const buAy = l.filter((x) => x.ay === ay);
  const top = buAy.reduce((t, x) => t + x.miktar, 0);
  const kat = {};
  buAy.forEach((x) => (kat[x.kategori] = (kat[x.kategori] || 0) + x.miktar));
  return (a.miktar ? `${a.miktar} TL (${a.kategori || "diger"}) kaydedildi. ` : "") +
    `Bu ay toplam harcama ${Math.round(top)} TL: ` + Object.entries(kat).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${Math.round(v)} TL`).join(", ");
}

// --- Haftalik hedef ---
async function haftalikHedef(env, a = {}) {
  const pzt = (() => { const d = new Date(Date.now() + 3 * 3600 * 1000); const g = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - g); return d.toISOString().slice(0, 10); })();
  let h = await kvOku(env, "haftalik_hedef", null);
  if (a.sayi) { h = { hafta: pzt, sayi: parseInt(a.sayi), ne: String(a.ne || "video") }; await kvYaz(env, "haftalik_hedef", h); }
  if (!h) return "Haftalik hedef yok. Ornek: 'bu hafta hedefim 10 video'.";
  let yapilan = 0;
  try {
    const j = await gh(env, `/repos/${SABLON_REPO}/actions/workflows/render.yml/runs?per_page=50&status=success&created=>=${pzt}`);
    yapilan = (j.workflow_runs || []).length;
  } catch (e) {}
  const isler = (await kvOku(env, "isler", [])).filter((i) => (i.teslimEdildi || 0) >= Date.parse(pzt + "T00:00:00+03:00")).length;
  return `Haftalik hedef: ${h.sayi} ${h.ne}. Bu hafta ${yapilan} kurgu bitti, ${isler} is teslim edildi. ` +
    (h.hafta !== pzt ? "(Hedef gecen haftadan kalma, yenisini soyleyebilirsin.) " : "") + `Kalan: ${Math.max(0, h.sayi - Math.max(yapilan, isler))}.`;
}

// --- Dolar alarmi ve onemli tarihler ---
async function dolarAlarm(env, a = {}) {
  const k = parseFloat(String(a.kur || "").replace(",", "."));
  const kur = await kurAl(env).catch(() => 0);
  if (!k) return `Su an 1 dolar ${kur ? kur.toFixed(2) : "?"} TL. Alarm icin kur soyle (ornek 'dolar 35'i gecince haber ver').`;
  await kvYaz(env, "dolar_alarm", { kur: k, yon: kur && k < kur ? "alti" : "ustu" });
  return `Tamam, dolar ${k} TL'nin ${kur && k < kur ? "altina dusunce" : "ustune cikinca"} haber verecegim (su an ${kur ? kur.toFixed(2) : "?"}).`;
}
async function onemliTarih(env, a = {}) {
  const l = await kvOku(env, "onemli_tarihler", []);
  if (a.ad && a.tarih) {
    const t = String(a.tarih).match(/(\d{1,2})[./-](\d{1,2})/);
    if (!t) return "HATA: tarih GG.AA seklinde olmali (ornek 14.02).";
    l.push({ ad: String(a.ad), gun: t[1].padStart(2, "0"), ay: t[2].padStart(2, "0") });
    await kvYaz(env, "onemli_tarihler", l.slice(-60));
  }
  return (a.ad ? "Kaydettim. " : "") + (l.length ? "Onemli tarihler: " + l.map((x) => `${x.ad} ${x.gun}.${x.ay}`).join(", ") + ". Bir gun once ve o gun sabah hatirlatirim." : "Kayitli onemli tarih yok.");
}

// --- Uyku takibi (iyi geceler / uyandim zamanlari) ---
async function uykuKaydet(env, tur) {
  const l = await kvOku(env, "uyku", []);
  l.push({ tur, zaman: Date.now() });
  await kvYaz(env, "uyku", l.slice(-60));
}
async function uykuOzeti(env) {
  const l = await kvOku(env, "uyku", []);
  const geceler = [];
  for (let i = 0; i < l.length; i++) if (l[i].tur === "yat") {
    const k = l.slice(i + 1).find((x) => x.tur === "kalk");
    if (k && k.zaman - l[i].zaman < 16 * 3600e3) geceler.push({ yat: l[i].zaman, kalk: k.zaman, sure: (k.zaman - l[i].zaman) / 3600e3 });
  }
  const son = geceler.slice(-7);
  if (!son.length) return "Henuz uyku kaydi yok. 'iyi geceler' ve alarmda 'uyandim' dedikce kaydederim.";
  const ort = son.reduce((t, g) => t + g.sure, 0) / son.length;
  const s = (z) => new Date(z + 3 * 3600e3).toISOString().slice(11, 16);
  return `Son ${son.length} gece ortalama ${ort.toFixed(1)} saat uyudun. ` + son.map((g) => `${s(g.yat)}-${s(g.kalk)} (${g.sure.toFixed(1)} sa)`).join(", ") +
    (ort < 6.5 ? ". Biraz az, mesai oncesi en az 7 saat iyi olur." : ".");
}

// --- Hafiza: unut / listele ---
async function hafiza(env, a = {}) {
  const notlar = await kvOku(env, "notlar", []);
  if (a.unut) {
    const k = String(a.unut).toLowerCase();
    const kalan = notlar.filter((n) => !n.toLowerCase().includes(k));
    await kvYaz(env, "notlar", kalan);
    return `${notlar.length - kalan.length} bilgiyi unuttum.`;
  }
  return notlar.length ? "Hakkinda bildiklerim: " + notlar.slice(-25).join("; ") : "Henuz kayitli bilgi yok.";
}

// --- Gece kendi kendine ogrenme ---
async function geceOgren(env) {
  const konular = ["Remotion ile video kurgusunda az bilinen bir teknik", "YouTube Shorts algoritmasinin son guncellemeleri", "freelance video editorlerin fiyatlandirma taktikleri",
    "Valorant lineup videolarinda izleyiciyi tutan kurgu hileleri", "telefonla verimli calisma ve zaman yonetimi ipucu", "yapay zeka ile video kurgusunda yeni ucretsiz araclar"];
  const konu = konular[new Date().getUTCDate() % konular.length];
  const r = await arastir(env, konu + " hakkinda bugun ogrenilecek tek, somut ve uygulanabilir bir bilgi nedir? 3 cumle.");
  await kvYaz(env, "gece_ogrenilen", { tarih: trSimdi().tarih, konu, metin: r.metin.slice(0, 700) });
  await gunlukEkle(env, "Gece öğrendim: " + konu);
}

// --- Hafiza yedegi (GitHub, ozel repo) ---
async function yedekAl(env) {
  const anahtarlar = ["notlar", "isler", "musteri_kartlari", "harcamalar", "onemli_tarihler", "portfolyo", "yapacaklar", "alarm_ayari", "haftalik_hedef", "uyku", "musteri_adaylari", "konum"];
  const veri = {};
  for (const k of anahtarlar) veri[k] = await kvOku(env, k, null);
  const yol = `/repos/${SABLON_REPO}/contents/yedek/hafiza.json`;
  let sha;
  try { sha = (await gh(env, yol + "?ref=yedek")).sha; } catch (e) {}
  if (!sha) { // ayri bir 'yedek' dali (ilk sefer olustur)
    try { const ana = await gh(env, `/repos/${SABLON_REPO}/git/ref/heads/main`); await gh(env, `/repos/${SABLON_REPO}/git/refs`, { method: "POST", body: JSON.stringify({ ref: "refs/heads/yedek", sha: ana.object.sha }) }); } catch (e) {}
  }
  await gh(env, yol, { method: "PUT", body: JSON.stringify({ message: "Gece hafiza yedegi " + trSimdi().tarih, content: b64Yap(JSON.stringify(veri, null, 1)), branch: "yedek", ...(sha ? { sha } : {}) }) });
}

// --- Fatura (Invoice): imzali, yazdirilabilir sayfa ---
async function faturaOlustur(env, a = {}) {
  const musteri = String(a.musteri || "").trim();
  if (!musteri) return "HATA: musteri adi gerekli.";
  const isler = (await kvOku(env, "isler", [])).filter((i) => i.musteri.toLowerCase() === musteri.toLowerCase() && !i.odendi && i.durum !== "iptal");
  const kalemler = a.kalem ? [{ aciklama: String(a.kalem), ucret: parseFloat(a.tutar || "0") || 0, birim: "USD" }] : isler.map((i) => ({ aciklama: i.aciklama, ucret: i.ucret, birim: i.birim }));
  if (!kalemler.length || !kalemler.some((k) => k.ucret > 0)) return "HATA: faturalanacak ucretli is yok. Is ekle ya da kalem + tutar ver.";
  const no = "INV-" + trSimdi().tarih.replace(/-/g, "") + "-" + crypto.randomUUID().slice(0, 4).toUpperCase();
  const f = { no, tarih: trSimdi().tarih, musteri, kalemler, odeme: String(a.odeme || (await kvOku(env, "musteri_kartlari", {}))[musteri.toLowerCase()]?.odeme || "Payoneer"), ad: env.FATURA_AD || "Eren" };
  const l = await kvOku(env, "faturalar", {});
  l[no] = f;
  await kvYaz(env, "faturalar", Object.fromEntries(Object.entries(l).slice(-50)));
  const imza = await videoImza(env, "fatura-" + no);
  const link = (env.__kok || "") + "/fatura/" + no + "?t=" + imza;
  await gunlukEkle(env, "Fatura hazırlandı: " + no + " (" + musteri + ")");
  const top = kalemler.reduce((t, k) => t + (k.birim === "USD" ? k.ucret : 0), 0);
  return { metin: `Fatura ${no} hazir: ${kalemler.length} kalem, toplam ${top} USD. Linki musteriye gonderebilir ya da tarayicida acip PDF olarak kaydedebilirsin. Musteriye mesaj: "Hi! Here is the invoice for my recent work: ${link} Thank you!" (Turkcesi: Merhaba! Son islerimin faturasi bu linkte. Tesekkurler!)`, link };
}
function faturaSayfa(f) {
  const e = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const top = f.kalemler.reduce((t, k) => t + k.ucret, 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${e(f.no)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111;background:#fff}h1{margin:0;font-size:28px}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.t{font-size:22px;font-weight:700}.k{color:#666;font-size:14px}button{padding:10px 18px;border:0;border-radius:8px;background:#111;color:#fff}@media print{button{display:none}}</style></head><body>
<div class="top"><div><h1>INVOICE</h1><div class="k">${e(f.no)} • ${e(f.tarih)}</div></div><div><b>${e(f.ad)}</b><div class="k">Video Editor</div></div></div>
<p><span class="k">Bill to:</span><br><b>${e(f.musteri)}</b></p>
<table><tr><th>Description</th><th>Amount</th></tr>${f.kalemler.map((k) => `<tr><td>${e(k.aciklama)}</td><td>${e(k.ucret)} ${e(k.birim)}</td></tr>`).join("")}
<tr><td class="t">Total</td><td class="t">${e(top)} ${e(f.kalemler[0].birim)}</td></tr></table>
<p><span class="k">Payment method:</span> ${e(f.odeme)}</p><p class="k">Thank you for your business!</p><button onclick="print()">Save as PDF / Print</button></body></html>`;
}

// --- YouTube kanal istatistigi (ucretsiz YOUTUBE_API_KEY) ---
async function kanalIstatistik(env, a = {}) {
  if (!env.YOUTUBE_API_KEY) return "HATA: YOUTUBE_API_KEY yok (Google Cloud Console'dan ucretsiz, 'YouTube Data API v3' acilip alinir).";
  let k = String(a.kanal || (await kvOku(env, "musteri_kartlari", {})).gkey?.kanal || "").trim();
  if (!k) return "HATA: kanal adi ya da @handle gerekli (ornek @gkey). Musteri kartina kanal eklersen otomatik bakarim.";
  const handle = (k.match(/@[\w.-]+/) || [])[0];
  const idm = k.match(/channel\/(UC[\w-]+)/);
  const q = idm ? "id=" + idm[1] : handle ? "forHandle=" + encodeURIComponent(handle) : "forHandle=" + encodeURIComponent("@" + k.replace(/\s+/g, ""));
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet,contentDetails&${q}&key=${env.YOUTUBE_API_KEY}`)).json();
  const c = j.items?.[0];
  if (!c) return "HATA: kanal bulunamadi (" + k + ").";
  const st = c.statistics;
  const once = await kvOku(env, "kanal_" + c.id, null);
  await kvYaz(env, "kanal_" + c.id, { zaman: Date.now(), abone: +st.subscriberCount, izlenme: +st.viewCount });
  const v = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${c.contentDetails.relatedPlaylists.uploads}&key=${env.YOUTUBE_API_KEY}`)).json();
  const ids = (v.items || []).map((x) => x.contentDetails.videoId).join(",");
  let sonlar = [];
  if (ids) {
    const d = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids}&key=${env.YOUTUBE_API_KEY}`)).json();
    sonlar = (d.items || []).map((x) => `"${x.snippet.title.slice(0, 40)}" ${(+x.statistics.viewCount).toLocaleString("tr-TR")} izlenme`);
  }
  const fark = once ? ` (son bakistan beri +${(+st.subscriberCount - once.abone).toLocaleString("tr-TR")} abone, +${(+st.viewCount - once.izlenme).toLocaleString("tr-TR")} izlenme)` : "";
  return `${c.snippet.title}: ${(+st.subscriberCount).toLocaleString("tr-TR")} abone, ${(+st.viewCount).toLocaleString("tr-TR")} toplam izlenme, ${st.videoCount} video${fark}. Son videolar: ${sonlar.join("; ")}.`;
}

// --- Musteriye haftalik is raporu taslagi ---
async function musteriRaporu(env, a = {}) {
  const ad = String(a.musteri || "GKey").toLowerCase();
  const isler = (await kvOku(env, "isler", [])).filter((i) => i.musteri.toLowerCase() === ad && Date.now() - (i.eklendi || 0) < 7 * 864e5);
  if (!isler.length) return "Bu hafta " + a.musteri + " icin kayitli is yok. Once is_ekle ile isleri kaydetmek lazim.";
  const liste = isler.map((i) => `- ${i.aciklama} (${i.durum === "teslim" || i.odendi ? "delivered" : "in progress"})`).join("\n");
  const tr = isler.map((i) => `- ${i.aciklama} (${i.durum === "teslim" || i.odendi ? "teslim edildi" : "devam ediyor"})`).join("\n");
  return `Musteriye haftalik rapor taslagi (Eren 'gonder' demeden gonderme). EN: "Hey! Quick weekly update:\n${liste}\nLet me know if you want any changes or have new videos for next week!" | TR: "Selam! Haftalik kisa ozet:\n${tr}\nDegisiklik istersen ya da gelecek hafta icin yeni video varsa haber ver!"`;
}

// --- YouTube'da video arama (API anahtari varsa API, yoksa arama sayfasi) ---
async function youtubeAra(env, a = {}) {
  const q = String(a.sorgu || "").trim();
  if (!q) return "HATA: ne arayayim?";
  const adet = Math.min(+a.adet || 5, 8);
  let sonuc = [];
  if (env.YOUTUBE_API_KEY) {
    try {
      const j = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${adet}&q=${encodeURIComponent(q)}${/short/i.test(a.tur || "") ? "&videoDuration=short" : ""}&key=${env.YOUTUBE_API_KEY}`)).json();
      sonuc = (j.items || []).map((x) => ({ id: x.id.videoId, baslik: x.snippet.title, kanal: x.snippet.channelTitle }));
    } catch (e) {}
  }
  if (!sonuc.length) {
    const h = await (await fetch("https://www.youtube.com/results?hl=tr&gl=TR&search_query=" + encodeURIComponent(q + (/short/i.test(a.tur || "") ? " #shorts" : "")), { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36", "Accept-Language": "tr-TR,tr" } })).text();
    const goruldu = new Set();
    for (const m of h.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"(.*?)"\}.*?"ownerText":\{"runs":\[\{"text":"(.*?)"/g)) {
      if (goruldu.has(m[1])) continue; goruldu.add(m[1]);
      sonuc.push({ id: m[1], baslik: JSON.parse('"' + m[2] + '"'), kanal: JSON.parse('"' + m[3] + '"') });
      if (sonuc.length >= adet) break;
    }
    if (!sonuc.length) for (const m of h.matchAll(/\/(?:watch\?v=|shorts\/)([\w-]{11})/g)) { if (!goruldu.has(m[1])) { goruldu.add(m[1]); sonuc.push({ id: m[1], baslik: "", kanal: "" }); } if (sonuc.length >= adet) break; }
  }
  if (!sonuc.length) return "YouTube'da sonuc bulamadim.";
  await kvYaz(env, "son_youtube", sonuc);
  return {
    metin: `YouTube sonuclari ("${q}"): ` + sonuc.map((x, i) => `${i + 1}) ${x.baslik || "video"}${x.kanal ? " - " + x.kanal : ""} https://youtu.be/${x.id}`).join(" | ") +
      ". Stil icin kullanilacaksa stil_cikar aracina bu linkleri ver; telefonda acmak icin telefonda_ac.",
    linkler: sonuc.map((x, i) => ({ ad: "VİDEO " + (i + 1), url: "https://youtu.be/" + x.id })),
  };
}

// --- Laptop komut kuyrugu (laptop programi 5 sn'de bir sorar) ---
async function laptopKomut(env, a = {}) {
  const tur = String(a.tur || "ac");
  const l = await kvOku(env, "laptop_komutlar", []);
  l.push({ id: crypto.randomUUID().slice(0, 8), tur, deger: String(a.deger || ""), zaman: Date.now() });
  await kvYaz(env, "laptop_komutlar", l.slice(-10));
  const son = await kvOku(env, "laptop_son_gorulme", 0);
  const acik = Date.now() - son < 6 * 60e3;
  return (acik ? "Laptopa gonderdim: " : "Komutu siraya koydum ama laptop programi su an kapali gorunuyor (acilinca yapacak): ") + `${tur} ${a.deger || ""}`;
}

// --- Saatlik kontroller (yeni ozellikler) ---
async function yeniSaatlik(env) {
  const z = trSimdi();
  const sa = z.saat.slice(0, 2);
  // Dolar alarmi
  try {
    const al = await kvOku(env, "dolar_alarm", null);
    if (al) {
      const kur = await kurAl(env);
      if ((al.yon === "ustu" && kur >= al.kur) || (al.yon === "alti" && kur <= al.kur)) {
        await bildirimEkle(env, `Dolar alarmı: ${kur.toFixed(2)} TL 💵`, `Belirlediğin ${al.kur} TL seviyesi ${al.yon === "ustu" ? "geçildi" : "altına inildi"}.`, "");
        await kvSil(env, "dolar_alarm");
      }
    }
  } catch (e) {}
  // Mola hatirlatici (acikken; mesai disi, 10-12 ve 23 arasi, 2 saatte bir)
  try {
    if (await kvOku(env, "mola_acik", false)) {
      const s = +sa;
      if (!mesaideMi(env) && [10, 12, 23].includes(s) && (await kvOku(env, "son_mola", "")) !== z.tarih + sa)
        { await kvYaz(env, "son_mola", z.tarih + sa); await bildirimEkle(env, ["Su iç 💧", "Gözlerine 1 dk mola ver 👀", "Kalk biraz esne 🧘"][s % 3], "Ekrandan bir dakika uzaklaş.", ""); }
    }
  } catch (e) {}
  // Onemli tarihler (09:00)
  if (sa === "09" && (await kvOku(env, "son_tarih_kontrol", "")) !== z.tarih) {
    await kvYaz(env, "son_tarih_kontrol", z.tarih);
    const bugun = z.tarih.slice(8, 10) + "." + z.tarih.slice(5, 7);
    const yarin = new Date(Date.now() + 27 * 3600e3).toISOString();
    const yarinS = yarin.slice(8, 10) + "." + yarin.slice(5, 7);
    for (const t of await kvOku(env, "onemli_tarihler", [])) {
      const s = t.gun + "." + t.ay;
      if (s === bugun) await bildirimEkle(env, "Bugün: " + t.ad + " 🎉", "Unutma!", "");
      else if (s === yarinS) await bildirimEkle(env, "Yarın: " + t.ad, "Hazırlık yapmak istersen bugün iyi bir gün.", "");
    }
  }
  // Mesai cikisi hava uyarisi (21:00)
  if (sa === "21" && (await kvOku(env, "son_cikis_hava", "")) !== z.tarih) {
    await kvYaz(env, "son_cikis_hava", z.tarih);
    try {
      const k = await konumAl(env);
      const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${k.lat}&longitude=${k.lon}&hourly=precipitation_probability,temperature_2m,wind_speed_10m&timezone=Europe%2FIstanbul&forecast_days=1`)).json();
      const i = j.hourly.time.findIndex((t) => t.endsWith("22:00"));
      if (i >= 0) {
        const y = j.hourly.precipitation_probability[i], d = Math.round(j.hourly.temperature_2m[i]), r = Math.round(j.hourly.wind_speed_10m[i]);
        if (y >= 40 || d <= 8 || r >= 35)
          await bildirimEkle(env, "Mesai çıkışı hatırlatma ☔", `22:00'de ${d}°C` + (y >= 40 ? `, yağmur ihtimali %${y} - şemsiye al` : "") + (r >= 35 ? `, rüzgar ${r} km/s` : "") + (d <= 8 ? ", hava soğuk - mont" : "") + ".", "");
      }
    } catch (e) {}
  }
  // Teslime 24 saat kala geri sayim
  try {
    const isler = await kvOku(env, "isler", []);
    let degisti = false;
    for (const i of isler) {
      if (i.durum === "yapiliyor" && i.teslim && !i.uyari24 && i.teslim - Date.now() < 24 * 3600e3 && i.teslim > Date.now()) {
        i.uyari24 = true; degisti = true;
        await bildirimEkle(env, "Teslime 24 saatten az kaldı ⏳", `${i.musteri}: ${i.aciklama}`, "");
      }
    }
    if (degisti) await kvYaz(env, "isler", isler);
  } catch (e) {}
  // Sessiz musteri: aktif isi olan musteriden 3 gundur ses yoksa (gunde bir, 11:00)
  if (sa === "11" && (await kvOku(env, "son_sessiz_kontrol", "")) !== z.tarih) {
    await kvYaz(env, "son_sessiz_kontrol", z.tarih);
    try {
      const kartlar = await kvOku(env, "musteri_kartlari", {});
      for (const ad of Object.keys(kartlar)) {
        const t = await kvOku(env, "son_temas_" + ad, 0);
        if (t && Date.now() - t > 3 * 864e5 && Date.now() - t < 10 * 864e5)
          await bildirimEkle(env, kartlar[ad].ad + " 3 gündür sessiz", "Nazik bir takip mesajı ister misin? Jarvis'e '" + kartlar[ad].ad + " için takip mesajı yaz' de.", "");
      }
    } catch (e) {}
  }
}

// ---------------- Arac secimi: her mesaja sadece ilgili araclar gider (Groq ucretsiz limitine sigmak icin) ----------------
const ARAC_GRUPLARI = [
  [/./, ["kurgula", "kurgu_durumu", "hatirlat", "not_al", "arastir", "neler_yaptin", "sistem_durumu", "kendini_gelistir"]],
  [/kod|ekran|arayüz|arayuz|tasarım|tasarim|renk|buton|panel|değiştir|degistir|ekle|özellik|ozellik|claude/i, ["claude_kod", "claude_kod_durumu"]],
  [/kurgu|video|render|kapak|thumbnail|revize|revizyon|degistir|değiştir|stil|toplu|otomatik|drive|dosya|klasör|klasor|portf/i, ["kurgular", "revize", "toplu_kurgula", "oto_kurgu", "stil_cikar", "drive", "portfolyo_ekle", "parcala", "parca_durumu"]],
  [/parça|parca|uzun video|podcast|yayından|yayindan|böl|bol/i, ["parcala", "parca_durumu"]],
  [/ilan|iş|is bul|başvur|basvur|müşteri|musteri|reddit|teklif|freelance|fiverr|upwork/i, ["ilanlar", "ilan_ara", "ilan_detay", "basvuru_yaz", "musteri_bul"]],
  [/gkey|discord|mesaj|yaz(dı|di)|cevap|gönder|gonder|dm/i, ["dm_gonder", "discord_oku", "discord_yaz", "fikir_uret", "mail_kontrol", "musteri_kart"]],
  [/müşteri|musteri|kart|fiyat|teklif|kaç para|kac para|ücret|ucret|price|fatura|invoice/i, ["musteri_kart", "teklif_hesapla", "fatura"]],
  [/harca|aldım|aldim|ödedim|odedim|masraf|tl\b|lira|market|fatura/i, ["harcama"]],
  [/hedef|hafta/i, ["haftalik_hedef", "musteri_raporu"]],
  [/youtube|video bul|videosu|kanalı|kanali|ara\b|bul\b|stil/i, ["youtube_ara", "stil_cikar", "telefonda_ac"]],
  [/aç\b|ac\b|açar|acar|telefonda|telefondan|uygulama|git\b|gir\b/i, ["telefonda_ac", "youtube_ara", "laptop_komut"]],
  [/laptop|bilgisayar|pc\b|masaüstü|masaustu/i, ["laptop_komut", "youtube_ara"]],
  [/abone|izlenme|kanal|istatistik|youtube/i, ["kanal_istatistik"]],
  [/mola|su iç|su ic|göz|goz|esne/i, ["mola"]],
  [/rapor/i, ["musteri_raporu", "haftalik_rapor"]],
  [/dolar|kur|euro|döviz|doviz/i, ["dolar_alarm"]],
  [/doğum|dogum|yıldönüm|yildonum|önemli tarih|onemli tarih|bayram/i, ["onemli_tarih"]],
  [/uyku|uyudum|uyuyor|yorgun|kaç saat|kac saat/i, ["uyku_ozeti"]],
  [/hatırla|hatirla|unut|biliyor musun|hakkımda|hakkimda|hafıza|hafiza/i, ["hafiza"]],
  [/fikir|valorant|yama|meta|lineup|twitch|klip|yayın|yayin|kick/i, ["fikir_uret", "klip_bul"]],
  [/mail|posta|gmail|takvim|randevu|toplantı|toplanti|etkinlik/i, ["mail_kontrol", "takvime_ekle"]],
  [/para|kazan|gelir|ödeme|odeme|ücret|ucret|hedef|\$|dolar|tl\b|iş ekle|teslim/i, ["is_ekle", "is_guncelle", "gelir_ozeti", "haftalik_rapor"]],
  [/hava|yağmur|yagmur|deprem|yakın|yakin|açık|acik|kafe|market|eczane|konum|nerede|plan|bugün|bugun|yarın|yarin|izin|boş|bos|saat/i, ["hava", "depremler", "yakin_yerler", "konum_ayarla", "gunluk_plan", "izin_gunu"]],
  [/alarm|uyandır|uyandir|sabah|mesai|bildirim|yapacak|temizle|rapor|hafta/i, ["alarm", "mesai_modu", "yapacaklari_temizle", "haftalik_rapor"]],
];
function aracSec(metin) {
  const ad = new Set();
  for (const [re, l] of ARAC_GRUPLARI) if (re.test(metin)) l.forEach((x) => ad.add(x));
  return ARACLAR.filter((t) => ad.has(t.function.name));
}

// ---------------- Ajan: gorevi araclarla adim adim yapar ----------------
const ARACLAR = [
  ["kurgula", "Bir videoyu Remotion ile kurgular (bulutta, 5-10 dk). Video linki yoksa Drive'daki dosya adini ver ya da 'son' yaz.",
    { format: "shorts veya uzun", link: "video linki (opsiyonel)", dosya: "Drive'daki video adi veya 'son' (opsiyonel)", malzeme: "malzeme klasoru linki (opsiyonel)", musteri: "musteri stil adi (opsiyonel)", istek: "Eren'in ozel kurgu istekleri (opsiyonel)" }],
  ["musteri_kart", "Musteri kartini gosterir/gunceller (fiyat, stil, kanal, iletisim, odeme yontemi, not); toplam is, odenen ve bekleyen para, son mesaj. Ad verilmezse tum musteriler.", { ad: "musteri adi", fiyat: "ornek '12$/short' (opsiyonel)", stil: "opsiyonel", kanal: "YouTube kanali (opsiyonel)", iletisim: "Discord vb. (opsiyonel)", odeme: "Payoneer vb. (opsiyonel)", not: "eklenecek not (opsiyonel)" }],
  ["teklif_hesapla", "Video kurgu fiyat teklifi hesaplar ve musteriye Ingilizce + Turkce teklif mesaji hazirlar.", { adet: "video sayisi", sure_sn: "her videonun saniyesi", tur: "shorts veya uzun", acil: "acil mi (evet/hayir)", ekstra: "thumbnail vb. (opsiyonel)" }],
  ["fatura", "Musteriye Ingilizce fatura (invoice) sayfasi olusturur; odenmemis isleri kalem yapar ya da tek kalem verilir. Link PDF olarak da kaydedilebilir.", { musteri: "musteri adi", kalem: "tek kalem aciklamasi (opsiyonel)", tutar: "USD (opsiyonel)", odeme: "Payoneer vb. (opsiyonel)" }],
  ["kanal_istatistik", "Bir YouTube kanalinin (varsayilan GKey) abone/izlenme istatistigini ve son videolarin izlenmelerini getirir, son bakistan beri farki soyler.", { kanal: "@handle ya da kanal linki (opsiyonel)" }],
  ["musteri_raporu", "Musteriye bu haftaki isleri anlatan kisa Ingilizce + Turkce rapor mesaji taslagi hazirlar (gondermez).", { musteri: "musteri adi (varsayilan GKey)" }],
  ["mola", "Mesai disinda su/goz/esneme mola hatirlaticisini acar ya da kapatir.", { acik: "true veya false" }],
  ["youtube_ara", "YouTube'da video arar ve linklerini verir (ornek: 'Baykalem son videosu', 'valorant lineup shorts'). Sonra stil_cikar ya da telefonda_ac ile kullanilabilir.", { sorgu: "arama", tur: "shorts ya da bos", adet: "kac sonuc" }],
  ["telefonda_ac", "Bir linki/uygulamayi Eren'in telefonunda acar (YouTube linki YouTube uygulamasinda acilir). Ornek: youtube, discord, drive, instagram, tiktok, spotify, whatsapp ya da tam link.", { hedef: "link ya da uygulama adi" }],
  ["laptop_komut", "Eren'in laptopunda komut calistirir (laptop programi acikken): tur=ac (link/site acar), tur=uygulama (discord, chrome, spotify, valorant, steam, explorer, premiere, capcut, obs...), tur=indir (videoyu yt-dlp ile Indirilenler'e indirir), tur=yaz (panoya metin kopyalar).", { tur: "ac, uygulama, indir veya yaz", deger: "link, uygulama adi ya da metin" }],
  ["harcama", "Harcama kaydeder (TL) ve bu ayin harcama ozetini verir. Miktar verilmezse sadece ozet.", { miktar: "TL (opsiyonel)", kategori: "yemek, ulasim, fatura, eglence vb.", aciklama: "opsiyonel" }],
  ["haftalik_hedef", "Haftalik hedef koyar ya da ilerlemesini soyler (bu hafta biten kurgu/teslim edilen is).", { sayi: "hedef sayi (opsiyonel)", ne: "video, is vb." }],
  ["dolar_alarm", "Dolar/TL kurunu soyler; kur verilirse o seviye gecilince bildirim kurar.", { kur: "TL seviyesi (opsiyonel)" }],
  ["onemli_tarih", "Dogum gunu gibi her yil tekrar eden onemli tarih ekler/listeler; bir gun once ve o gun hatirlatir.", { ad: "ornek 'Annemin dogum gunu'", tarih: "GG.AA" }],
  ["uyku_ozeti", "Son gecelerin uyku saatlerini ve ortalamasini soyler.", {}],
  ["hafiza", "Jarvis'in Eren hakkinda bildiklerini listeler ya da bir seyi unutturur.", { unut: "unutulacak bilginin bir kelimesi (opsiyonel)" }],
  ["mesai_modu", "Mesai modunu ayarlar: mesaide onemsiz bildirimler bekletilip mesai bitince ozet gelir. Kapatmak icin acik=false.", { acik: "true veya false" }],
  ["sistem_durumu", "Jarvis'in butun servislerini (beyin, ses kotasi, Drive, Discord, GitHub) test eder, neyin bozuk/eksik oldugunu ekranda gosterir.", {}],
  ["kurgular", "Son 6 kurguyu kapaklariyla ekranda listeler (hangisi hazir, hangisi isleniyor).", {}],
  ["kurgu_durumu", "Son kurgunun durumunu, video+kapak linkini, kalite puanini, baslik onerisini ve musteriye teslim mesaji taslagini (EN+TR) verir.", {}],
  ["stil_cikar", "Ornek videolardan kurgu stili dosyasi cikarir. Link verilmezse Drive Jarvis/ornek klasorunu kullanir.",
    { format: "shorts veya uzun", ad: "stil adi, ornek musteri adi (opsiyonel)", linkler: "bosluklu link listesi (opsiyonel)" }],
  ["ilanlar", "Reddit'te bulunmus uygun video editor ilanlarini listeler.", {}],
  ["ilan_ara", "Hemen yeni ilan aramasi baslatir.", {}],
  ["ilan_detay", "Bir ilanin tam olarak ne istedigini, istenen kurgu stilini ve ornek videolarin analizini anlatir.", { numara: "ilan numarasi" }],
  ["basvuru_yaz", "Listelenen bir ilana Ingilizce basvuru + Turkce ceviri yazar.", { numara: "ilan numarasi" }],
  ["hatirlat", "Belirli bir zamanda hatirlatma kurar.", { istek: "zaman ve konu, ornek: yarin 11de GKey teslimi" }],
  ["not_al", "Yapacaklar listesine not ekler.", { metin: "not" }],
  ["yapacaklari_temizle", "Yapacaklar listesini temizler.", {}],
  ["alarm", "Sabah alarmini acar/kapatir/atlatir.", { istek: "ornek: yarin alarm yapma, alarmi ac" }],
  ["drive", "Drive'daki Jarvis klasorlerine bakar, dosya arar veya klasor acar.", { alt: "listele, ara veya klasor_ac", klasor: "ham, ornek, malzeme veya bitti", ad: "aranacak dosya ya da acilacak klasor adi" }],
  ["arastir", "Internette guncel arastirma yapar (Google). Haber, trend, fiyat, yontem, Valorant/video stili, her turlu guncel bilgi icin.", { soru: "arastirilacak soru" }],
  ["depremler", "Turkiye'deki son depremleri listeler ve ekranda deprem panelini acar.", { min_buyukluk: "en kucuk buyukluk, varsayilan 2.5" }],
  ["yakin_yerler", "Eren'in konumuna yakin yerleri ve su an acik olup olmadiklarini bulur, ekranda listeler. turler: kafe, restoran, fastfood, eczane, market, benzin, hastane, bar, plaj, park, spor, manzara, muze, sinema, nargile.",
    { tur: "yer turu", km: "arama yaricapi km (opsiyonel)", sadece_acik: "evet ise sadece acik olanlar" }],
  ["hava", "Eren'in konumunun hava durumunu verir ve hava panelini gosterir.", {}],
  ["konum_ayarla", "Eren'in yasadigi/bulundugu yeri ayarlar (ornek: Manavgat).", { yer: "sehir veya ilce" }],
  ["gunluk_plan", "Bugunun planini cikarir (vardiya, hatirlatmalar, takvim, yapilacaklar) ve ekranda gosterir.", {}],
  ["izin_gunu", "Bir gunu izin gunu olarak kaydeder (o gun vardiya planlanmaz).", { gun: "bugun, yarin veya obur gun" }],
  ["neler_yaptin", "Jarvis'in son 24 saatte kendi basina yaptiklarini (sistem gunlugu) getirir.", {}],
  ["dm_gonder", "Eren 'gonder' dediginde, GKey gibi birine Discord OZEL MESAJ icin: mesaji ekranda KOPYALA butonuyla verir ve Discord sohbetini acar (Eren kendisi yapistirip gonderir). Ayrica bir kez verilen DM linkini kaydeder. Ingilizce mesajin Turkcesini Eren'e onceden goster.", { kisi: "kime (varsayilan gkey)", mesaj: "gonderilecek nihai metin", dm_link: "discord.com/channels/@me/... linki (opsiyonel)" }],
  ["discord_oku", "Eren'in bagli Discord kanallarindaki (GKey sunucusu vb.) son mesajlari okur.", { kanal: "kanal id (opsiyonel)", adet: "kac mesaj (opsiyonel)" }],
  ["discord_yaz", "Discord kanalina mesaj gonderir. SADECE Eren taslagi gorup acikca 'gonder' dediyse kullan.", { mesaj: "gonderilecek metin", kanal: "kanal id (opsiyonel)" }],
  ["revize", "Bitmis bir kurguyu (varsayilan son kurgu) Eren'in ya da musterinin revizyon istegine gore degistirip yeniden render alir. Ornek: 'yaziyi buyut', 'ilk 2 saniyeyi at', 'hook BIND MOLLY olsun'.", { istek: "ne degisecek", kurgu: "kurgu numarasi (opsiyonel)", format: "shorts veya uzun (opsiyonel)" }],
  ["parcala", "Uzun bir videodan (podcast, yayin, YouTube videosu) en iyi anlari secip 1-6 ayri Short kurgular.", { link: "video linki (opsiyonel)", dosya: "Drive'daki video adi (opsiyonel)", adet: "kac Short (varsayilan 3)", stil: "stil adi (opsiyonel)", istek: "ozel istek (opsiyonel)" }],
  ["parca_durumu", "Son parcalama isinin (uzun videodan Shorts) durumunu ve Short linklerini verir.", {}],
  ["toplu_kurgula", "Drive'daki Jarvis/ham klasorunde henuz kurgulanmamis butun videolari (en fazla 8) ayni anda kurguya yollar.", { stil: "musteri/stil adi, ornek gkey", format: "shorts veya uzun", adet: "en fazla kac video", istek: "ozel istekler (opsiyonel)" }],
  ["oto_kurgu", "Otomatik kurgu modunu acar/kapatir: acikken Drive/ham'a dusen her yeni video saatte bir kendiliginden kurgulanir.", { acik: "true veya false", stil: "stil adi, ornek gkey", format: "shorts veya uzun" }],
  ["fikir_uret", "Guncel Valorant yamasi ve metasina gore GKey icin lineup Shorts video fikirleri + GKey'e atilacak oneri mesaji (EN+TR) hazirlar.", { konu: "oyun/konu (opsiyonel, varsayilan Valorant)" }],
  ["klip_bul", "Twitch'te bir yayincinin (ya da yayinci verilmezse Valorant kategorisinin) son gunlerdeki en cok izlenen kliplerini bulur. Shorts klipcilik icin.", { yayinci: "twitch kullanici adi (opsiyonel)", oyun: "oyun adi (opsiyonel, varsayilan VALORANT)", gun: "kac gun geriye (varsayilan 2)" }],
  ["musteri_bul", "Internetten Eren'e uygun potansiyel musteri YouTube kanallari bulur ve her birine ozel Ingilizce+Turkce tanitim mesaji taslagi yazar (gondermez).", { nis: "alan, ornek 'Valorant', 'CS2', 'psikoloji' (opsiyonel)" }],
  ["haftalik_rapor", "Son 7 gunun raporunu cikarir (isler, kazanc, hedef, ilanlar, Jarvis'in yaptiklari, oneriler).", {}],
  ["mail_kontrol", "Eren'in Gmail'indeki yeni/onemli mailleri getirir. Belirli birini aramak icin sorgu ver (ornek: from:gkey).", { sorgu: "Gmail arama sorgusu (opsiyonel)" }],
  ["takvime_ekle", "Google Takvim'e etkinlik ekler.", { istek: "etkinlik ve zamani, ornek: cuma 15te GKey toplantisi" }],
  ["is_ekle", "Yeni bir musteri isini kaydeder (ucret ve teslim tarihiyle). Teslimden 2 saat once hatirlatir.",
    { musteri: "musteri adi, ornek GKey", aciklama: "is, ornek 3 Valorant Shorts", ucret: "ucret sayisi", birim: "USD veya TL", teslim: "teslim zamani, ornek yarin 18:00" }],
  ["is_guncelle", "Bir isin durumunu degistirir: teslim edildi, odendi veya iptal.", { is: "is no, musteri adi ya da aciklamadan bir kelime", durum: "teslim, odendi veya iptal", ucret: "odenen tutar (opsiyonel)" }],
  ["gelir_ozeti", "Bu ayki kazanci, aylik hedefe (800 dolar) ne kadar kaldigini, bekleyen odemeleri ve devam eden isleri verir; ekranda gosterir.", {}],
  ["portfolyo_ekle", "Eren'in herkese acik portfolyo sayfasina (basvurularda kullanilir) bir video ekler.", { baslik: "video basligi", link: "YouTube/TikTok linki ya da son kurgu icin 'son'", aciklama: "kisa aciklama (Ingilizce)", tur: "Shorts, Gaming, Long-form vb." }],
  ["claude_kod", "Jarvis'in kodunda/arayuzunde bir degisikligi Claude Code'a (en iyi kodlayici, bulutta) yaptirir. Eren onaylamadan uygulanmaz. Buyuk ya da onemli degisikliklerde kendini_gelistir yerine bunu kullan.", { istek: "Eren'in istedigi degisiklik, ayrintili" }],
  ["claude_kod_durumu", "Claude Code'a verilen isin durumunu ve ozetini getirir.", {}],
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
      let malzeme = s(a.malzeme);
      if (!malzeme && env.DRIVE_SCRIPT_URL) malzeme = "drive:malzeme/folders/";
      return await kurgula(env, ["kurgula", s(a.format) === "uzun" ? "uzun" : "shorts", link, malzeme, a.musteri ? "müşteri " + s(a.musteri) : "", s(a.istek)].join(" "));
    }
    if (ad === "musteri_kart") return await musteriKart(env, a);
    if (ad === "teklif_hesapla") return teklifHesapla(a);
    if (ad === "fatura") return await faturaOlustur(env, a);
    if (ad === "kanal_istatistik") return await kanalIstatistik(env, a);
    if (ad === "musteri_raporu") return await musteriRaporu(env, a);
    if (ad === "mola") { const ac = !/false|kapat|hayir|0/i.test(String(a.acik)); await kvYaz(env, "mola_acik", ac); return ac ? "Mola hatırlatıcısı açık (mesai dışında 10, 12 ve 23'te)." : "Mola hatırlatıcısı kapalı."; }
    if (ad === "youtube_ara") return await youtubeAra(env, a);
    if (ad === "laptop_komut") return await laptopKomut(env, a);
    if (ad === "telefonda_ac") {
      const UYG = { youtube: "https://www.youtube.com", discord: "https://discord.com/app", drive: "https://drive.google.com", instagram: "https://www.instagram.com", tiktok: "https://www.tiktok.com",
        spotify: "https://open.spotify.com", whatsapp: "https://wa.me", gmail: "https://mail.google.com", takvim: "https://calendar.google.com", twitch: "https://www.twitch.tv", reddit: "https://www.reddit.com", harita: "https://maps.google.com" };
      let h = String(a.hedef || "").trim();
      if (!/^https?:/.test(h)) {
        const k = Object.keys(UYG).find((x) => h.toLowerCase().includes(x));
        if (k) h = UYG[k];
        else if (/^\d$/.test(h)) { const y = await kvOku(env, "son_youtube", []); if (y[+h - 1]) h = "https://youtu.be/" + y[+h - 1].id; }
      }
      if (!/^https?:/.test(h)) return "HATA: acilacak link/uygulama anlasilmadi.";
      return { metin: "Telefonda aciyorum: " + h, link: h, ekran: { ac: h } };
    }
    if (ad === "claude_kod") return env.CLAUDE_KOD === "kapali" ? "Claude Code kapali." : await claudeKod(env, a.istek);
    if (ad === "claude_kod_durumu") return await claudeKodDurumu(env);
    if (ad === "harcama") return await harcama(env, a);
    if (ad === "haftalik_hedef") return await haftalikHedef(env, a);
    if (ad === "dolar_alarm") return await dolarAlarm(env, a);
    if (ad === "onemli_tarih") return await onemliTarih(env, a);
    if (ad === "uyku_ozeti") return await uykuOzeti(env);
    if (ad === "hafiza") return await hafiza(env, a);
    if (ad === "mesai_modu") { const kapali = /false|kapat|hayir|0/i.test(String(a.acik)); await kvYaz(env, "mesai_kapali", kapali); return kapali ? "Mesai modu kapalı: bütün bildirimler hemen gelecek." : "Mesai modu açık: 13:00-22:00 arası sadece önemli bildirimler (GKey, ödeme, kurgu, hata) gelir, gerisi mesai bitince özet olarak gelir."; }
    if (ad === "sistem_durumu") return await saglikKontrol(env);
    if (ad === "kurgular") return await kurguListesi(env, env.__kok);
    if (ad === "kurgu_durumu") { const d = await kurguDurumu(env, env.__kok); return typeof d === "string" ? d : { metin: d.cevap, link: d.link, linkler: d.linkler }; }
    if (ad === "stil_cikar") {
      let ls = s(a.linkler).split(/\s+/).filter(Boolean);
      if (!ls.length && env.DRIVE_SCRIPT_URL) ls = (await driveListe(env, "ornek").catch(() => [])).filter((f) => (f.mimeType || "").startsWith("video")).slice(0, 4).map((f) => "drive:" + f.id);
      if (!ls.length) return "HATA: ornek video yok. Eren'den link iste ya da Drive Jarvis/ornek klasorune koymasini soyle.";
      return await stilCikar(env, ["stil çıkar", s(a.format) === "uzun" ? "uzun" : "shorts", a.ad ? "ad " + s(a.ad) : "", ...ls].join(" "));
    }
    if (ad === "ilanlar") return await ilanlar(env);
    if (ad === "ilan_ara") return await ilanAra(env);
    if (ad === "ilan_detay") return await ilanDetay(env, "ilan " + (s(a.numara) || "1"));
    if (ad === "basvuru_yaz") { const b = await basvuruYaz(env, "başvuru yaz " + (s(a.numara) || "1")); return typeof b === "string" ? b : { metin: b.cevap, link: b.link }; }
    if (ad === "hatirlat") return await hatirlatmaEkle(env, s(a.istek));
    if (ad === "not_al") return await notAl(env, "not al: " + s(a.metin));
    if (ad === "yapacaklari_temizle") { await kvYaz(env, "yapacaklar", []); return "Liste temizlendi."; }
    if (ad === "alarm") return await alarmAyari(env, s(a.istek) + " alarm");
    if (ad === "drive") return await driveIslem(env, a);
    if (ad === "kendini_gelistir") { const r = await kodIstegi(env, s(a.istek)); await gunlukEkle(env, "Kendime kod önerisi hazırladım: " + s(a.istek).slice(0, 80)); return r; }
    if (ad === "arastir") { const r = await arastir(env, s(a.soru)); await gunlukEkle(env, "Araştırdım: " + s(a.soru).slice(0, 80)); return r; }
    if (ad === "depremler") return await depremler(env, a);
    if (ad === "yakin_yerler") return await yakinYerler(env, a);
    if (ad === "hava") { const v = await havaAl(env); return { metin: `${v.yer}: su an ${v.simdi}. ` + v.gunler.map((g) => `${g.tarih}: ${g.durum} ${g.min}-${g.max}°C, yagmur %${g.yagmur}`).join("; "), ekran: { panel: "hava" } }; }
    if (ad === "konum_ayarla") return await konumAyarla(env, s(a.yer));
    if (ad === "gunluk_plan") return await gunlukPlan(env);
    if (ad === "izin_gunu") return await izinAyarla(env, s(a.gun));
    if (ad === "neler_yaptin") return await nelerYaptin(env);
    if (ad === "mail_kontrol") return await mailKontrol(env, a);
    if (ad === "revize") return await revize(env, a);
    if (ad === "parcala") return await parcala(env, a);
    if (ad === "parca_durumu") return await parcaDurumu(env, env.__kok);
    if (ad === "toplu_kurgula") return await topluKurgula(env, a);
    if (ad === "oto_kurgu") {
      const acik = !/false|kapat|hayir|0/i.test(String(a.acik));
      if (acik && env.DRIVE_SCRIPT_URL) { // acildigi anda mevcut videolari "yapildi" say, sadece yenileri kurgula
        try { const l = await driveListe(env, "ham"); const y = await kvOku(env, "kurgulanan", []); await kvYaz(env, "kurgulanan", y.concat(l.map((f) => f.id)).slice(-500)); } catch (e) {}
      }
      await kvYaz(env, "oto_kurgu", { acik, stil: a.stil || "gkey", format: a.format || "shorts" });
      return acik ? `Otomatik kurgu açık (${a.stil || "gkey"} stili). Drive/ham'a attığın her yeni video saatte bir kendiliğinden kurgulanacak.` : "Otomatik kurgu kapatıldı.";
    }
    if (ad === "fikir_uret") return await fikirUret(env, a);
    if (ad === "klip_bul") return await klipBul(env, a);
    if (ad === "musteri_bul") return await musteriBul(env, a);
    if (ad === "haftalik_rapor") return await haftalikRapor(env);
    if (ad === "dm_gonder") return await dmHazirla(env, a);
    if (ad === "discord_oku") return await discordOku(env, a);
    if (ad === "discord_yaz") return await discordYaz(env, a);
    if (ad === "takvime_ekle") return await takvimEkle(env, s(a.istek));
    if (ad === "is_ekle") return await isEkle(env, a);
    if (ad === "portfolyo_ekle") return await portfolyoEkle(env, a);
    if (ad === "is_guncelle") return await isGuncelle(env, a);
    if (ad === "gelir_ozeti") return await gelirOzeti(env);
    return "HATA: bilinmeyen arac";
  } catch (e) {
    return "HATA: " + e.message;
  }
}

async function ajanCalistir(env, sistem, son) {
  // Gemini (Turkcesi daha iyi, ucretsiz gunluk kota) -> Groq (hizli) -> Cerebras
  const saglayicilar = [];
  if (env.GEMINI_API_KEY && env.AJAN_BEYIN !== "groq" && Date.now() > (await kvOku(env, "gemini_ajan_kapali", 0)))
    saglayicilar.push({ ad: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", anahtar: env.GEMINI_API_KEY, model: env.GEMINI_AJAN_MODEL || "gemini-flash-latest" });
  if (env.GROQ_API_KEY) saglayicilar.push({ url: "https://api.groq.com/openai/v1/chat/completions", anahtar: env.GROQ_API_KEY, model: env.AJAN_MODEL || env.GROQ_MODEL || "openai/gpt-oss-120b" });
  if (env.CEREBRAS_API_KEY) saglayicilar.push({ url: "https://api.cerebras.ai/v1/chat/completions", anahtar: env.CEREBRAS_API_KEY, model: env.CEREBRAS_MODEL || "gpt-oss-120b" });
  let sonHata;
  for (const sg of saglayicilar) {
    try { const c = await ajanDongu(env, sistem, son, sg); c.beyin = sg.ad || "groq"; return c; }
    catch (e) {
      sonHata = e;
      if (sg.ad === "gemini") {
        const m = String(e.message);
        if (/429/.test(m)) await kvYaz(env, "gemini_ajan_kapali", Date.now() + 60 * 60e3); // kota doldu: 1 saat Groq
        else if (/40\d/.test(m)) { await kvYaz(env, "gemini_ajan_kapali", Date.now() + 6 * 3600e3); await gunlukEkle(env, "Gemini beyin hata verdi (" + m.slice(0, 80) + "), 6 saat Groq kullanıyorum"); }
      }
    }
  }
  throw sonHata || new Error("Ajan icin beyin yok");
}

async function ajanDongu(env, sistem, son, sg) {
  const model = sg.model;
  const ajanSistem = sistem +
    "\n\nSEN BIR AJANSIN: Eren bir is istediginde araclarini kullanarak yap; gerekirse birden fazla araci sirayla kullan. " +
    "Bir aracin sonucu HATA ise sebebini Eren'e kisaca ve cozumuyle soyle. Istenen isi yapacak aracin yoksa: bunu nasil yapabilecegini " +
    "1-2 cumleyle anlat ve kendini_gelistir araciyla o yetenegi ekleyen degisikligi hazirla (Eren onaylayinca eklenir). " +
    "Arac kullanmadan bir isi yaptim deme. Normal sohbet ve sorularda arac kullanma, dogrudan cevap ver. " +
    "Arac sonuclarini kopyalama; kendi cumlelerinle, o anki konusmaya uygun ve dogal anlat. Hep ayni kaliplari tekrarlama, robot gibi konusma. " +
    "Konusmanin akisini hatirla, onceki mesajlara atif yap, gerektiginde soru sor ve fikrini soyle. Eren'e yardimci olacak bir sey fark edersen kendiliginden oner.";
  const mesajlar = [{ role: "system", content: ajanSistem }, ...son];
  const secili = aracSec(son.filter((x) => x.role === "user").slice(-2).map((x) => String(x.content)).join(" "));
  let link = null, linkler = null, ekran = null;
  for (let adim = 0; adim < 5; adim++) {
    const r = await fetch(sg.url, {
      method: "POST",
      headers: { Authorization: "Bearer " + sg.anahtar, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: mesajlar, tools: secili, tool_choice: "auto", max_tokens: 900, temperature: 0.6,
        ...(model.includes("gpt-oss") ? { reasoning_effort: env.AJAN_DUSUNME || "medium" } : sg.ad === "gemini" ? { reasoning_effort: env.GEMINI_DUSUNME || "low" } : {}) }),
    });
    if (!r.ok) throw new Error("Ajan " + r.status + " " + (await r.text().catch(() => "")).slice(0, 120));
    const m = (await r.json()).choices[0].message;
    if (!m.tool_calls || !m.tool_calls.length) return { cevap: m.content || "", link, linkler, ekran };
    mesajlar.push({ role: "assistant", content: m.content || "", tool_calls: m.tool_calls });
    for (const c of m.tool_calls) {
      let a = {};
      try { a = JSON.parse(c.function.arguments || "{}"); } catch (e) {}
      const sonuc = await aracCalistir(env, c.function.name, a);
      const metin = typeof sonuc === "string" ? sonuc : sonuc.metin;
      if (sonuc && sonuc.link) link = sonuc.link;
      if (sonuc && sonuc.linkler) linkler = sonuc.linkler;
      if (sonuc && sonuc.ekran) ekran = sonuc.ekran;
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
    "Arac kullanmadan bir isi yaptim deme. Normal sohbet ve sorularda arac kullanma, dogrudan cevap ver. " +
    "Arac sonuclarini kopyalama; kendi cumlelerinle, o anki konusmaya uygun ve dogal anlat. Hep ayni kaliplari tekrarlama, robot gibi konusma. " +
    "Konusmanin akisini hatirla, onceki mesajlara atif yap, gerektiginde soru sor ve fikrini soyle. Eren'e yardimci olacak bir sey fark edersen kendiliginden oner.";
  const mesajlar = son.map((m) => ({ role: m.role, content: m.content }));
  let link = null, linkler = null, ekran = null;
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
    if (!kullanimlar.length) return { cevap: yazi, link, linkler, ekran };
    mesajlar.push({ role: "assistant", content: j.content });
    const sonuclar = [];
    for (const u of kullanimlar) {
      const sonuc = await aracCalistir(env, u.name, u.input || {});
      const metin = typeof sonuc === "string" ? sonuc : sonuc.metin;
      if (sonuc && sonuc.link) link = sonuc.link;
      if (sonuc && sonuc.linkler) linkler = sonuc.linkler;
      if (sonuc && sonuc.ekran) ekran = sonuc.ekran;
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
  const anlik = await baglam(env).catch(() => "");
  const bekleyenKod = await kvOku(env, "bekleyen_kod", null);
  const sistem = SISTEM_TEMEL + (notlar.length ? "\n\nEren hakkinda bildiklerin:\n- " + notlar.join("\n- ") : "") +
    anlik +
    (plan && /yapılacak|yapilacak|plan|özellik|ozellik|ne ekledin|neler ekledin|neler var|ne yapabilir|yeni ne|liste|kurulum|anahtar|key/i.test(metin + " " + (gecmis.slice(-2).map((g) => g.content).join(" ")))
      ? "\n\nORTAK YAPILACAKLAR LISTENIZ (Eren sorarsa kisaca anlat):\n" + plan
      : "\n\n(Ortak yapilacaklar/ozellik listesi Eren 'neler ekledin, ne yapabilirsin' gibi sorarsa gosterilir.)") +
    (bekleyenKod ? "\n\nONAY BEKLEYEN KOD DEGISIKLIGIN: " + bekleyenKod.ozet + (bekleyenKod.neden ? " (" + bekleyenKod.neden + ")" : "") +
      ". Uygun bir anda Eren'e bundan bahset ve 'onayla' ya da 'iptal' demesini iste." : "");
  let cevap, beyin, duydum = metin, ajanLink = null, ajanLinkler = null, ajanEkran = null;

  if (sesB64 && env.GROQ_API_KEY) {
    try {
      metin = await groqDinle(env, sesB64);
      duydum = metin;
      if (!metin) return { duydum: "", cevap: "", sessiz: true, beyin: "sistem" };
      if (metin === "?") return { duydum: "", cevap: "Tam anlayamadım, tekrar söyler misin?", beyin: "sistem" };
      if (UYKU.test(metin)) { await uykuKaydet(env, "yat").catch(() => {}); } if (UYKU.test(metin)) return { duydum: metin, cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", bitis: true, uyku: true, beyin: "sistem" };
      if (BITIS.test(metin)) return { duydum: metin, cevap: "Görüşürüz Eren.", bitis: true, beyin: "sistem" };
      const kv = komut(metin);
      if ((kv && ["onayla", "iptal", "geri_al", "puan_iyi", "puan_kotu"].includes(kv)) || (!env.GROQ_API_KEY && !env.ANTHROPIC_API_KEY && (kv || (metin.length < 600 && (await niyetBul(env, metin)))))) return { duydum: metin, komut: true };
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
    else if (beyin === "gemini" && (env.GROQ_API_KEY || env.CEREBRAS_API_KEY)) beyin = "groq";
    const son = gecmis.slice(-30);
    while (son.length && son[0].role !== "user") son.shift();
    try {
      if (beyin === "openrouter") cevap = await sorOpenRouter(env, sistem, son);
      else if (beyin === "claude") cevap = await sorClaude(env, sistem, son);
      else if (beyin === "claude-ajan") {
        try { const a = await ajanClaude(env, sistem, son); cevap = a.cevap; ajanLink = a.link; ajanLinkler = a.linkler; ajanEkran = a.ekran; }
        catch (e) {
          beyin = "groq";
          const a = await ajanCalistir(env, sistem, son); cevap = a.cevap; if (a.beyin) beyin = a.beyin; ajanLink = a.link; ajanLinkler = a.linkler; ajanEkran = a.ekran;
        }
      }
      else if (beyin === "groq") {
        try { const a = await ajanCalistir(env, sistem, son); cevap = a.cevap; if (a.beyin) beyin = a.beyin; ajanLink = a.link; ajanLinkler = a.linkler; ajanEkran = a.ekran; }
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
  return { duydum, cevap, beyin, link: ajanLink, linkler: ajanLinkler, ekran: ajanEkran };
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron && event.cron !== "0 0 * * *") {
      ctx.waitUntil(saatlikIs(env).catch((e) => gunlukEkle(env, "Saatlik iş hatası: " + e.message)));
      return;
    }
    ctx.waitUntil((async () => {
      try { await yedekAl(env); } catch (e) { await gunlukEkle(env, "Yedek alınamadı: " + e.message); }
      try { await geceOgren(env); } catch (e) {}
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

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(SAYFA, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    env.__kok = url.origin;
    if (request.method === "POST" && url.pathname === "/yukleme-baslat") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) return new Response("Yetkisiz", { status: 401 });
      try {
        const { ad = "video.mp4", boyut = 0, tur = "video/mp4", klasor = "ham" } = await request.json();
        const b = await driveBilgi(env);
        if (!b) return Response.json({ hata: "Drive köprüsü kurulmadı" }, { status: 400 });
        const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
          method: "POST",
          headers: { Authorization: "Bearer " + b.token, "content-type": "application/json; charset=UTF-8", "X-Upload-Content-Type": tur, ...(boyut ? { "X-Upload-Content-Length": String(boyut) } : {}) },
          body: JSON.stringify({ name: ad, parents: [b.klasorler[klasor] || b.klasorler.ham] }),
        });
        const yer = r.headers.get("location");
        if (!yer) return Response.json({ hata: "Drive yükleme başlatılamadı (" + r.status + ")" }, { status: 502 });
        await gunlukEkle(env, "Telefondan Drive'a video yükleniyor: " + ad);
        return Response.json({ url: yer });
      } catch (e) {
        return Response.json({ hata: e.message }, { status: 502 });
      }
    }
    if (request.method === "POST" && url.pathname === "/telegram") {
      if (!env.TELEGRAM_BOT_TOKEN || request.headers.get("x-telegram-bot-api-secret-token") !== (await tgGizli(env))) return new Response("x", { status: 401 });
      const u = await request.json();
      ctx.waitUntil(telegramIsle(env, u, url.origin).catch((e) => tgGonder(env, "Hata: " + e.message)));
      return new Response("ok");
    }
    if (request.method === "GET" && url.pathname === "/telegram-kur") {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response("TELEGRAM_BOT_TOKEN eklenmemis.", { status: 400 });
      if (url.searchParams.get("s") !== env.APP_SECRET) return new Response("Yetkisiz", { status: 401 });
      const j = await tg(env, "setWebhook", { url: url.origin + "/telegram", secret_token: await tgGizli(env), allowed_updates: ["message", "edited_message"] });
      const bot = await tg(env, "getMe", {});
      return new Response(j.ok ? `Tamam! Telegram'da @${bot.result?.username} botunu ac ve Jarvis sifreni yaz.` : "Olmadi: " + JSON.stringify(j), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    const vm2 = url.pathname.match(/^\/varlik\/(\d+)$/);
    if (request.method === "GET" && vm2) {
      if (!env.GITHUB_TOKEN || url.searchParams.get("t") !== (await videoImza(env, "varlik-" + vm2[1]))) return new Response("Yetkisiz", { status: 401 });
      const r = await fetch(`https://api.github.com/repos/${SABLON_REPO}/releases/assets/${vm2[1]}`, {
        headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/octet-stream", "User-Agent": "jarvis-worker" }, redirect: "manual" });
      const yer = r.headers.get("location");
      return yer ? Response.redirect(yer, 302) : new Response(r.body, { status: r.status });
    }
    const fm = url.pathname.match(/^\/fatura\/([\w-]+)$/);
    if (request.method === "GET" && fm) {
      if (url.searchParams.get("t") !== (await videoImza(env, "fatura-" + fm[1]))) return new Response("Yetkisiz", { status: 401 });
      const f = (await kvOku(env, "faturalar", {}))[fm[1]];
      if (!f) return new Response("Fatura bulunamadi", { status: 404 });
      return new Response(faturaSayfa(f), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (request.method === "GET" && url.pathname === "/laptop-komut") {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) return new Response("Yetkisiz", { status: 401 });
      if (Date.now() - (await kvOku(env, "laptop_son_gorulme", 0)) > 5 * 60e3) await kvYaz(env, "laptop_son_gorulme", Date.now()); // KV yazma limiti icin seyrek
      const l = await kvOku(env, "laptop_komutlar", []);
      if (l.length) await kvYaz(env, "laptop_komutlar", []);
      return Response.json({ komutlar: l.filter((k) => Date.now() - k.zaman < 30 * 60e3) });
    }
    if (request.method === "GET" && url.pathname === "/portfolyo") {
      return new Response(await portfolyoSayfa(env), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    const vm = url.pathname.match(/^\/video\/(\d+)$/);
    if (request.method === "GET" && vm) {
      if (!env.GITHUB_TOKEN || url.searchParams.get("t") !== (await videoImza(env, vm[1]))) return new Response("Yetkisiz", { status: 401 });
      try {
        const rel = await gh(env, `/repos/${SABLON_REPO}/releases/tags/kurgu-${vm[1]}`);
        const kapakMi = url.searchParams.get("kapak") === "1";
        const asset = (rel.assets || []).find((a) => a.name.endsWith(kapakMi ? ".png" : ".mp4"));
        if (!asset) return new Response("Video bulunamadi", { status: 404 });
        const r = await fetch(asset.url, {
          headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/octet-stream", "User-Agent": "jarvis-worker" },
          redirect: "manual",
        });
        const yer = r.headers.get("location");
        if (yer) return Response.redirect(yer, 302);
        return new Response(r.body, { headers: { "content-type": kapakMi ? "image/png" : "video/mp4" } });
      } catch (e) {
        return new Response("Hata: " + e.message, { status: 502 });
      }
    }
    if (request.method === "GET" && (url.pathname === "/bildirimler" || url.pathname === "/sabah")) {
      if (!env.APP_SECRET || request.headers.get("x-secret") !== env.APP_SECRET) return new Response("Yetkisiz", { status: 401 });
      if (url.pathname === "/sabah") { await uykuKaydet(env, "kalk").catch(() => {}); return Response.json(await sabahOzeti(env)); }
      const son = parseInt(url.searchParams.get("son") || "0");
      return Response.json({ bildirimler: (await kvOku(env, "bildirimler", [])).filter((b) => b.zaman > son), simdi: Date.now() });
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
        konum: await konumAl(env),
        hedef: await gelirOzeti(env).then((g) => g.ekran.veri).catch(() => null),
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
        const m = metin.slice(0, 1500);
        // Kisa/tekrar eden cumleler (alarm, selamlar) bir kez uretilip 30 gun saklanir: ses kotasi bitmesin
        const kisa = m.length <= 140 && env.HAFIZA;
        const anahtar = kisa ? "ses2_" + (env.CARTESIA_VOICE_ID && env.SES_ONCELIK !== "eleven" ? "c" + env.CARTESIA_VOICE_ID.slice(0, 8) : "e") + "_" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(m)))).map((b) => b.toString(16).padStart(2, "0")).join("") : "";
        if (kisa) {
          const k = await env.HAFIZA.getWithMetadata(anahtar, { type: "arrayBuffer" });
          if (k && k.value) return new Response(k.value, { headers: { "content-type": (k.metadata && k.metadata.tur) || "audio/mpeg", "x-onbellek": "1" } });
        }
        const ses = await sesUret(env, m);
        if (kisa && ["eleven", "azure", "cartesia"].includes(ses.kaynak) && ses.veri.length < 400000) {
          try { await env.HAFIZA.put(anahtar, ses.veri, { expirationTtl: 30 * 864e2, metadata: { tur: ses.tur, kaynak: ses.kaynak || "" } }); } catch (e) {}
        }
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

      if (UYKU.test(metin)) await uykuKaydet(env, "yat").catch(() => {});
      if (UYKU.test(metin)) return Response.json({ cevap: "İyi geceler Eren. Alarma kadar dinlemiyorum.", uyku: true, beyin: "sistem" });
      const linkVar = (metin.match(/https?:\/\/\S+/g) || []).find((l) => !l.includes("/folders/"));
      if (linkVar) await kvYaz(env, "son_link", linkVar);
      let k = komut(metin);
      const ajanVar = !!(env.GROQ_API_KEY || env.ANTHROPIC_API_KEY);
      const DOGRUDAN = ["onayla", "iptal", "geri_al", "puan_iyi", "puan_kotu"];
      if (k && ajanVar && !DOGRUDAN.includes(k)) k = null; // geri kalan her sey yapay zekadan gecer
      if (!k && !ajanVar && metin.length < 600) {
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
          else if (k === "ilanlar") {
            const il = await ilanlar(env);
            if (typeof il !== "string") return Response.json({ cevap: il.metin, linkler: il.linkler, beyin: "sistem" });
            c = il;
          }
          else if (k === "alarm") c = await alarmAyari(env, metin);
          else if (k === "hatirlat") c = await hatirlatmaEkle(env, metin);
          else if (k === "not") c = await notAl(env, metin);
          else if (k === "temizle") { await kvYaz(env, "yapacaklar", []); await gunlukEkle(env, "Yapılacaklar temizlendi"); c = "Yapılacaklar listesini temizledim."; }
          else if (k === "ilan_ara") c = await ilanAra(env);
          else if (k === "ilan_detay") {
            const d = await ilanDetay(env, metin);
            return Response.json(typeof d === "string" ? { cevap: d, beyin: "sistem" } : { cevap: d.metin, link: d.link, beyin: "sistem" });
          }
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
