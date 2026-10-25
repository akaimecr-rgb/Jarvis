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
