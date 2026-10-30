package com.eren.jarvis

import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Color
import android.media.AudioManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

/** Kilit ekraninin ustunde acilan Jarvis ekrani (web sayfasi). */
class JarvisActivity : Activity() {
    private lateinit var web: WebView
    private var eskiSes = -1
    private var tts: TextToSpeech? = null
    private var ttsHazir = false
    private val bekleyen = mutableListOf<Pair<String, String>>()
    private var alarmModu = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        getSystemService(NotificationManager::class.java).cancel(7)
        servisKomutu(this, WakeService.DURAKLAT)

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#05080f"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.settings.setGeolocationEnabled(true)
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: android.webkit.WebResourceRequest): Boolean {
                val u = req.url
                if (u.host == android.net.Uri.parse(JARVIS_URL).host) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
                return true
            }
            // Sayfa (WebView) cokerse uygulama kapanmasin: ekrani bastan kur
            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                try { (view.parent as? android.view.ViewGroup)?.removeView(view); view.destroy() } catch (_: Exception) {}
                runOnUiThread { recreate() }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: android.webkit.GeolocationPermissions.Callback) {
                callback.invoke(origin, true, false)
            }
        }
        ttsBaslat("com.google.android.tts")
        web.addJavascriptInterface(Kopru(), "Android")
        setContentView(web)
        // Harita icin konum izni (bir kez sorulur)
        val pr = getSharedPreferences("jarvis", MODE_PRIVATE)
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED && !pr.getBoolean("konum_soruldu", false)) {
            pr.edit().putBoolean("konum_soruldu", true).apply()
            requestPermissions(arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION), 7)
        }
        yukle(intent)
    }

    private fun ttsBaslat(motor: String?) {
        tts = TextToSpeech(this, { st ->
            if (st != TextToSpeech.SUCCESS) {
                if (motor != null) runOnUiThread { tts?.shutdown(); ttsBaslat(null) }
                return@TextToSpeech
            }
            val sonuc = tts?.setLanguage(Locale("tr", "TR")) ?: TextToSpeech.LANG_NOT_SUPPORTED
            if (sonuc < 0 && motor != null) { runOnUiThread { tts?.shutdown(); ttsBaslat(null) }; return@TextToSpeech }
            if (sonuc < 0) runOnUiThread {
                web.evaluateJavascript("gunlukYaz && gunlukYaz('','Telefonda Türkçe ses yok: Ayarlar > Metin okuma > Google > Türkçe sesi indir')", null)
            }
            run {
                tts?.setSpeechRate(1.05f)
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) {}
                    override fun onDone(id: String?) { bitir(id) }
                    @Deprecated("eski") override fun onError(id: String?) { bitir(id) }
                })
                ttsHazir = true
                synchronized(bekleyen) { bekleyen.forEach { (m, id) -> soyle(m, id) }; bekleyen.clear() }
            }
        }, motor)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        yukle(intent)
    }

    private fun yukle(i: Intent?) {
        val mod = i?.getStringExtra("mod") ?: ""
        val am = getSystemService(AudioManager::class.java)
        alarmModu = mod.startsWith("alarm")
        if (alarmModu) {
            if (eskiSes < 0) eskiSes = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            am.setStreamVolume(AudioManager.STREAM_MUSIC, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), 0)
            try { am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0) } catch (_: Exception) {}
        }
        web.loadUrl(if (mod.isEmpty()) JARVIS_URL else JARVIS_URL + "?mod=" + mod)
    }

    private fun bitir(id: String?) {
        if (id == null) return
        runOnUiThread { web.evaluateJavascript("window.__konusBitti && window.__konusBitti('" + id + "')", null) }
    }

    private fun soyle(metin: String, id: String) {
        val p = Bundle()
        if (alarmModu) p.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM)
        p.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f)
        tts?.speak(metin, TextToSpeech.QUEUE_FLUSH, p, id)
    }

    inner class Kopru {
        @JavascriptInterface fun konus(metin: String, id: String) {
            if (!ttsHazir) { synchronized(bekleyen) { bekleyen.add(metin to id) }; return }
            soyle(metin, id)
        }
        @JavascriptInterface fun sustur() { tts?.stop() }
        @JavascriptInterface fun uyku() {
            getSharedPreferences("jarvis", MODE_PRIVATE).edit().putBoolean("uyku", true).putLong("uyku_zaman", System.currentTimeMillis()).apply()
            runOnUiThread { finish() }
        }
        @JavascriptInterface fun ac(url: String) {
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
            }
        }
        @JavascriptInterface fun bitti() { runOnUiThread { finish() } }
        @JavascriptInterface fun sifre(): String = Ayarlar.sifre(this@JarvisActivity)
        @JavascriptInterface fun ayarlar() {
            runOnUiThread {
                startActivity(Intent(this@JarvisActivity, MainActivity::class.java).putExtra("ayar", true))
            }
        }
        @JavascriptInterface fun hatirlaticiKur(json: String) { hatirlaticilariKur(this@JarvisActivity, json) }
        @JavascriptInterface fun uyandim() {
            val bugun = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
            getSharedPreferences("jarvis", MODE_PRIVATE).edit().putString("uyandi_tarih", bugun).apply()
        }
        /** Rehberde kisiyi bul (ya da numara) ve ara. Sonuc: "aradim:Ad" / "yok" / "izin" */
        @JavascriptInterface fun ara(kim: String): String {
            val c = this@JarvisActivity
            val hedef = kim.trim()
            var numara = if (Regex("^[+0-9 ()-]{5,}$").matches(hedef)) hedef else ""
            var ad = hedef
            if (numara.isEmpty()) {
                if (c.checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    runOnUiThread { requestPermissions(arrayOf(android.Manifest.permission.READ_CONTACTS, android.Manifest.permission.CALL_PHONE), 8) }
                    return "izin"
                }
                val tr = java.util.Locale("tr")
                val aranan = hedef.lowercase(tr)
                var enIyi: Pair<String, String>? = null
                c.contentResolver.query(android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    arrayOf(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { k ->
                    while (k.moveToNext()) {
                        val n = k.getString(0) ?: continue; val no = k.getString(1) ?: continue
                        val nl = n.lowercase(tr)
                        if (nl == aranan) { enIyi = n to no; break }
                        if (enIyi == null && (nl.contains(aranan) || aranan.contains(nl))) enIyi = n to no
                    }
                }
                val b = enIyi ?: return "yok"
                ad = b.first; numara = b.second
            }
            val izinli = c.checkSelfPermission(android.Manifest.permission.CALL_PHONE) == android.content.pm.PackageManager.PERMISSION_GRANTED
            val niyet = Intent(if (izinli) Intent.ACTION_CALL else Intent.ACTION_DIAL, android.net.Uri.parse("tel:" + numara)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runOnUiThread { try { startActivity(niyet) } catch (_: Exception) {} }
            return "aradim:" + ad
        }
    }

    override fun onDestroy() {
        if (eskiSes >= 0) {
            getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_MUSIC, eskiSes, 0)
        }
        tts?.shutdown()
        web.destroy()
        val p = getSharedPreferences("jarvis", MODE_PRIVATE)
        // Uyku modu en fazla 10 saat surer (alarm calmasa bile kendiliginden biter)
        if (p.getBoolean("uyku", false) && System.currentTimeMillis() - p.getLong("uyku_zaman", 0) > 10 * 3600 * 1000L) p.edit().putBoolean("uyku", false).apply()
        if (!p.getBoolean("uyku", false)) servisKomutu(this, WakeService.DEVAM)
        else servisKomutu(this, WakeService.DURAKLAT)
        super.onDestroy()
    }
}
