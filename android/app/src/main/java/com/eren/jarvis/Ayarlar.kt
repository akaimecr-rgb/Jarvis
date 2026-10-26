package com.eren.jarvis

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import java.util.Calendar

const val JARVIS_URL = "https://jarviss.akaimecr.workers.dev/"
const val KANAL_SERVIS = "jarvis_servis"
const val KANAL_ACIL = "jarvis_acil"

object Ayarlar {
    private fun p(c: Context) = c.getSharedPreferences("jarvis", Context.MODE_PRIVATE)
    fun anahtar(c: Context) = p(c).getString("picovoice", "") ?: ""
    fun sifre(c: Context) = p(c).getString("sifre", "") ?: ""
    fun alarmSaati(c: Context) = p(c).getString("alarm", "08:30") ?: "08:30"
    fun alarmAcik(c: Context) = p(c).getBoolean("alarm_acik", true)
    fun kaydet(c: Context, anahtar: String, sifre: String, alarm: String, alarmAcik: Boolean) {
        p(c).edit().putString("picovoice", anahtar.trim()).putString("sifre", sifre.trim())
            .putString("alarm", alarm.trim()).putBoolean("alarm_acik", alarmAcik).apply()
    }
}

fun kanallariKur(c: Context) {
    val nm = c.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(KANAL_SERVIS, "Jarvis dinliyor", NotificationManager.IMPORTANCE_MIN))
    nm.createNotificationChannel(NotificationChannel(KANAL_ACIL, "Jarvis ekranı ve alarm", NotificationManager.IMPORTANCE_HIGH))
}

/** Jarvis ekranini acar: izin varsa dogrudan, yoksa tam ekran bildirimle. */
fun jarvisiAc(c: Context, mod: String) {
    val intent = Intent(c, JarvisActivity::class.java).apply {
        putExtra("mod", mod)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    if (Settings.canDrawOverlays(c)) {
        try { c.startActivity(intent); return } catch (_: Exception) {}
    }
    kanallariKur(c)
    val pi = PendingIntent.getActivity(c, mod.hashCode(), intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = android.app.Notification.Builder(c, KANAL_ACIL)
        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setContentTitle(if (mod == "alarm") "Günaydın!" else "Jarvis")
        .setContentText("Jarvis'i açmak için dokun")
        .setCategory(if (mod == "alarm") android.app.Notification.CATEGORY_ALARM else android.app.Notification.CATEGORY_CALL)
        .setFullScreenIntent(pi, true)
        .setContentIntent(pi)
        .setAutoCancel(true)
        .build()
    c.getSystemService(NotificationManager::class.java).notify(7, n)
}

fun servisKomutu(c: Context, eylem: String) {
    val i = Intent(c, WakeService::class.java).setAction(eylem)
    try {
        if (eylem == WakeService.BASLAT) c.startForegroundService(i) else c.startService(i)
    } catch (_: Exception) {}
}

/** Sonraki alarmi kurar. */
fun alarmKur(c: Context) {
    val am = c.getSystemService(AlarmManager::class.java)
    val pi = PendingIntent.getBroadcast(c, 1, Intent(c, AlarmReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    am.cancel(pi)
    if (!Ayarlar.alarmAcik(c)) return
    val (s, d) = Ayarlar.alarmSaati(c).split(":").map { it.trim().toIntOrNull() ?: 0 }.let {
        (it.getOrElse(0) { 8 }) to (it.getOrElse(1) { 30 })
    }
    val cal = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, s); set(Calendar.MINUTE, d); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
    }
    val goster = PendingIntent.getActivity(c, 2, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val izinli = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    if (izinli) am.setAlarmClock(AlarmManager.AlarmClockInfo(cal.timeInMillis, goster), pi)
    else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
}
