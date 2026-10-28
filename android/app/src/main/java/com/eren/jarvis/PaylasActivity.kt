package com.eren.jarvis

import android.app.Activity
import android.app.Notification
import android.app.NotificationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.content.Intent
import android.widget.Toast

/** Telefondaki bir videoyu "Paylas > Jarvis" ile Drive'a (Jarvis/ham) yukler, sonra Jarvis'i acar. */
class PaylasActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if ((intent.type ?: "").startsWith("text/")) {
            val metin = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            if (metin.isNotBlank()) jarvisiAc(applicationContext, "metin&m=" + Uri.encode(metin.take(1500)))
            finish(); return
        }
        val uri: Uri? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                        else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
        if (uri == null) { finish(); return }
        Toast.makeText(this, "Jarvis videoyu Drive'a yüklüyor...", Toast.LENGTH_LONG).show()
        val uygulama = applicationContext
        Thread { yukle(uygulama, uri) }.start()
        finish()
    }

    private fun yukle(c: android.content.Context, uri: Uri) {
        kanallariKur(c)
        val nm = c.getSystemService(NotificationManager::class.java)
        fun bildir(metin: String, ilerleme: Int = -1) {
            val b = Notification.Builder(c, KANAL_ACIL).setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("Jarvis • Drive'a yükleme").setContentText(metin)
            if (ilerleme in 0..100) b.setProgress(100, ilerleme, false).setOngoing(true)
            nm.notify(4242, b.build())
        }
        try {
            var ad = "video.mp4"; var boyut = 0L
            c.contentResolver.query(uri, null, null, null, null)?.use { k ->
                if (k.moveToFirst()) {
                    val ai = k.getColumnIndex(OpenableColumns.DISPLAY_NAME); val bi = k.getColumnIndex(OpenableColumns.SIZE)
                    if (ai >= 0) ad = k.getString(ai) ?: ad
                    if (bi >= 0) boyut = k.getLong(bi)
                }
            }
            val tur = c.contentResolver.getType(uri) ?: "video/mp4"
            bildir("Hazırlanıyor: $ad", 0)
            val bas = java.net.URL(JARVIS_URL + "yukleme-baslat").openConnection() as java.net.HttpURLConnection
            bas.requestMethod = "POST"; bas.doOutput = true
            bas.setRequestProperty("x-secret", Ayarlar.sifre(c)); bas.setRequestProperty("content-type", "application/json")
            bas.outputStream.use { it.write(org.json.JSONObject().put("ad", ad).put("boyut", boyut).put("tur", tur).toString().toByteArray()) }
            val cevap = org.json.JSONObject((if (bas.responseCode < 400) bas.inputStream else bas.errorStream).bufferedReader().readText())
            val hedef = cevap.optString("url")
            if (hedef.isEmpty()) { bildir("Olmadı: " + cevap.optString("hata", "bilinmeyen hata")); return }
            val put = java.net.URL(hedef).openConnection() as java.net.HttpURLConnection
            put.requestMethod = "PUT"; put.doOutput = true
            put.setRequestProperty("content-type", tur)
            if (boyut > 0) put.setFixedLengthStreamingMode(boyut) else put.setChunkedStreamingMode(1 shl 20)
            c.contentResolver.openInputStream(uri)!!.use { giris ->
                put.outputStream.use { cikis ->
                    val tampon = ByteArray(1 shl 16); var toplam = 0L; var son = -1; var n: Int
                    while (giris.read(tampon).also { n = it } > 0) {
                        cikis.write(tampon, 0, n); toplam += n
                        val y = if (boyut > 0) (toplam * 100 / boyut).toInt() else 0
                        if (y != son && y % 5 == 0) { son = y; bildir("Yükleniyor: $ad", y) }
                    }
                }
            }
            if (put.responseCode !in 200..201) { bildir("Yükleme başarısız (${put.responseCode})"); return }
            nm.cancel(4242)
            bildir("Yüklendi: $ad. Jarvis açılıyor.")
            jarvisiAc(c, "paylas&ad=" + Uri.encode(ad))
        } catch (e: Exception) {
            bildir("Olmadı: " + (e.message ?: e.javaClass.simpleName))
        }
    }
}
