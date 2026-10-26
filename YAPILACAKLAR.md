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

## Sonra yapilacak gelistirmeler
- Drive baglantisi (Eren karar verdi): Google Cloud hizmet hesabi ile Jarvis sadece Drive'daki "Jarvis" klasorunu gorecek (alt klasorler: ham, ornek, malzeme, bitti). Dosyalari adiyla bulacak, bitmis videoyu "bitti" klasorune koyacak.
- Discord ilanlari: Discord botu acilip Eren'in izinli oldugu sunuculara eklenmeli (Eren'in kurulum yapmasi gerekir).
- Ilanlardaki ornek video linklerinden otomatik stil cikarma.
- Malzeme klasorundeki muzik ve logoyu kurguya otomatik yerlestirmek.
- Para kazanmaya baslayinca kod yazmayi Claude API'ye gecirmek.
