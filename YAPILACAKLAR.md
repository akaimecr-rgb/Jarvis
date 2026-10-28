# Eren ile Jarvis - yapilacaklar listesi

## MUSTERILER (kurgu isteklerinde kullan)
- GKey: Eren'in duzenli musterisi, oncelikli is. Valorant lineup Shorts. Kurgula aracinda musteri = "gkey", format = "shorts".
  Stil dosyasi henuz yok: Eren 3 ornek GKey videosu verince "stil_cikar" ile ad = "gkey" olarak cikar.
(Bu dosyayi Jarvis her konusmada okur. Eren "neler yapacaktik" diye sorarsa buradan anlat.)

## Siradaki adimlar
1. GitHub'da remotion-sablonlar deposuna GEMINI_API_KEY secret'ini ekle (Settings > Secrets and variables > Actions > New repository secret).
2. Cloudflare'de jarviss Worker'ina GROQ_API_KEY secret'ini ekle (anahtar: console.groq.com > API Keys). Konusmayi cok hizlandirir.
3. Test: "stil çıkar shorts" + 3 ornek Shorts linki. 10 dakika bekle.
4. Test: "kurgula shorts" + 1 dakikalik bir ham video linki, sonra "kurgu durumu".

## Hazir olan komutlar (anahtarlar eklenince calisir)
- "ilanlar": Reddit'te bulunan uygun editor ilanlari (2 saatte bir otomatik taranir). "ilan ara": hemen tara.
- "başvuru yaz 1": 1 numarali ilana Ingilizce basvuru + Turkce ceviri.
- Her uygun ilan icin musteri stil dosyasi otomatik olusur (ad = stil adi).
- "kurgula shorts <link> müşteri <stil adı> <istekler>": o musterinin stiliyle kurgula.
- "stil çıkar shorts ad <isim> <ornek linkler>": ornek videolardan isimli stil dosyasi.

