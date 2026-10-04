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
import android.content.ContentValues
import android.provider.MediaStore
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.io.ByteArrayOutputStream

class MainActivity : Activity() {

    private var mediaPlayer: MediaPlayer? = null

    private var generatedAudioFile: File? = null

    private lateinit var musicWebView: WebView

    private var lyricsWebView: WebView? = null

    private lateinit var mainRoot: LinearLayout

    private var mainPrompt: EditText? = null

    private val audioChunks =
        ArrayList<ByteArray>()

    private var audioSampleRate = 32000

    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(savedInstanceState)

        createNovaInterface()

        setupMusicGen()
    }

    private fun createNovaInterface() {

        val root = LinearLayout(this)

        mainRoot = root

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

        mainPrompt = prompt

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

        // =========================================================
        // AI ŞARKI SÖZÜ OLUŞTUR
        // =========================================================

        val lyricsButton =
            Button(this)

        lyricsButton.text =
            "🎤 ŞARKI SÖZÜ OLUŞTUR"

        lyricsButton.setOnClickListener {

            openLyricsGenerator()
        }

        root.addView(
            lyricsButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // =========================================================
        // MÜZİK OLUŞTUR
        // =========================================================

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

            generateMusic(
                userPrompt
            )
        }

        root.addView(
            musicButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // =========================================================
        // OYNAT
        // =========================================================

        val playButton =
            Button(this)

        playButton.text =
            "▶ OYNAT"

        playButton.setOnClickListener {

            playMusic()
        }

        root.addView(
            playButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // =========================================================
        // DURAKLAT / DEVAM ET
        // =========================================================

        val pauseButton =
            Button(this)

        pauseButton.text =
            "⏸ DURAKLAT / DEVAM ET"

        pauseButton.setOnClickListener {

            pauseResumeMusic()
        }

        root.addView(
            pauseButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // =========================================================
        // DURDUR
        // =========================================================

        val stopButton =
            Button(this)

        stopButton.text =
            "⏹ DURDUR"

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

        // =========================================================
        // TELEFONA KAYDET
        // =========================================================

        val saveButton =
            Button(this)

        saveButton.text =
            "💾 TELEFONA KAYDET"

        saveButton.setOnClickListener {

            saveMusicToPhone()
        }

        root.addView(
            saveButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // =========================================================
        // VİDEO OLUŞTUR
        // =========================================================

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

        // =========================================================
        // MUSICGEN WEBVIEW
        // =========================================================

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

    // =============================================================
    // AI ŞARKI SÖZÜ EKRANI
    // =============================================================

    private fun openLyricsGenerator() {

        val webView =
            WebView(this)

        lyricsWebView =
            webView

        webView.settings.javaScriptEnabled =
            true

        webView.settings.domStorageEnabled =
            true

        webView.settings.allowFileAccess =
            true

        webView.settings.allowContentAccess =
            true

        webView.settings.cacheMode =
            WebSettings.LOAD_DEFAULT

        webView.webViewClient =
            WebViewClient()

        webView.addJavascriptInterface(
            LyricsBridge(),
            "AndroidBridge"
        )

        webView.setBackgroundColor(
            Color.rgb(12, 12, 20)
        )

        webView.loadUrl(
            "file:///android_asset/lyrics.html"
        )

        setContentView(webView)
    }

    // =============================================================
    // ŞARKI SÖZÜ BRIDGE
    // =============================================================

    inner class LyricsBridge {

        @JavascriptInterface
        fun onLyricsStatus(
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
        fun onLyricsGenerated(
            lyrics: String
        ) {

            runOnUiThread {

                Toast.makeText(
                    this@MainActivity,
                    "Şarkı sözleri hazır.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        @JavascriptInterface
        fun onLyricsError(
            message: String
        ) {

            runOnUiThread {

                Toast.makeText(
                    this@MainActivity,
                    "Şarkı sözü hatası: " +
                            message,
                    Toast.LENGTH_LONG
                ).show()
            }
        }

        @JavascriptInterface
        fun onLyricsMusicRequested(
            lyrics: String
        ) {

            runOnUiThread {

                val cleanLyrics =
                    lyrics.trim()

                if (cleanLyrics.isEmpty()) {

                    Toast.makeText(
                        this@MainActivity,
                        "Şarkı sözleri boş.",
                        Toast.LENGTH_SHORT
                    ).show()

                    return@runOnUiThread
                }

                mainPrompt?.setText(
                    cleanLyrics
                )

                lyricsWebView?.destroy()

                lyricsWebView = null

                setContentView(
                    mainRoot
                )

                Toast.makeText(
                    this@MainActivity,
                    "Şarkı sözleri müzik sistemine gönderildi.",
                    Toast.LENGTH_LONG
                ).show()

                generateMusic(
                    cleanLyrics
                )
            }
        }
    }

    // =============================================================
    // MUSICGEN
    // =============================================================

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

        audioChunks.clear()

        generatedAudioFile = null

        mediaPlayer?.release()

        mediaPlayer = null

        Toast.makeText(
            this,
            "Yaklaşık 30 saniyelik müzik hazırlanıyor...",
            Toast.LENGTH_LONG
        ).show()

        musicWebView.evaluateJavascript(
            "javascript:generateMusic(" +
                    JSONObjectEscape(
                        userPrompt
                    ) +
                    ")",
            null
        )
    }

    // =============================================================
    // MÜZİK OYNAT
    // =============================================================

    private fun playMusic() {

        val file =
            generatedAudioFile

        if (
            file == null ||
            !file.exists()
        ) {

            Toast.makeText(
                this,
                "Önce bir müzik oluştur.",
                Toast.LENGTH_SHORT
            ).show()

            return
        }

        try {

            if (mediaPlayer == null) {

                mediaPlayer =
                    MediaPlayer()

                mediaPlayer?.setDataSource(
                    file.absolutePath
                )

                mediaPlayer?.prepare()

                mediaPlayer?.setOnCompletionListener {

                    Toast.makeText(
                        this,
                        "Müzik tamamlandı.",
                        Toast.LENGTH_SHORT
                    ).show()
                }

                mediaPlayer?.start()

            } else {

                if (
                    mediaPlayer?.isPlaying == false
                ) {

                    mediaPlayer?.start()
                }
            }

            Toast.makeText(
                this,
                "Müzik çalıyor.",
                Toast.LENGTH_SHORT
            ).show()

        } catch (error: Exception) {

            Toast.makeText(
                this,
                "Müzik oynatma hatası: " +
                        error.message,
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // =============================================================
    // DURAKLAT / DEVAM ET
    // =============================================================

    private fun pauseResumeMusic() {

        val player =
            mediaPlayer

        if (player == null) {

            Toast.makeText(
                this,
                "Önce bir müzik oluştur.",
                Toast.LENGTH_SHORT
            ).show()

            return
        }

        try {

            if (player.isPlaying) {

                player.pause()

                Toast.makeText(
                    this,
                    "Müzik duraklatıldı.",
                    Toast.LENGTH_SHORT
                ).show()

            } else {

                player.start()

                Toast.makeText(
                    this,
                    "Müzik devam ediyor.",
                    Toast.LENGTH_SHORT
                ).show()
            }

        } catch (error: Exception) {

            Toast.makeText(
                this,
                "Oynatma hatası: " +
                        error.message,
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // =============================================================
    // DURDUR
    // =============================================================

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

    // =============================================================
    // TELEFONA KAYDET
    // =============================================================

    private fun saveMusicToPhone() {

        val sourceFile =
            generatedAudioFile

        if (
            sourceFile == null ||
            !sourceFile.exists()
        ) {

            Toast.makeText(
                this,
                "Önce bir müzik oluştur.",
                Toast.LENGTH_SHORT
            ).show()

            return
        }

        try {

            val resolver =
                contentResolver

            val values =
                ContentValues().apply {

                    put(
                        MediaStore.Downloads.DISPLAY_NAME,
                        "NOVA_Muzik_${System.currentTimeMillis()}.wav"
                    )

                    put(
                        MediaStore.Downloads.MIME_TYPE,
                        "audio/wav"
                    )

                    if (
                        Build.VERSION.SDK_INT >=
                        Build.VERSION_CODES.Q
                    ) {

                        put(
                            MediaStore.Downloads.IS_PENDING,
                            1
                        )
                    }
                }

            val uri =
                resolver.insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    values
                )

            if (uri == null) {

                Toast.makeText(
                    this,
                    "Dosya kaydedilemedi.",
                    Toast.LENGTH_LONG
                ).show()

                return
            }

            resolver
                .openOutputStream(uri)
                .use { output ->

                    sourceFile
                        .inputStream()
                        .use { input ->

                            input.copyTo(
                                output!!
                            )
                        }
                }

            if (
                Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.Q
            ) {

                val updateValues =
                    ContentValues().apply {

                        put(
                            MediaStore.Downloads.IS_PENDING,
                            0
                        )
                    }

                resolver.update(
                    uri,
                    updateValues,
                    null,
                    null
                )
            }

            Toast.makeText(
                this,
                "Müzik telefona kaydedildi.",
                Toast.LENGTH_LONG
            ).show()

        } catch (error: Exception) {

            Toast.makeText(
                this,
                "Kaydetme hatası: " +
                        error.message,
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // =============================================================
    // 3 PARÇAYI BİRLEŞTİREREK WAV OLUŞTUR
    // =============================================================

    private fun createFinalWav() {

        if (
            audioChunks.isEmpty()
        ) {

            Toast.makeText(
                this,
                "Müzik parçaları bulunamadı.",
                Toast.LENGTH_LONG
            ).show()

            return
        }

        try {

            val combined =
                ByteArrayOutputStream()

            for (
                chunk in audioChunks
            ) {

                combined.write(
                    chunk
                )
            }

            val pcm =
                combined.toByteArray()

            if (
                pcm.isEmpty()
            ) {

                Toast.makeText(
                    this,
                    "Ses verisi boş.",
                    Toast.LENGTH_LONG
                ).show()

                return
            }

            val finalFile =
                File(
                    cacheDir,
                    "nova_music.wav"
                )

            FileOutputStream(
                finalFile
            ).use { output ->

                writeWavHeader(
                    output,
                    pcm.size,
                    audioSampleRate
                )

                output.write(
                    pcm
                )
            }

            generatedAudioFile =
                finalFile

            mediaPlayer?.release()

            mediaPlayer =
                MediaPlayer()

            mediaPlayer?.setDataSource(
                finalFile.absolutePath
            )

            mediaPlayer?.prepare()

            mediaPlayer?.start()

            Toast.makeText(
                this,
                "Yaklaşık 30 saniyelik müzik hazır ve çalıyor.",
                Toast.LENGTH_LONG
            ).show()

        } catch (error: Exception) {

            Toast.makeText(
                this,
                "Müzik birleştirme hatası: " +
                        error.message,
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // =============================================================
    // WAV HEADER
    // =============================================================

    private fun writeWavHeader(
        output: FileOutputStream,
        pcmSize: Int,
        sampleRate: Int
    ) {

        val header =
            ByteArray(44)

        header[0] =
            'R'.code.toByte()

        header[1] =
            'I'.code.toByte()

        header[2] =
            'F'.code.toByte()

        header[3] =
            'F'.code.toByte()

        writeIntLE(
            header,
            4,
            36 + pcmSize
        )

        header[8] =
            'W'.code.toByte()

        header[9] =
            'A'.code.toByte()

        header[10] =
            'V'.code.toByte()

        header[11] =
            'E'.code.toByte()

        header[12] =
            'f'.code.toByte()

        header[13] =
            'm'.code.toByte()

        header[14] =
            't'.code.toByte()

        header[15] =
            ' '.code.toByte()

        writeIntLE(
            header,
            16,
            16
        )

        writeShortLE(
            header,
            20,
            1
        )

        writeShortLE(
            header,
            22,
            1
        )

        writeIntLE(
            header,
            24,
            sampleRate
        )

        writeIntLE(
            header,
            28,
            sampleRate * 2
        )

        writeShortLE(
            header,
            32,
            2
        )

        writeShortLE(
            header,
            34,
            16
        )

        header[36] =
            'd'.code.toByte()

        header[37] =
            'a'.code.toByte()

        header[38] =
            't'.code.toByte()

        header[39] =
            'a'.code.toByte()

        writeIntLE(
            header,
            40,
            pcmSize
        )

        output.write(
            header
        )
    }

    private fun writeIntLE(
        data: ByteArray,
        offset: Int,
        value: Int
    ) {

        data[offset] =
            (value and 0xff).toByte()

        data[offset + 1] =
            ((value shr 8) and 0xff).toByte()

        data[offset + 2] =
            ((value shr 16) and 0xff).toByte()

        data[offset + 3] =
            ((value shr 24) and 0xff).toByte()
    }

    private fun writeShortLE(
        data: ByteArray,
        offset: Int,
        value: Int
    ) {

        data[offset] =
            (value and 0xff).toByte()

        data[offset + 1] =
            ((value shr 8) and 0xff).toByte()
    }

    // =============================================================
    // MUSICGEN BRIDGE
    // =============================================================

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
        fun onMusicChunk(
            base64Audio: String,
            chunkIndex: Int,
            totalChunksFromJs: Int,
            sampleRate: Int
        ) {

            runOnUiThread {

                try {

                    audioSampleRate =
                        sampleRate

                    val audioBytes =
                        Base64.decode(
                            base64Audio,
                            Base64.DEFAULT
                        )

                    if (
                        audioBytes.size <= 44
                    ) {

                        Toast.makeText(
                            this@MainActivity,
                            "Müzik verisi boş geldi.",
                            Toast.LENGTH_LONG
                        ).show()

                        return@runOnUiThread
                    }

                    val pcm =
                        audioBytes.copyOfRange(
                            44,
                            audioBytes.size
                        )

                    // ÖNEMLİ:
                    // Burada audioChunks.clear()
                    // YOK.
                    // 1., 2. ve 3. parçalar biriktirilir.

                    audioChunks.add(
                        pcm
                    )

                    Toast.makeText(
                        this@MainActivity,
                        "Müzik bölümü " +
                                (chunkIndex + 1) +
                                " / " +
                                totalChunksFromJs +
                                " alındı.",
                        Toast.LENGTH_SHORT
                    ).show()

                } catch (error: Exception) {

                    Toast.makeText(
                        this@MainActivity,
                        "Ses verisi işleme hatası: " +
                                error.message,
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        @JavascriptInterface
        fun onMusicComplete() {

            runOnUiThread {

                if (
                    audioChunks.isEmpty()
                ) {

                    Toast.makeText(
                        this@MainActivity,
                        "Müzik verisi alınamadı.",
                        Toast.LENGTH_LONG
                    ).show()

                    return@runOnUiThread
                }

                createFinalWav()
            }
        }

        @JavascriptInterface
        fun onMusicError(
            message: String
        ) {

            runOnUiThread {

                Toast.makeText(
                    this@MainActivity,
                    "MusicGen hatası: " +
                            message,
                    Toast.LENGTH_LONG
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

                    generatedAudioFile =
                        audioFile

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

    // =============================================================
    // JAVASCRIPT ESCAPE
    // =============================================================

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

    // =============================================================
    // DP
    // =============================================================

    private fun dp(
        value: Int
    ): Int {

        return (
            value *
                    resources
                        .displayMetrics
                        .density
        ).toInt()
    }

    // =============================================================
    // GERİ TUŞU
    // =============================================================

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {

        if (
            lyricsWebView != null
        ) {

            lyricsWebView?.destroy()

            lyricsWebView = null

            setContentView(
                mainRoot
            )

            return
        }

        super.onBackPressed()
    }

    // =============================================================
    // DESTROY
    // =============================================================

    override fun onDestroy() {

        mediaPlayer?.release()

        mediaPlayer = null

        musicWebView.destroy()

        lyricsWebView?.destroy()

        lyricsWebView = null

        super.onDestroy()
    }
}
