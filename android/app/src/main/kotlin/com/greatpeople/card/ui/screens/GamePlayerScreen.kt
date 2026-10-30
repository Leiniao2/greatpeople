package com.greatpeople.card.ui.screens

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.greatpeople.card.BuildConfig
import org.json.JSONObject

/** A message the embedded web app posts through `window.gp.postMessage`. */
data class BridgeMessage(val type: String, val slug: String?, val unlockKey: String?, val id: String?) {
    companion object {
        fun parse(json: String): BridgeMessage? = runCatching {
            val o = JSONObject(json)
            BridgeMessage(
                type = o.getString("type"),
                slug = o.optString("slug").takeIf { o.has("slug") },
                unlockKey = o.optString("unlockKey").takeIf { o.has("unlockKey") && !o.isNull("unlockKey") },
                id = o.optString("id").takeIf { o.has("id") },
            )
        }.getOrNull()
    }
}

private class GpBridge(private val onMessage: (BridgeMessage) -> Unit) {
    @JavascriptInterface
    fun postMessage(json: String) {
        BridgeMessage.parse(json)?.let(onMessage)
    }
}

/**
 * Hosts the web app's full-screen play routes (`/play/story/…`,
 * `/play/challenge/…`) in a WebView and relays its bridge messages.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun GamePlayerScreen(
    url: String,
    onMessage: (BridgeMessage) -> Unit,
    onClose: () -> Unit,
) {
    val latestOnMessage by rememberUpdatedState(onMessage)
    BackHandler(onBack = onClose)

    Box(Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    setBackgroundColor(AndroidColor.parseColor("#F3ECDC"))   // paper
                    webViewClient = WebViewClient()
                    addJavascriptInterface(GpBridge { msg -> post { latestOnMessage(msg) } }, "gp")
                    if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
                    loadUrl(url)
                }
            },
            update = { view -> if (view.url?.substringBefore('#') != url.substringBefore('#')) view.loadUrl(url) },
        )
    }
}

/** Play-route URLs; the session token rides in the fragment, never in the request line. */
object PlayUrls {
    fun story(slug: String, token: String?) = embed("/play/story/$slug", token)
    fun challenge(id: String, token: String?) = embed("/play/challenge/$id", token)
    private fun embed(path: String, token: String?): String {
        val base = BuildConfig.WEB_BASE_URL.trimEnd('/')
        val fragment = token?.let { "#token=" + android.net.Uri.encode(it) } ?: ""
        return "$base$path?embed=1$fragment"
    }
}