## Telefon uygulamasi (Eren'in telefonu acilinca yapilacak)
- Android uygulamasi (APK'yi GitHub derler): telefon kilitliyken bile "Jarvis" deyince Jarvis ekrani acilsin (Picovoice ucretsiz anahtar gerekli).
- Buton yok: "Jarvis" dedikten sonra surekli dinlesin, Eren susunca cevap versin, tekrar dinlesin; "tamam ben kapatiyorum" deyince birakip tekrar "Jarvis"i beklesin.
- Sabah alarmi: her gun 08:30'da Jarvis sesiyle yuksek sesle "Songul Hanim, Eren'i uyandir" desin, "uyandim" deyince dursun. Eren "yarin yapma" dedigi gunler calmasin.
- Sonra: ayni ozellikler Windows laptop icin kucuk bir program olarak.
- Web sayfasina da butonsuz konusma modu eklenecek.
- Uygulamaya eklenecekler (Eren hepsini istedi):
  1. Bildirim okuma: Discord'dan musteri mesaji gelince sesli soylesin, Ingilizceyse Turkce cevirisini okusun.
  2. Is cikisi ozeti: "isten ciktim" deyince yeni ilanlar, biten kurgular, bekleyen mesajlar.
  3. Sesli not: "Jarvis, not al: ..." ve aksam notlari okuma.
  4. Paylas-kurgula: telefondaki videoyu Paylas > Jarvis ile gonderip "GKey stiliyle kurgula".
  5. Hatirlaticilar: "yarin 12'de teslim var, 11'de hatirlat".

## Yeni (Eren'in tasarimiyla)
- Jarvis ekrani: hareketli halkalar, saat, hava durumu, JARVIS YAPACAKLARI paneli, sistem gunlugu (yaptiklari), AYARLAR dugmesi, DOSYA AÇ (Drive).
- "yarin 11de ... hatirlat" -> hatirlatma; zamani gelince Jarvis soyler ve telefona bildirim gelir.
- "not al: ..." -> yapacaklar listesine not. "listeyi temizle".
- DOSYA AÇ'in Drive klasorunu acmasi icin Cloudflare'e DRIVE_URL (Text) eklenebilir.

## Ajan modu
- Jarvis artik ajan: istegi anlar, araclarini (kurgula, kurgu durumu, stil, ilanlar, basvuru, hatirlat, not, alarm, drive, kendini gelistir) sirayla kullanir.
- Yapamadigi bir sey istenirse nasil yapabilecegini anlatir ve kendini_gelistir ile o ozelligi hazirlar; Eren "onayla" deyince eklenir.

## Kendi model icin veri toplama (basladi)
- Her konusma gunluk kaydedilir, her gece 03:00'te GitHub Jarvis deposunda veri/YYYY-AA.jsonl dosyasina eklenir.
- Eren "iyiydi" / "kotuydu" diyerek son cevabi puanlar. Hedef: 500-2000 ornek, sonra Colab'da LoRA egitimi.
- Egitimde sadece Eren'in mesajlari ve acik lisansli modellerin (gpt-oss) cevaplari kullanilir; Claude ve Gemini cevaplari kullanilmaz.

## Bu gece eklenenler (Jarvis bunlari kullanabilir)
- Arastir: internette guncel arastirma (Google). Her gun 10:00'da is icin kendiliginden arastirir (Valorant Shorts trendleri, is bulma, Remotion).
- Depremler: son depremler, ekranda deprem paneli. Yakindaki yerler: kafe/restoran/eczane/plaj vb. ve su an acik mi (OpenStreetMap), ekranda liste.
- Hava ve konum: Eren Manavgat'ta yasiyor; "konumum X" ile degisir. Her konusmada saat ve hava bilinir.
- Gunluk plan: vardiya (13:00-22:00), hatirlatmalar, takvim; "yarin izinliyim" -> izin gunu.
- Neler yaptin: sistem gunlugunden son 24 saat.
- Gmail ve Takvim: Google koprusu kurulunca mail kontrolu (GKey cevabi), takvime ekleme.
- 7/24: saatte bir yeni ilan, biten kurgu ve yeni mail icin telefona bildirim. Sabah alarmindan sonra sabah ozeti.
- Yedek ucretsiz beyin: CEREBRAS_API_KEY eklenirse Groq dolunca Cerebras devreye girer.

## Sonra yapilacak gelistirmeler
- Drive baglantisi (Eren karar verdi): Google Cloud hizmet hesabi ile Jarvis sadece Drive'daki "Jarvis" klasorunu gorecek (alt klasorler: ham, ornek, malzeme, bitti). Dosyalari adiyla bulacak, bitmis videoyu "bitti" klasorune koyacak.
- Discord ilanlari: Discord botu acilip Eren'in izinli oldugu sunuculara eklenmeli (Eren'in kurulum yapmasi gerekir).
- Ilanlardaki ornek video linklerinden otomatik stil cikarma.
- Malzeme klasorundeki muzik ve logoyu kurguya otomatik yerlestirmek.
- Para kazanmaya baslayinca Cloudflare'e ANTHROPIC_API_KEY eklemek: yonetici beyin otomatik Claude (Haiku) olur, Groq yedek kalir. Konsolda aylik harcama limiti koy.
- Uzun vadeli hedef (isler buyuyunce): Eren'e ozel model. Jarvis birkac ay veri biriktirir (sohbetler, stil dosyalari, musteri mesajlari) -> acik bir model (Llama/Qwen/Gemma) LoRA ile egitilir -> Jarvis'e baglanir. Jarvis bu modeli "kisisel beyin" olarak kullanir, ozel isler icin API'deki diger modelleri (Claude, Gemini, Groq) yonetir. Bilgi icin ayrica bilgi bankasi (RAG) eklenir.
- Kendini gelistiren dongu (Eren istedi): 1-2 ay konusma verisi topla -> acik Turkce model (ornek: Turkish-Llama-8B-Instruct veya Cloudflare'in destekledigi bir model) + temiz acik Turkce veri (InstrucTurca vb., lisansini kontrol et) + Eren'in Jarvis verisi ile LoRA egitimi -> Kaggle ucretsiz GPU'da ayda bir otomatik egitim (GitHub'dan tetiklenir) -> yeni model eskisinden iyiyse kullan. Kisisel model Jarvis'in kisiligi ve ilk cevabi olur; zor isler buyuk modellere gider.

