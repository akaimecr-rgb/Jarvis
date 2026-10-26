package com.eren.jarvis

import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Color
import android.media.AudioManager
import android.os.Bundle
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
        web.webViewClient = WebViewClient()
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
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
        val mod = i?.getStringExtra("mod") ?: "serbest"
        val am = getSystemService(AudioManager::class.java)
        if (mod == "alarm") {
            if (eskiSes < 0) eskiSes = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            am.setStreamVolume(AudioManager.STREAM_MUSIC, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), 0)
        }
        web.loadUrl(JARVIS_URL + "?mod=" + mod)
    }

    inner class Kopru {
        @JavascriptInterface fun bitti() { runOnUiThread { finish() } }
        @JavascriptInterface fun sifre(): String = Ayarlar.sifre(this@JarvisActivity)
    }

    override fun onDestroy() {
        if (eskiSes >= 0) {
            getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_MUSIC, eskiSes, 0)
        }
        web.destroy()
        servisKomutu(this, WakeService.DEVAM)
        super.onDestroy()
    }
}
