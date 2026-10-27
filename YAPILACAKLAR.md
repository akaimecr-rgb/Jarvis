# Eren ile Jarvis - yapilacaklar listesi
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

## Sonra yapilacak gelistirmeler
- Drive baglantisi (Eren karar verdi): Google Cloud hizmet hesabi ile Jarvis sadece Drive'daki "Jarvis" klasorunu gorecek (alt klasorler: ham, ornek, malzeme, bitti). Dosyalari adiyla bulacak, bitmis videoyu "bitti" klasorune koyacak.
- Discord ilanlari: Discord botu acilip Eren'in izinli oldugu sunuculara eklenmeli (Eren'in kurulum yapmasi gerekir).
- Ilanlardaki ornek video linklerinden otomatik stil cikarma.
- Malzeme klasorundeki muzik ve logoyu kurguya otomatik yerlestirmek.
- Para kazanmaya baslayinca Cloudflare'e ANTHROPIC_API_KEY eklemek: yonetici beyin otomatik Claude (Haiku) olur, Groq yedek kalir. Konsolda aylik harcama limiti koy.
- Uzun vadeli hedef (isler buyuyunce): Eren'e ozel model. Jarvis birkac ay veri biriktirir (sohbetler, stil dosyalari, musteri mesajlari) -> acik bir model (Llama/Qwen/Gemma) LoRA ile egitilir -> Jarvis'e baglanir. Jarvis bu modeli "kisisel beyin" olarak kullanir, ozel isler icin API'deki diger modelleri (Claude, Gemini, Groq) yonetir. Bilgi icin ayrica bilgi bankasi (RAG) eklenir.
