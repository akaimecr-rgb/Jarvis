package com.eren.jarvis

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        if (intent.action == "hatirlat") {
            hatirlatmaBildirimi(c, intent.getStringExtra("metin") ?: "Hatırlatma")
            servisKomutu(c, WakeService.DURAKLAT)
            jarvisiAc(c, "hatirlat")
            return
        }
        if (intent.action == "uyanma_kontrol") { uyanmaKontrol(c); return }
        alarmKur(c) // yarinin alarmi
        uyanmaKontroluKur(c) // 30 dk sonra hala uyanmadiysa annesine SMS
        c.getSharedPreferences("jarvis", Context.MODE_PRIVATE).edit().putBoolean("uyku", false).apply() // uyku modu biter
        servisKomutu(c, WakeService.DURAKLAT)
        jarvisiAc(c, "alarm")
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        alarmKur(c)
        servisKomutu(c, WakeService.BASLAT)
    }
}

/** Alarmdan 30 dk sonra kontrol kur. */
fun uyanmaKontroluKur(c: Context) {
    val am = c.getSystemService(android.app.AlarmManager::class.java)
    val dk = c.getSharedPreferences("jarvis", Context.MODE_PRIVATE).getInt("sms_dakika", 30)
    val pi = android.app.PendingIntent.getBroadcast(c, 11, Intent(c, AlarmReceiver::class.java).setAction("uyanma_kontrol"),
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
    val zaman = System.currentTimeMillis() + dk * 60_000L
    try { am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, zaman, pi) } catch (_: Exception) { am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, zaman, pi) }
}

/** Bugun "uyandim" denmediyse rehberdeki kisiye (varsayilan "Annem") SMS gonderir. */
fun uyanmaKontrol(c: Context) {
    val p = c.getSharedPreferences("jarvis", Context.MODE_PRIVATE)
    val bugun = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
    if (p.getString("uyandi_tarih", "") == bugun) return
    if (!p.getBoolean("sms_acik", true)) return
    val kisi = p.getString("sms_kisi", "Annem") ?: "Annem"
    val sonuc = try {
        if (c.checkSelfPermission(android.Manifest.permission.SEND_SMS) != android.content.pm.PackageManager.PERMISSION_GRANTED ||
            c.checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != android.content.pm.PackageManager.PERMISSION_GRANTED) "izin yok (Ayarlar > SMS iznini ver)"
        else {
            val no = rehberdeBul(c, kisi)
            if (no == null) "rehberde '$kisi' bulunamadi"
            else {
                val metin = p.getString("sms_metin", null) ?: "Merhaba, ben Eren'in asistanı Jarvis. Eren alarma rağmen hâlâ uyanmadı, onu uyandırabilir misiniz? 🙏"
                val sm = if (android.os.Build.VERSION.SDK_INT >= 31) c.getSystemService(android.telephony.SmsManager::class.java) else @Suppress("DEPRECATION") android.telephony.SmsManager.getDefault()
                sm.sendMultipartTextMessage(no, null, sm.divideMessage(metin), null, null)
                p.edit().putString("uyandi_tarih", bugun + "_sms").apply()
                "gonderildi"
            }
        }
    } catch (e: Exception) { "hata: " + e.message }
    bildirimGoster(c, if (sonuc == "gonderildi") "Annene SMS gönderildi 📩" else "Annene SMS gönderilemedi", if (sonuc == "gonderildi") "Alarmdan 30 dk geçti ve 'uyandım' demedin." else sonuc, "")
}

fun rehberdeBul(c: Context, ad: String): String? {
    val tr = java.util.Locale("tr"); val aranan = ad.trim().lowercase(tr)
    var yakin: String? = null
    c.contentResolver.query(android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { k ->
        while (k.moveToNext()) {
            val n = (k.getString(0) ?: continue).lowercase(tr); val no = k.getString(1) ?: continue
            if (n == aranan) return no
            if (yakin == null && n.contains(aranan)) yakin = no
        }
    }
    return yakin
}
