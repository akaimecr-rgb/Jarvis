package com.eren.jarvis

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var durum: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val izinler = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) izinler.add(Manifest.permission.POST_NOTIFICATIONS)
        requestPermissions(izinler.toTypedArray(), 1)

        val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 64, 48, 48) }
        fun yazi(t: String, boyut: Float = 16f) = TextView(this).apply {
            text = t; textSize = boyut; setTextColor(Color.WHITE); setPadding(0, 24, 0, 8)
        }
        fun kutu(ipucu: String, deger: String, gizli: Boolean = false) = EditText(this).apply {
            hint = ipucu; setText(deger); setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
            if (gizli) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        fun dugme(t: String, f: () -> Unit) = Button(this).apply { text = t; setOnClickListener { f() } }

        k.addView(yazi("Jarvis", 30f).apply { gravity = Gravity.CENTER })
        durum = yazi("")
        k.addView(durum)
        k.addView(yazi("Picovoice anahtarı (console.picovoice.ai)"))
        val anahtar = kutu("AccessKey", Ayarlar.anahtar(this), true); k.addView(anahtar)
        k.addView(yazi("Jarvis şifresi (APP_SECRET)"))
        val sifre = kutu("şifre", Ayarlar.sifre(this), true); k.addView(sifre)
        k.addView(yazi("Sabah alarmı saati"))
        val saat = kutu("08:30", Ayarlar.alarmSaati(this)); k.addView(saat)
        val alarmAcik = Switch(this).apply { text = "Sabah alarmı açık"; setTextColor(Color.WHITE); isChecked = Ayarlar.alarmAcik(this@MainActivity) }
        k.addView(alarmAcik)

        k.addView(dugme("1) Kaydet ve Jarvis'i başlat") {
            Ayarlar.kaydet(this, anahtar.text.toString(), sifre.text.toString(), saat.text.toString(), alarmAcik.isChecked)
            servisKomutu(this, WakeService.DURDUR)
            servisKomutu(this, WakeService.BASLAT)
            alarmKur(this)
            k.postDelayed({ guncelle() }, 1500)
        })
        k.addView(dugme("2) Kilit ekranında açılma izni (Üstte göster)") {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        k.addView(dugme("3) Pil kısıtlamasını kaldır") {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        })
        if (Build.VERSION.SDK_INT >= 34) k.addView(dugme("4) Tam ekran bildirim izni") {
            startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
        })
        k.addView(dugme("Jarvis'i şimdi aç") { jarvisiAc(this, "serbest") })
        k.addView(dugme("Alarmı şimdi dene") { jarvisiAc(this, "alarm") })
        k.addView(dugme("Dinlemeyi kapat") { servisKomutu(this, WakeService.DURDUR); k.postDelayed({ guncelle() }, 800) })

        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#05080f")); addView(k) })
    }

    override fun onResume() { super.onResume(); guncelle() }

    private fun guncelle() {
        val pm = getSystemService(PowerManager::class.java)
        val satirlar = listOf(
            "Dinleme: " + WakeService.durum,
            "Kilit ekranı izni: " + (if (Settings.canDrawOverlays(this)) "✓" else "✗ (2. düğme)"),
            "Pil kısıtlaması: " + (if (pm.isIgnoringBatteryOptimizations(packageName)) "kaldırıldı ✓" else "✗ (3. düğme)"),
            "Alarm: " + (if (Ayarlar.alarmAcik(this)) "her gün " + Ayarlar.alarmSaati(this) else "kapalı"),
        )
        durum.text = satirlar.joinToString("\n")
    }
}
