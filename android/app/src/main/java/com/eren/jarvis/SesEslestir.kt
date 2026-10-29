package com.eren.jarvis

import android.content.Context
import kotlin.math.*

/** Eren'in kendi "Jarvis" kayitlarina gore ses eslestirme (MFCC + DTW). Tamamen telefonda calisir. */
object SesEslestir {
    private const val HIZ = 16000
    private const val PENCERE = 400   // 25 ms
    private const val ADIM = 160      // 10 ms
    private const val FFT = 512
    private const val MEL = 26
    private const val KATSAYI = 13
    private val melFiltre: Array<FloatArray> by lazy { melFiltreleri() }

    private fun hz2mel(f: Double) = 2595 * log10(1 + f / 700)
    private fun mel2hz(m: Double) = 700 * (10.0.pow(m / 2595) - 1)
    private fun melFiltreleri(): Array<FloatArray> {
        val lo = hz2mel(60.0); val hi = hz2mel(7600.0)
        val noktalar = (0 until MEL + 2).map { floor((FFT + 1) * mel2hz(lo + (hi - lo) * it / (MEL + 1)) / HIZ).toInt() }
        return Array(MEL) { m ->
            FloatArray(FFT / 2 + 1) { k ->
                val a = noktalar[m]; val b = noktalar[m + 1]; val c = noktalar[m + 2]
                when { k in a until b && b > a -> (k - a).toFloat() / (b - a); k in b..c && c > b -> (c - k).toFloat() / (c - b); else -> 0f }
            }
        }
    }

