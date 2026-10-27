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
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: android.webkit.WebResourceRequest): Boolean {
                val u = req.url
                if (u.host == android.net.Uri.parse(JARVIS_URL).host) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
        }
        tts = TextToSpeech(this) { st ->
            if (st == TextToSpeech.SUCCESS) {
                tts?.language = Locale("tr", "TR")
                tts?.setSpeechRate(1.05f)
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) {}
                    override fun onDone(id: String?) { bitir(id) }
                    @Deprecated("eski") override fun onError(id: String?) { bitir(id) }
                })
                ttsHazir = true
                synchronized(bekleyen) { bekleyen.forEach { (m, id) -> soyle(m, id) }; bekleyen.clear() }
            }
        }
        web.addJavascriptInterface(Kopru(), "Android")
        setContentView(web)
        yukle(intent)
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
    }

    override fun onDestroy() {
        if (eskiSes >= 0) {
            getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_MUSIC, eskiSes, 0)
        }
        tts?.shutdown()
        web.destroy()
        servisKomutu(this, WakeService.DEVAM)
        super.onDestroy()
    }
}
