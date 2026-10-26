package com.eren.jarvis

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        alarmKur(c) // yarinin alarmi
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
