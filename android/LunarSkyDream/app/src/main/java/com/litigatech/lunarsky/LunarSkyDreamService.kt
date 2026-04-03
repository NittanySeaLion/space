package com.litigatech.lunarsky

import android.annotation.SuppressLint
import android.service.dreams.DreamService
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class LunarSkyDreamService : DreamService() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        // Full-screen, non-interactive dream (touch exits the screensaver)
        isFullscreen = true
        isInteractive = false

        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val loc = prefs.getString(PREF_LOCATION, "shackleton") ?: "shackleton"
        val url = "https://space.litigatech.com/screensaver?loc=$loc"

        val webView = WebView(this).apply {
            webViewClient = WebViewClient()          // open links in-app, not browser
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true             // needed by canvas JS
                setSupportZoom(false)
                displayZoomControls = false
                builtInZoomControls = false
                cacheMode = WebSettings.LOAD_DEFAULT // use HTTP cache headers
            }
            loadUrl(url)
        }

        setContentView(webView)
    }

    companion object {
        const val PREFS_NAME = "lunar_sky_prefs"
        const val PREF_LOCATION = "location"
    }
}
