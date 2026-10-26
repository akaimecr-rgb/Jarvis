# Jarvis

Cloudflare Worker (`jarviss`). Bu depodaki `src/index.js` degisince Cloudflare otomatik yayinlar.

## Komutlar
- Normal konusma → Gemini (yedek: OpenRouter)
- `Sansürsüz, ...` → OpenRouter
- `Bunu hatırla: ...` → kalici not
- `kod: <istek>` → Jarvis kendi kodunu yazar, ozetler → `onayla` / `iptal`
- `geri al` → son kod degisikligini geri alir
- `kurgula shorts <Drive linki>` veya `kurgula uzun <link>` → bulutta render
- `kurgu durumu` → son render'in durumu ve linki

## Cloudflare ayarlari
Secret: APP_SECRET, GEMINI_API_KEY, OPENROUTER_API_KEY, GITHUB_TOKEN
Text: GEMINI_MODEL, OPENROUTER_MODEL, (istege bagli) KOD_MODEL
KV: HAFIZA

## Gorev dagitimi (modeller)
Cloudflare'de Text degiskeniyle degistirilir:
- `GROQ_API_KEY` (Secret) varsa konusma ve dinleme Groq ile yapilir (GROQ_MODEL, GROQ_DINLE_MODEL)
- `SOHBET_MODEL` (varsayilan gemini-flash-lite-latest): hizli konusma, ses tek istekte anlasilir
- `KOD_MODEL` (varsayilan gemini-pro-latest): kod yazma; hata verirse `KOD_YEDEK_MODEL` / `OPENROUTER_MODEL`
- `DINLE_MODEL`: yedek ses-yazi cevirme
- `TTS_MODEL`, `SES_ADI`: Jarvis'in sesi