## 28 Ekim gece eklenenler
- Paylaş > "Jarvis'e gönder": telefondaki video Drive/ham'a yüklenir, Jarvis kurgu için sorar (APK 11).
- Discord: discord_oku / discord_yaz araçları, saatlik yeni mesaj bildirimi (GKey öncelikli), müşteriye günde en fazla 2 mesaj kilidi. Gerekli: DISCORD_BOT_TOKEN, DISCORD_KANALLAR (virgüllü kanal id), ops. DISCORD_BENIM_AD.
- Haftalık rapor: Pazar 23:00 otomatik + "haftalık rapor" aracı.
- laptop/: Windows için "Jarvis" uyandırma kelimeli program (BASLAT.bat).
- GKey stili (remotion-sablonlar/musteriler/gkey.md): nişan işareti, hedefe zoom, hook başlık, ilerleme çubuğu, flaş, otomatik ses efektleri. Kurgularken stil "gkey" ver.
- Her kurguda otomatik kapak (thumbnail) + Gemini kalite kontrolü (puan, sorunlar) + başlık/hashtag + müşteriye teslim mesajı (EN+TR). "kurgu durumu" hepsini söyler.
- toplu_kurgula (Drive/ham'daki tüm yeni videolar), oto_kurgu (ham'a düşen her video saatlik kendiliğinden kurgulanır).
- HUD: SON KURGULAR paneli (kapaklarıyla) — "kurgular" de.
- musteri_bul: potansiyel müşteri kanalları + kanala özel tanıtım mesajı (göndermez).
- fikir_uret: güncel Valorant yamasına göre GKey için video fikirleri.
- Ödeme takibi: teslimden 3 gün sonra ödenmemiş işler için 12:00 bildirimi.
- İlan avı: 9 subreddit + RemoteOK / WeWorkRemotely / Jobicy.
- Android (APK 12): video paylaş → Drive'a yükle; metin/link paylaş → Jarvis'e sor; bildirim panelinde "Jarvis" hızlı ayar kutucuğu.

## Eren'in sabah kuracakları
1. APK 12'yi kur (GitHub Jarvis → Releases → jarvis-app-12).
2. Google köprüsü (Drive+Gmail+Takvim) → DRIVE_SCRIPT_URL, DRIVE_ANAHTAR (Cloudflare + GitHub remotion-sablonlar).
3. CEREBRAS_API_KEY (Cloudflare).
4. GEMINI_API_KEY GitHub remotion-sablonlar secret'ında olsun.
5. Discord: DISCORD_BOT_TOKEN, DISCORD_KANALLAR (Cloudflare).
6. İsteğe bağlı: AYLIK_HEDEF, PORTFOLYO_ILETISIM. Sonra ANTHROPIC_API_KEY.

## 28 Ekim öğleden sonra eklenenler
- Ses: ElevenLabs/Gemini kotası dolunca kilit + ücretsiz Google çeviri sesi yedeği; kısa cümleler (alarm) 30 gün önbellekte.
- APK 13: uyku modu uygulamayı açınca biter, en fazla 10 saat sürer.
- sistem_durumu: tüm servisleri test eder, ElevenLabs kalan kotası; 6 saatte bir bozulma bildirimi.
- Mesai modu (13-22): önemsiz bildirimler bekler, 22:00'de özet; mesaide kısa cevap.
- revize: biten kurguyu isteğe göre değiştirip yeniden render (müşteri revizyonları).
- Portfolyo: "son kurguyu portfolyoya ekle".
- Sabah özetinde "Günün İngilizcesi".
- Telegram: TELEGRAM_BOT_TOKEN ekle → tarayıcıda jarviss.akaimecr.workers.dev/telegram-kur?s=<Jarvis şifresi> aç → botu açıp şifreyi yaz. Yazı + sesli mesaj, bildirimler oraya da gelir.
- Twitch: TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (dev.twitch.tv) → klip_bul. Kurgu artık Twitch/Kick/TikTok/YouTube linklerinden de indirir (YouTube GitHub'da bazen engellenir). "klip" stili: yatay klibi dikeye sığdırır.
- Ajan artık her mesaja sadece ilgili araçları yolluyor (Groq limiti), bu liste sadece sorulunca okunuyor.