    private fun fftGuc(x: DoubleArray): DoubleArray {
        val n = FFT; val re = x.copyOf(n); val im = DoubleArray(n)
        var j = 0
        for (i in 1 until n) { var bit = n shr 1; while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }; j = j xor bit
            if (i < j) { val t = re[i]; re[i] = re[j]; re[j] = t } }
        var len = 2
        while (len <= n) { val ang = -2 * PI / len
            for (i in 0 until n step len) for (k in 0 until len / 2) {
                val wr = cos(ang * k); val wi = sin(ang * k)
                val ur = re[i + k]; val ui = im[i + k]
                val vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi; val vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
                re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi }
            len = len shl 1 }
        return DoubleArray(n / 2 + 1) { (re[it] * re[it] + im[it] * im[it]) / n }
    }

    /** Sesin konusulan kismini (enerjiye gore) kirpar. */
    fun kirp(s: ShortArray): ShortArray {
        val kare = 320
        val en = (0 until s.size / kare).map { b -> var t = 0.0; for (i in b * kare until (b + 1) * kare) t += s[i] * s[i].toDouble(); sqrt(t / kare) }
        if (en.isEmpty()) return s
        val esik = max(en.sorted()[en.size / 5] * 2.5, 250.0)
        val ilk = en.indexOfFirst { it > esik }; val son = en.indexOfLast { it > esik }
        if (ilk < 0 || son <= ilk) return s
        return s.copyOfRange(max(0, ilk - 2) * kare, min(s.size, (son + 3) * kare))
    }

    fun ozellik(sesHam: ShortArray): Array<FloatArray> {
        val s = kirp(sesHam)
        val kareSay = max(1, (s.size - PENCERE) / ADIM + 1)
        val sonuc = Array(kareSay) { FloatArray(KATSAYI) }
        val pencere = DoubleArray(PENCERE)
        for (f in 0 until kareSay) {
            for (i in 0 until PENCERE) {
                val idx = f * ADIM + i
                val v = if (idx < s.size) s[idx] / 32768.0 else 0.0
                val once = if (idx - 1 in s.indices) s[idx - 1] / 32768.0 else 0.0
                pencere[i] = (v - 0.97 * once) * (0.54 - 0.46 * cos(2 * PI * i / (PENCERE - 1)))
            }
            val guc = fftGuc(pencere)
            val logMel = DoubleArray(MEL) { m -> var t = 0.0; val fl = melFiltre[m]; for (k in guc.indices) t += guc[k] * fl[k]; ln(max(t, 1e-10)) }
            for (c in 0 until KATSAYI) { var t = 0.0; for (m in 0 until MEL) t += logMel[m] * cos(PI * c * (m + 0.5) / MEL); sonuc[f][c] = t.toFloat() }
        }
        for (c in 0 until KATSAYI) { val ort = sonuc.map { it[c] }.average().toFloat(); sonuc.forEach { it[c] -= ort } } // ortam/mikrofon farkini sil
        return sonuc
    }

    fun dtw(a: Array<FloatArray>, b: Array<FloatArray>): Float {
        val n = a.size; val m = b.size
        if (n == 0 || m == 0) return Float.MAX_VALUE
        if (n > 3 * m || m > 3 * n) return Float.MAX_VALUE
        var once = FloatArray(m + 1) { Float.MAX_VALUE }; once[0] = 0f
        for (i in 1..n) {
            val simdi = FloatArray(m + 1) { Float.MAX_VALUE }
            for (j in 1..m) {
                var d = 0f; for (c in 1 until KATSAYI) { val x = a[i - 1][c] - b[j - 1][c]; d += x * x }
                d = sqrt(d)
                simdi[j] = d + minOf(once[j], simdi[j - 1], once[j - 1])
            }
            once = simdi
        }
        return once[m] / (n + m)
    }

    // ---- Kayitli sablonlar ----
    private fun dosya(c: Context) = java.io.File(c.filesDir, "ses_sablon.json")
    private var onbellek: List<Array<FloatArray>>? = null
    private var esikOnbellek = 0f

    fun sablonlar(c: Context): List<Array<FloatArray>> {
        onbellek?.let { return it }
        val f = dosya(c); if (!f.exists()) return emptyList()
        return try {
            val j = org.json.JSONObject(f.readText()); esikOnbellek = j.optDouble("esik", 0.0).toFloat()
            val l = j.getJSONArray("sablon")
            (0 until l.length()).map { i -> val s = l.getJSONArray(i); Array(s.length()) { k -> val r = s.getJSONArray(k); FloatArray(r.length()) { r.getDouble(it).toFloat() } } }.also { onbellek = it }
        } catch (_: Exception) { emptyList() }
    }
    fun esik(c: Context): Float { sablonlar(c); return esikOnbellek }
    fun sayi(c: Context) = sablonlar(c).size

    fun kaydet(c: Context, yeni: List<Array<FloatArray>>) {
        // esik: kendi kayitlarinin birbirine uzakliginin ortalamasi * pay
        val d = mutableListOf<Float>()
        for (i in yeni.indices) for (k in i + 1 until yeni.size) d.add(dtw(yeni[i], yeni[k]))
        val ort = if (d.isEmpty()) 30f else d.average().toFloat()
        val j = org.json.JSONObject().put("esik", ort * 1.45)
        val l = org.json.JSONArray()
        yeni.forEach { s -> val a = org.json.JSONArray(); s.forEach { r -> val b = org.json.JSONArray(); r.forEach { b.put(it.toDouble()) }; a.put(b) }; l.put(a) }
        j.put("sablon", l)
        dosya(c).writeText(j.toString())
        onbellek = null
    }
    fun sil(c: Context) { dosya(c).delete(); onbellek = null }

    /** Kayit varsa: bu ses Eren'in "Jarvis"ine benziyor mu? (mesafe, esik) */
    fun benzer(c: Context, ses: ShortArray, pay: Float = 1f): Pair<Boolean, Float> {
        val s = sablonlar(c); if (s.isEmpty()) return true to 0f
        val o = ozellik(ses)
        val enYakin = s.map { dtw(o, it) }.sorted().take(3).average().toFloat()
        return (enYakin <= esik(c) * pay) to enYakin
    }
}
