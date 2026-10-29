package com.eren.jarvis

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.StorageService

/** Arka planda "Jarvis" kelimesini dinler (Vosk, cevrimdisi, anahtarsiz). */
class WakeService : Service(), RecognitionListener {
    companion object {
        const val BASLAT = "baslat"
        const val DURAKLAT = "duraklat"
        const val DEVAM = "devam"
        const val DURDUR = "durdur"
        @Volatile var calisiyor = false
        @Volatile var durum = "kapalı"
        private var model: Model? = null
        private var kelimeler: List<String> = emptyList()
        // Jarvis'e benzeyen kelimeler (modelde hangisi varsa)
        val ADAYLAR = listOf("jarvis", "travis", "jervis", "harvis", "service", "jarvas", "charvis", "davis", "carvis")
        // Sadece kisa ve tek basina soylenen "Jarvis" benzeri kelimeler
        val TETIK = Regex("^(hey |hay |ey |a )?(jar ?vis|jervis|jarvas|jarvi|travis|harvis|service|charvis|davis|carvis)$")
        @Volatile var sonDuyulan = ""
    }

    private var ss: Any? = null   // dinleme dongusu calisiyorsa dolu
    @Volatile private var aktif = false
    @Volatile private var nesil = 0
    private val halka = ShortArray(16000 * 2)
    private var halkaYer = 0
    private fun sonKlip(): ShortArray { synchronized(halka) { val o = ShortArray(halka.size); for (i in halka.indices) o[i] = halka[(halkaYer + i) % halka.size]; return o } }
    private var tetiklendi = false
    private val ana = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action ?: BASLAT) {
            BASLAT -> { birak("başlıyor"); onPlana(); hazirla() }
            DEVAM -> { if (calisiyor) ana.postDelayed({ dinle() }, 800) }
            DURAKLAT -> birak("duraklatıldı")
            DURDUR -> { birak("kapalı"); calisiyor = false; stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(startId) }
        }
        return START_STICKY
    }

    private val bildirimDongusu = object : Runnable {
        override fun run() {
            Thread { bildirimCek() }.start()
            val p = getSharedPreferences("jarvis", MODE_PRIVATE)
            if (p.getBoolean("uyku", false) && System.currentTimeMillis() - p.getLong("uyku_zaman", 0) > 10 * 3600 * 1000L) {
                p.edit().putBoolean("uyku", false).apply()   // uyku 10 saati gecti: tekrar dinle
                if (calisiyor) dinle()
            }
            ana.postDelayed(this, 10 * 60 * 1000L)
        }
    }

    private fun bildirimCek() {
        val sifre = Ayarlar.sifre(this)
        if (sifre.isEmpty()) return
        val p = getSharedPreferences("jarvis", MODE_PRIVATE)
        val son = p.getLong("son_bildirim", System.currentTimeMillis() - 3600_000L)
        try {
            val c = java.net.URL(JARVIS_URL + "bildirimler?son=" + son).openConnection() as java.net.HttpURLConnection
            c.setRequestProperty("x-secret", sifre)
            c.connectTimeout = 15000; c.readTimeout = 15000
            if (c.responseCode != 200) return
            val j = org.json.JSONObject(c.inputStream.bufferedReader().readText())
            val dizi = j.optJSONArray("bildirimler") ?: return
            for (i in 0 until dizi.length()) {
                val b = dizi.getJSONObject(i)
                bildirimGoster(this, b.optString("baslik"), b.optString("metin"), b.optString("link"))
            }
            p.edit().putLong("son_bildirim", j.optLong("simdi", System.currentTimeMillis())).apply()
        } catch (_: Exception) {}
    }

    private fun onPlana() {
        kanallariKur(this)
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, KANAL_SERVIS)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Jarvis dinliyor")
            .setContentText("\"Jarvis\" demen yeterli")
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 30) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        else startForeground(1, n)
        calisiyor = true
        ana.removeCallbacks(bildirimDongusu)
        ana.postDelayed(bildirimDongusu, 20_000L)
    }

    private fun hazirla() {
        if (model != null) { dinle(); return }
        durum = "model hazırlanıyor..."
        StorageService.unpack(applicationContext, "model-en-us", "model",
            { m ->
                model = m
                kelimeler = try {
                    val w = java.io.File(applicationContext.getExternalFilesDir(null), "model/graph/words.txt").let {
                        if (it.exists()) it else java.io.File(applicationContext.filesDir, "model/graph/words.txt")
                    }
                    val hepsi = if (w.exists()) w.readLines().map { it.substringBefore(" ") }.toHashSet() else hashSetOf()
                    // Sozluk okunamazsa da aday listesini kullan (serbest dinleme "huh" gibi seyler duyuyordu)
                    if (hepsi.isEmpty()) ADAYLAR else ADAYLAR.filter { it in hepsi }.ifEmpty { ADAYLAR }
                } catch (_: Exception) { ADAYLAR }
                dinle()
            },
            { e -> durum = "model hatası: " + e.message })
    }

    private fun dinle() {
        val m = model ?: return
        if (ss != null || !calisiyor) return
        try {
            val rec = try {
                Recognizer(m, 16000.0f, "[" + (kelimeler.ifEmpty { ADAYLAR } + "[unk]").joinToString(",") { "\"" + it + "\"" } + "]")
            } catch (_: Exception) { Recognizer(m, 16000.0f) }
            rec.setWords(true)
            // Kendi mikrofon dongumuz: hem Vosk'a verir hem son 2 saniyeyi saklar (sese ozel eslestirme icin)
            aktif = true
            val benim = ++nesil
            val t = Thread {
                val boy = maxOf(android.media.AudioRecord.getMinBufferSize(16000, android.media.AudioFormat.CHANNEL_IN_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT), 8192)
                @Suppress("MissingPermission")
                val ar = try { android.media.AudioRecord(android.media.MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, android.media.AudioFormat.CHANNEL_IN_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT, boy) } catch (e: Exception) { null }
                if (ar == null || ar.state != android.media.AudioRecord.STATE_INITIALIZED) { durum = "mikrofon açılamadı"; ss = null; ana.postDelayed({ dinle() }, 5000); return@Thread }
                val buf = ShortArray(1600)
                try {
                    ar.startRecording()
                    while (aktif && benim == nesil) {
                        val r = ar.read(buf, 0, buf.size)
                        if (r <= 0) continue
                        synchronized(halka) { for (i in 0 until r) { halka[halkaYer] = buf[i]; halkaYer = (halkaYer + 1) % halka.size } }
                        if (rec.acceptWaveForm(buf, r)) { val j = rec.result; val klip = sonKlip(); ana.post { kontrol(j, klip) } }
                    }
                } catch (e: Exception) { durum = "dinleme hatası: " + e.message }
                try { ar.stop() } catch (_: Exception) {}
                ar.release(); try { rec.close() } catch (_: Exception) {}
            }
            ss = t; t.start()
            tetiklendi = false
            durum = "dinliyor (" + (if (kelimeler.isEmpty()) "serbest" else kelimeler.joinToString("/")) + ")"
        } catch (e: Exception) {
            ss = null
            durum = "hata: " + (e.message ?: e.javaClass.simpleName)
        }
    }

    private var sonBildirimYazma = 0L
    private fun bildirimYaz(metin: String) {
        val simdi = System.currentTimeMillis()
        if (simdi - sonBildirimYazma < 1500) return
        sonBildirimYazma = simdi
        try {
            val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).putExtra("ayar", true), PendingIntent.FLAG_IMMUTABLE)
            val n = Notification.Builder(this, KANAL_SERVIS).setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Jarvis dinliyor").setContentText(metin).setContentIntent(pi).setOngoing(true).setOnlyAlertOnce(true).build()
            getSystemService(android.app.NotificationManager::class.java).notify(1, n)
        } catch (_: Exception) {}
    }

    private fun birak(yeniDurum: String) {
        aktif = false
        nesil++
        ss = null
        durum = yeniDurum
    }

    private fun kontrol(json: String?, klip: ShortArray? = null) {
        if (tetiklendi || json == null) return
        val metin = Regex("\"(partial|text)\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(2) ?: ""
        if (metin.isNotBlank() && metin != "[unk]") sonDuyulan = metin
        // Guven puani: tum kelimeler net duyulmali (yanlis uyanmayi azaltir)
        val guven = try {
            val dizi = org.json.JSONObject(json).optJSONArray("result")
            if (dizi == null || dizi.length() == 0) 1.0
            else (0 until dizi.length()).minOf { dizi.getJSONObject(it).optDouble("conf", 1.0) }
        } catch (_: Exception) { 1.0 }
        if (metin.isNotBlank()) sonDuyulan = metin + " (%" + (guven * 100).toInt() + ")"
        // Hassasiyet (Ayarlar): yuksek=0.45, normal=0.6, dusuk=0.78
        val esik = when (getSharedPreferences("jarvis", MODE_PRIVATE).getString("hassasiyet", "normal")) { "yuksek" -> 0.45; "dusuk" -> 0.78; else -> 0.6 }
        val temiz = metin.replace("[unk]", "").trim().replace(Regex("\\s+"), " ")
        if (metin.isNotBlank()) bildirimYaz("Son duyduğum: " + temiz.ifEmpty { "?" } + " (%" + (guven * 100).toInt() + ")")
        // Cumle icinde gecen benzer sesle uyanma: ifade SADECE uyandirma kelimesinden olusmali ([unk] yok, en fazla 2 kelime)
        val yalniz = !metin.contains("[unk]") && temiz.split(" ").size <= 2
        var sesUydu = true
        if (yalniz && TETIK.matches(temiz) && guven >= esik && klip != null && SesEslestir.sayi(this) > 0) {
            val pay = when (getSharedPreferences("jarvis", MODE_PRIVATE).getString("hassasiyet", "normal")) { "yuksek" -> 1.25f; "dusuk" -> 0.85f; else -> 1f }
            val (ok, d) = SesEslestir.benzer(this, klip, pay)
            sesUydu = ok
            sonBildirimYazma = 0
            bildirimYaz("Duydum: $temiz • ses eşleşmesi " + (if (ok) "✓" else "✗") + " (" + d.toInt() + "/" + (SesEslestir.esik(this) * pay).toInt() + ")")
        }
        if (yalniz && sesUydu && TETIK.matches(temiz) && guven >= esik) {
            tetiklendi = true
            ana.post {
                birak("konuşuyor")
                jarvisiAc(this, "serbest")
            }
        }
    }

    override fun onPartialResult(hypothesis: String?) { /* yanlis tetiklenmesin diye sadece tamamlanan sonuclara bakilir */ }
    override fun onResult(hypothesis: String?) = kontrol(hypothesis)
    override fun onFinalResult(hypothesis: String?) = kontrol(hypothesis)
    override fun onError(exception: Exception?) { durum = "hata: " + exception?.message; birak(durum); ana.postDelayed({ dinle() }, 3000) }
    override fun onTimeout() { birak("zaman aşımı"); dinle() }

    override fun onDestroy() {
        ana.removeCallbacks(bildirimDongusu)
        birak("kapalı")
        calisiyor = false
        super.onDestroy()
    }
}
