package com.eren.jarvis

import android.service.quicksettings.TileService

/** Bildirim panelindeki hizli ayar kutucugu: dokununca Jarvis dinlemeye baslar. */
class JarvisTile : TileService() {
    override fun onClick() {
        super.onClick()
        jarvisiAc(applicationContext, "serbest")
    }
}
