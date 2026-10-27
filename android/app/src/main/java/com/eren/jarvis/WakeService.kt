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
    }

    private var ss: SpeechService? = null
    private var tetiklendi = false
    private val ana = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action ?: BASLAT) {
            BASLAT -> { onPlana(); hazirla() }
            DEVAM -> { if (calisiyor) ana.postDelayed({ dinle() }, 800) }
            DURAKLAT -> birak("duraklatıldı")
            DURDUR -> { birak("kapalı"); calisiyor = false; stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
        }
        return START_STICKY
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
    }

    private fun hazirla() {
        if (model != null) { dinle(); return }
        durum = "model hazırlanıyor..."
        StorageService.unpack(applicationContext, "model-en-us", "model",
            { m -> model = m; dinle() },
            { e -> durum = "model hatası: " + e.message })
    }

    private fun dinle() {
        val m = model ?: return
        if (ss != null || !calisiyor) return
        try {
            val rec = Recognizer(m, 16000.0f, "[\"jarvis\", \"[unk]\"]")
            ss = SpeechService(rec, 16000.0f)
            ss?.startListening(this)
            tetiklendi = false
            durum = "dinliyor"
        } catch (e: Exception) {
            ss = null
            durum = "hata: " + (e.message ?: e.javaClass.simpleName)
        }
    }

    private fun birak(yeniDurum: String) {
        try { ss?.stop(); ss?.shutdown() } catch (_: Exception) {}
        ss = null
        durum = yeniDurum
    }

    private fun kontrol(json: String?) {
        if (tetiklendi || json == null) return
        if (json.contains("jarvis")) {
            tetiklendi = true
            ana.post {
                birak("konuşuyor")
                jarvisiAc(this, "serbest")
            }
        }
    }

    override fun onPartialResult(hypothesis: String?) = kontrol(hypothesis)
    override fun onResult(hypothesis: String?) = kontrol(hypothesis)
    override fun onFinalResult(hypothesis: String?) = kontrol(hypothesis)
    override fun onError(exception: Exception?) { durum = "hata: " + exception?.message; birak(durum); ana.postDelayed({ dinle() }, 3000) }
    override fun onTimeout() { birak("zaman aşımı"); dinle() }

    override fun onDestroy() {
        birak("kapalı")
        calisiyor = false
        super.onDestroy()
    }
}
