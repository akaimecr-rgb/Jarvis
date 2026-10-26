package com.eren.jarvis

import ai.picovoice.porcupine.Porcupine
import ai.picovoice.porcupine.PorcupineManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/** Arka planda "Jarvis" kelimesini dinler. */
class WakeService : Service() {
    companion object {
        const val BASLAT = "baslat"
        const val DURAKLAT = "duraklat"
        const val DEVAM = "devam"
        const val DURDUR = "durdur"
        @Volatile var calisiyor = false
        @Volatile var durum = "kapalı"
    }

    private var pm: PorcupineManager? = null
    private val ana = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action ?: BASLAT) {
            BASLAT -> { onPlana(); dinle() }
            DEVAM -> { if (calisiyor) dinle() }
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

    private fun dinle() {
        if (pm != null) return
        val anahtar = Ayarlar.anahtar(this)
        if (anahtar.isEmpty()) { durum = "Picovoice anahtarı yok"; return }
        try {
            pm = PorcupineManager.Builder()
                .setAccessKey(anahtar)
                .setKeyword(Porcupine.BuiltInKeyword.JARVIS)
                .setSensitivity(0.65f)
                .build(applicationContext) { _ -> ana.post { uyandi() } }
            pm?.start()
            durum = "dinliyor"
        } catch (e: Exception) {
            pm = null
            durum = "hata: " + (e.message ?: e.javaClass.simpleName)
        }
    }

    private fun birak(yeniDurum: String) {
        try { pm?.stop(); pm?.delete() } catch (_: Exception) {}
        pm = null
        durum = yeniDurum
    }

    private fun uyandi() {
        birak("konuşuyor")
        jarvisiAc(this, "serbest")
    }

    override fun onDestroy() {
        birak("kapalı")
        calisiyor = false
        super.onDestroy()
    }
}
