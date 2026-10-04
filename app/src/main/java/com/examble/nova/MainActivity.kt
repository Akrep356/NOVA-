package com.nova.ai

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.media.MediaPlayer
import android.util.Base64
import java.io.File
import java.io.FileOutputStream

class MainActivity : Activity() {

    private var mediaPlayer: MediaPlayer? = null

    private lateinit var musicWebView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        createNovaInterface()

        setupMusicGen()
    }

    private fun createNovaInterface() {

        val root = LinearLayout(this)

        root.orientation =
            LinearLayout.VERTICAL

        root.setBackgroundColor(
            Color.rgb(12, 12, 20)
        )

        root.setPadding(
            dp(20),
            dp(24),
            dp(20),
            dp(20)
        )

        val title = TextView(this)

        title.text = "NOVA"

        title.textSize = 32f

        title.setTextColor(
            Color.WHITE
        )

        title.setTypeface(
            Typeface.DEFAULT,
            Typeface.BOLD
        )

        title.gravity =
            Gravity.CENTER

        root.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        val subtitle = TextView(this)

        subtitle.text =
            "AI Müzik Video & Sanatçı Yarat"

        subtitle.textSize = 16f

        subtitle.setTextColor(
            Color.LTGRAY
        )

        subtitle.gravity =
            Gravity.CENTER

        root.addView(
            subtitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val prompt = EditText(this)

        prompt.hint =
            "Nasıl bir şarkı oluşturmak istiyorsun?"

        prompt.setHintTextColor(
            Color.GRAY
        )

        prompt.setTextColor(
            Color.WHITE
        )

        prompt.setSingleLine(false)

        prompt.gravity =
            Gravity.TOP

        root.addView(
            prompt,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(130)
            )
        )

        val musicButton =
            Button(this)

        musicButton.text =
            "MÜZİK OLUŞTUR"

        musicButton.setOnClickListener {

            val userPrompt =
                prompt.text
                    .toString()
                    .trim()

            if (userPrompt.isEmpty()) {

                Toast.makeText(
                    this,
                    "Önce nasıl bir müzik istediğini yaz.",
                    Toast.LENGTH_SHORT
                ).show()

                return@setOnClickListener
            }

            generateMusic(userPrompt)
        }

        root.addView(
            musicButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        val stopButton =
            Button(this)

        stopButton.text =
            "MÜZİĞİ DURDUR"

        stopButton.setOnClickListener {

            stopMusic()
        }

        root.addView(
            stopButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        val videoButton =
            Button(this)

        videoButton.text =
            "VİDEO OLUŞTUR"

        videoButton.setOnClickListener {

            Toast.makeText(
                this,
                "Video oluşturma bölümü hazırlanıyor.",
                Toast.LENGTH_SHORT
            ).show()
        }

        root.addView(
            videoButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        musicWebView =
            WebView(this)

        musicWebView.visibility =
            WebView.GONE

        root.addView(
            musicWebView,
            LinearLayout.LayoutParams(
                1,
                1
            )
        )

        setContentView(root)
    }

    private fun setupMusicGen() {

        musicWebView.settings.javaScriptEnabled =
            true

        musicWebView.settings.domStorageEnabled =
            true

        musicWebView.settings.allowFileAccess =
            true

        musicWebView.settings.allowContentAccess =
            true

        musicWebView.settings.cacheMode =
            WebSettings.LOAD_DEFAULT

        musicWebView.webViewClient =
            WebViewClient()

        musicWebView.addJavascriptInterface(
            MusicGenBridge(),
            "AndroidBridge"
        )

        musicWebView.loadUrl(
            "file:///android_asset/musicgen.html"
        )
    }

    private fun generateMusic(
        userPrompt: String
    ) {

        Toast.makeText(
            this,
            "MusicGen hazırlanıyor...",
            Toast.LENGTH_SHORT
        ).show()

        musicWebView.evaluateJavascript(
            "javascript:generateMusic(" +
                    JSONObjectEscape(userPrompt) +
                    ")",
            null
        )
    }

    private fun stopMusic() {

        try {

            mediaPlayer?.stop()

        } catch (_: Exception) {
        }

        mediaPlayer?.release()

        mediaPlayer = null

        Toast.makeText(
            this,
            "Müzik durduruldu.",
            Toast.LENGTH_SHORT
        ).show()
    }

    inner class MusicGenBridge {

        @JavascriptInterface
        fun onStatus(
            message: String
        ) {

            runOnUiThread {

                Toast.makeText(
                    this@MainActivity,
                    message,
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        @JavascriptInterface
        fun onMusicGenerated(
            base64Audio: String
        ) {

            runOnUiThread {

                try {

                    val audioBytes =
                        Base64.decode(
                            base64Audio,
                            Base64.DEFAULT
                        )

                    val audioFile =
                        File(
                            cacheDir,
                            "nova_music.wav"
                        )

                    FileOutputStream(
                        audioFile
                    ).use { output ->

                        output.write(
                            audioBytes
                        )
                    }

                    mediaPlayer?.release()

                    mediaPlayer =
                        MediaPlayer()

                    mediaPlayer?.setDataSource(
                        audioFile.absolutePath
                    )

                    mediaPlayer?.prepare()

                    mediaPlayer?.start()

                    Toast.makeText(
                        this@MainActivity,
                        "Müzik hazır ve çalıyor.",
                        Toast.LENGTH_SHORT
                    ).show()

                } catch (error: Exception) {

                    Toast.makeText(
                        this@MainActivity,
                        "Ses oynatma hatası: " +
                                error.message,
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    private fun JSONObjectEscape(
        text: String
    ): String {

        return "\"" +
                text
                    .replace(
                        "\\",
                        "\\\\"
                    )
                    .replace(
                        "\"",
                        "\\\""
                    )
                    .replace(
                        "\n",
                        "\\n"
                    )
                    .replace(
                        "\r",
                        "\\r"
                    )
                    .replace(
                        "\t",
                        "\\t"
                    ) +
                "\""
    }

    private fun dp(
        value: Int
    ): Int {

        return (
            value *
                    resources.displayMetrics.density
        ).toInt()
    }

    override fun onDestroy() {

        mediaPlayer?.release()

        mediaPlayer = null

        musicWebView.destroy()

        super.onDestroy()
    }
}
