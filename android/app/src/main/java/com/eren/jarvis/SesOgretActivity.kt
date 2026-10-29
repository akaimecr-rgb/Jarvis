package com.eren.jarvis

import android.app.Activity
import android.graphics.Color
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** "Sesimi ogret": Eren 10 kez "Jarvis" der, telefon onun soyleyisini ogrenir. */
class SesOgretActivity : Activity() {
    private val kayitlar = mutableListOf<Array<FloatArray>>()
    private lateinit var yazi: TextView
    private lateinit var dugme: Button
    private val HEDEF = 10

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        servisKomutu(this, WakeService.DURAKLAT)
        val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(56, 120, 56, 56); setBackgroundColor(Color.parseColor("#05080f")) }
        k.addView(TextView(this).apply { text = "SESİMİ ÖĞRET"; textSize = 26f; setTextColor(Color.parseColor("#22d3ee")) })
        yazi = TextView(this).apply { textSize = 17f; setTextColor(Color.parseColor("#cffafe")); setPadding(0, 40, 0, 40)
            text = "Düğmeye bas, bip beklemeden normal sesinle bir kez \"Jarvis\" de. Toplam $HEDEF kez.\nŞu an kayıtlı: ${SesEslestir.sayi(this@SesOgretActivity)} örnek." }
        k.addView(yazi)
        dugme = Button(this).apply { text = "KAYDET (1/$HEDEF)"; textSize = 20f; setOnClickListener { kaydet() } }
        k.addView(dugme)
        k.addView(Button(this).apply { text = "Kayıtları sil (eski usule dön)"; setOnClickListener { SesEslestir.sil(this@SesOgretActivity); yazi.text = "Silindi. Jarvis artık sadece kelimeye bakıyor." } })
        k.addView(Button(this).apply { text = "Kapat"; setOnClickListener { finish() } })
        setContentView(k)
    }

    private fun kaydet() {
        dugme.isEnabled = false; dugme.text = "DİNLİYORUM... \"Jarvis\" de"
        Thread {
            val ses = kayit(1800)
            val o = SesEslestir.ozellik(ses)
            runOnUiThread {
                if (o.size < 20) { yazi.text = "Sesini duyamadım, biraz daha yüksek ve net söyle." }
                else { kayitlar.add(o); yazi.text = "Güzel! ${kayitlar.size}/$HEDEF tamam." }
                if (kayitlar.size >= HEDEF) {
                    SesEslestir.kaydet(this, kayitlar)
                    yazi.text = "Bitti! Jarvis artık senin \"Jarvis\" deyişini tanıyor. Başkaları ya da TV benzer bir şey dese de açılmaz.\nOlmazsa tekrar kaydedebilirsin."
                    dugme.text = "TAMAM"; dugme.isEnabled = true; dugme.setOnClickListener { finish() }
                } else { dugme.text = "KAYDET (${kayitlar.size + 1}/$HEDEF)"; dugme.isEnabled = true }
            }
        }.start()
    }

    private fun kayit(ms: Int): ShortArray {
        val n = 16000 * ms / 1000
        val boy = maxOf(AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), 4096)
        @Suppress("MissingPermission")
        val ar = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, boy)
        val buf = ShortArray(n); var o = 0
        ar.startRecording()
        while (o < n) { val r = ar.read(buf, o, minOf(1600, n - o)); if (r <= 0) break; o += r }
        ar.stop(); ar.release()
        return buf
    }

    override fun onDestroy() { servisKomutu(this, WakeService.DEVAM); super.onDestroy() }
}
