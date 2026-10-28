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
import org.vosk.android.SpeechService
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

    private var ss: SpeechService? = null
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
            ss = SpeechService(rec, 16000.0f)
            ss?.startListening(this)
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
        try { ss?.stop(); ss?.shutdown() } catch (_: Exception) {}
        ss = null
        durum = yeniDurum
    }

    private fun kontrol(json: String?) {
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
        if (TETIK.matches(temiz) && guven >= esik) {
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
