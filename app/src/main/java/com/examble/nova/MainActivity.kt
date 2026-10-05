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
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.ArrayAdapter
import android.widget.RadioGroup
import android.widget.RadioButton
import android.widget.TextView
import android.media.MediaPlayer
import android.content.ContentValues
import android.provider.MediaStore
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.io.BufferedInputStream

class MainActivity : Activity() {

    // =============================================================
    // RENDER SUNUCUSU
    // =============================================================

    private val musicServerUrl =
        "https://nova-cf5h.onrender.com/generate"

    // Render endpoint'inin mevcut maksimum süresi
    private val musicDurationSeconds = 190

    // =============================================================
    // MEDIA PLAYER
    // =============================================================

    private var mediaPlayer: MediaPlayer? = null

    private var generatedAudioFile: File? = null

    // =============================================================
    // LYRICS
    // =============================================================

    private var lyricsWebView: WebView? = null

    // =============================================================
    // ANA ARAYÜZ
    // =============================================================

    private lateinit var mainRoot: LinearLayout

    private var mainPrompt: EditText? = null

    // =============================================================
    // VİDEO ARAYÜZÜ
    // =============================================================

    private var videoRoot: ScrollView? = null

    // =============================================================
    // ON CREATE
    // =============================================================

    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(savedInstanceState)

        createNovaInterface()
    }

    // =============================================================
    // NOVA ANA ARAYÜZÜ
    // =============================================================

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

        // =========================================================
        // BAŞLIK
        // =========================================================

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

        // =========================================================
        // ALT BAŞLIK
        // =========================================================

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

        // =========================================================
        // PROMPT
        // =========================================================

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
            "🎬 VİDEO OLUŞTUR"

        videoButton.setOnClickListener {

            openVideoGenerator()
        }

        root.addView(
            videoButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
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
    // VİDEO OLUŞTURUCU EKRANI
    // =============================================================

    private fun openVideoGenerator() {

        val scrollView =
            ScrollView(this)

        videoRoot =
            scrollView

        scrollView.setBackgroundColor(
            Color.rgb(12, 12, 20)
        )

        val root =
            LinearLayout(this)

        root.orientation =
            LinearLayout.VERTICAL

        root.setPadding(
            dp(20),
            dp(24),
            dp(20),
            dp(30)
        )

        // =========================================================
        // BAŞLIK
        // =========================================================

        val title =
            TextView(this)

        title.text =
            "🎬 NOVA VİDEO OLUŞTURUCU"

        title.textSize =
            26f

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
                dp(65)
            )
        )

        // =========================================================
        // AÇIKLAMA
        // =========================================================

        val description =
            TextView(this)

        description.text =
            "Şarkın için video ayarlarını hazırla."

        description.textSize =
            16f

        description.setTextColor(
            Color.LTGRAY
        )

        description.gravity =
            Gravity.CENTER

        root.addView(
            description,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        // =========================================================
        // ŞARKI SÖZLERİ
        // =========================================================

        val lyricsTitle =
            TextView(this)

        lyricsTitle.text =
            "ŞARKI SÖZLERİ"

        lyricsTitle.textSize =
            18f

        lyricsTitle.setTextColor(
            Color.WHITE
        )

        lyricsTitle.setTypeface(
            Typeface.DEFAULT,
            Typeface.BOLD
        )

        root.addView(
            lyricsTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val lyricsText =
            EditText(this)

        val currentLyrics =
            mainPrompt?.text
                ?.toString()
                ?.trim()
                ?: ""

        if (currentLyrics.isNotEmpty()) {

            lyricsText.setText(
                currentLyrics
            )
        }

        lyricsText.hint =
            "Video için kullanılacak şarkı sözleri"

        lyricsText.setHintTextColor(
            Color.GRAY
        )

        lyricsText.setTextColor(
            Color.WHITE
        )

        lyricsText.gravity =
            Gravity.TOP

        lyricsText.setSingleLine(false)

        root.addView(
            lyricsText,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(150)
            )
        )

        // =========================================================
        // VİDEO STİLİ
        // =========================================================

        val styleTitle =
            TextView(this)

        styleTitle.text =
            "VİDEO STİLİ"

        styleTitle.textSize =
            18f

        styleTitle.setTextColor(
            Color.WHITE
        )

        styleTitle.setTypeface(
            Typeface.DEFAULT,
            Typeface.BOLD
        )

        root.addView(
            styleTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val styles =
            arrayOf(
                "Sinematik",
                "Duygusal",
                "Enerjik",
                "Romantik",
                "Karanlık",
                "Neon",
                "Doğa",
                "Konser"
            )

        val styleSpinner =
            Spinner(this)

        val styleAdapter =
            ArrayAdapter(
                this,
                android.R.layout.simple_spinner_item,
                styles
            )

        styleAdapter.setDropDownViewResource(
            android.R.layout.simple_spinner_dropdown_item
        )

        styleSpinner.adapter =
            styleAdapter

        root.addView(
            styleSpinner,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // =========================================================
        // VİDEO SÜRESİ
        // =========================================================

        val durationTitle =
            TextView(this)

        durationTitle.text =
            "VİDEO SÜRESİ"

        durationTitle.textSize =
            18f

        durationTitle.setTextColor(
            Color.WHITE
        )

        durationTitle.setTypeface(
            Typeface.DEFAULT,
            Typeface.BOLD
        )

        root.addView(
            durationTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val durations =
            arrayOf(
                "30 saniye",
                "60 saniye",
                "90 saniye",
                "120 saniye",
                "180 saniye"
            )

        val durationSpinner =
            Spinner(this)

        val durationAdapter =
            ArrayAdapter(
                this,
                android.R.layout.simple_spinner_item,
                durations
            )

        durationAdapter.setDropDownViewResource(
            android.R.layout.simple_spinner_dropdown_item
        )

        durationSpinner.adapter =
            durationAdapter

        root.addView(
            durationSpinner,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // =========================================================
        // VİDEO YÖNÜ
        // =========================================================

        val orientationTitle =
            TextView(this)

        orientationTitle.text =
            "VİDEO YÖNÜ"

        orientationTitle.textSize =
            18f

        orientationTitle.setTextColor(
            Color.WHITE
        )

        orientationTitle.setTypeface(
            Typeface.DEFAULT,
            Typeface.BOLD
        )

        root.addView(
            orientationTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val orientationGroup =
            RadioGroup(this)

        orientationGroup.orientation =
            RadioGroup.VERTICAL

        val verticalRadio =
            RadioButton(this)

        verticalRadio.text =
            "📱 Dikey 9:16"

        verticalRadio.textSize =
            16f

        verticalRadio.setTextColor(
            Color.WHITE
        )

        verticalRadio.id =
            1001

        verticalRadio.isChecked =
            true

        orientationGroup.addView(
            verticalRadio
        )

        val horizontalRadio =
            RadioButton(this)

        horizontalRadio.text =
            "🖥️ Yatay 16:9"

        horizontalRadio.textSize =
            16f

        horizontalRadio.setTextColor(
            Color.WHITE
        )

        horizontalRadio.id =
            1002

        orientationGroup.addView(
            horizontalRadio
        )

        val squareRadio =
            RadioButton(this)

        squareRadio.text =
            "⬜ Kare 1:1"

        squareRadio.textSize =
            16f

        squareRadio.setTextColor(
            Color.WHITE
        )

        squareRadio.id =
            1003

        orientationGroup.addView(
            squareRadio
        )

        root.addView(
            orientationGroup,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(150)
            )
        )

        // =========================================================
        // GÖRSEL AÇIKLAMASI
        // =========================================================

        val visualTitle =
            TextView(this)

        visualTitle.text =
            "GÖRSEL AÇIKLAMASI"

        visualTitle.textSize =
            18f

        visualTitle.setTextColor(
            Color.WHITE
        )

        visualTitle.setTypeface(
            Typeface.DEFAULT,
            Typeface.BOLD
        )

        root.addView(
            visualTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val visualPrompt =
            EditText(this)

        visualPrompt.hint =
            "Örn: Gece şehir ışıkları, yağmur, yalnız yürüyen sanatçı..."

        visualPrompt.setHintTextColor(
            Color.GRAY
        )

        visualPrompt.setTextColor(
            Color.WHITE
        )

        visualPrompt.setSingleLine(false)

        visualPrompt.gravity =
            Gravity.TOP

        root.addView(
            visualPrompt,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(110)
            )
        )

        // =========================================================
        // VİDEO OLUŞTUR BUTONU
        // =========================================================

        val createVideoButton =
            Button(this)

        createVideoButton.text =
            "🎬 VİDEOYU OLUŞTUR"

        createVideoButton.setOnClickListener {

            val selectedStyle =
                styleSpinner
                    .selectedItem
                    ?.toString()
                    ?: "Sinematik"

            val selectedDuration =
                durationSpinner
                    .selectedItem
                    ?.toString()
                    ?: "30 saniye"

            val selectedOrientation =
                when (
                    orientationGroup.checkedRadioButtonId
                ) {

                    1002 ->
                        "16:9"

                    1003 ->
                        "1:1"

                    else ->
                        "9:16"
                }

            val lyrics =
                lyricsText.text
                    .toString()
                    .trim()

            val visualDescription =
                visualPrompt.text
                    .toString()
                    .trim()

            if (lyrics.isEmpty()) {

                Toast.makeText(
                    this,
                    "Önce şarkı sözlerini oluştur.",
                    Toast.LENGTH_LONG
                ).show()

                return@setOnClickListener
            }

            val videoDescription =
                if (
                    visualDescription.isEmpty()
                ) {
                    "NOVA video: " +
                            selectedStyle +
                            ", " +
                            selectedDuration +
                            ", " +
                            selectedOrientation
                } else {
                    "NOVA video: " +
                            selectedStyle +
                            ", " +
                            selectedDuration +
                            ", " +
                            selectedOrientation +
                            "\n" +
                            visualDescription
                }

            Toast.makeText(
                this,
                "Video ayarları hazırlandı.\n" +
                        videoDescription,
                Toast.LENGTH_LONG
            ).show()

            // Gerçek MP4 üretim motoru daha sonra
            // bu noktaya bağlanacak.
        }

        root.addView(
            createVideoButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        // =========================================================
        // GERİ DÖN
        // =========================================================

        val backButton =
            Button(this)

        backButton.text =
            "← NOVA'YA GERİ DÖN"

        backButton.setOnClickListener {

            videoRoot = null

            setContentView(
                mainRoot
            )
        }

        root.addView(
            backButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        scrollView.addView(
            root,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )

        setContentView(
            scrollView
        )
    }

    // =============================================================
    // RENDER ÜZERİNDEN MÜZİK OLUŞTUR
    // =============================================================

    private fun generateMusic(
        userPrompt: String
    ) {

        generatedAudioFile = null

        try {

            mediaPlayer?.stop()

        } catch (_: Exception) {
        }

        mediaPlayer?.release()

        mediaPlayer = null

        Toast.makeText(
            this,
            "Render üzerinden müzik hazırlanıyor. Lütfen bekleyin...",
            Toast.LENGTH_LONG
        ).show()

        Thread {

            var connection:
                    HttpURLConnection? = null

            try {

                val url =
                    URL(
                        musicServerUrl
                    )

                connection =
                    url.openConnection()
                            as HttpURLConnection

                connection.requestMethod =
                    "POST"

                connection.connectTimeout =
                    30000

                connection.readTimeout =
                    15 * 60 * 1000

                connection.doOutput =
                    true

                connection.setRequestProperty(
                    "Content-Type",
                    "application/json; charset=UTF-8"
                )

                connection.setRequestProperty(
                    "Accept",
                    "audio/mpeg, application/json"
                )

                val json =
                    "{" +
                        "\"prompt\":" +
                        JSONObjectEscape(
                            userPrompt
                        ) +
                        "," +
                        "\"duration\":" +
                        musicDurationSeconds +
                        "}"

                connection.outputStream.use { output ->

                    output.write(
                        json.toByteArray(
                            Charsets.UTF_8
                        )
                    )

                    output.flush()
                }

                val responseCode =
                    connection.responseCode

                if (
                    responseCode !in 200..299
                ) {

                    val errorStream =
                        connection.errorStream

                    val errorText =
                        if (
                            errorStream != null
                        ) {
                            errorStream
                                .bufferedReader()
                                .use {
                                    it.readText()
                                }
                        } else {
                            "HTTP $responseCode"
                        }

                    runOnUiThread {

                        Toast.makeText(
                            this@MainActivity,
                            "Render müzik hatası:\n" +
                                    errorText.take(500),
                            Toast.LENGTH_LONG
                        ).show()
                    }

                    return@Thread
                }

                val audioFile =
                    File(
                        cacheDir,
                        "nova_generated.mp3"
                    )

                connection.inputStream.use { input ->

                    BufferedInputStream(
                        input
                    ).use { bufferedInput ->

                        FileOutputStream(
                            audioFile
                        ).use { output ->

                            val buffer =
                                ByteArray(
                                    8192
                                )

                            var bytesRead: Int

                            while (
                                bufferedInput.read(
                                    buffer
                                ).also {
                                    bytesRead = it
                                } != -1
                            ) {

                                output.write(
                                    buffer,
                                    0,
                                    bytesRead
                                )
                            }

                            output.flush()
                        }
                    }
                }

                if (
                    !audioFile.exists() ||
                    audioFile.length() <= 0
                ) {

                    runOnUiThread {

                        Toast.makeText(
                            this@MainActivity,
                            "Render boş bir ses dosyası döndürdü.",
                            Toast.LENGTH_LONG
                        ).show()
                    }

                    return@Thread
                }

                generatedAudioFile =
                    audioFile

                runOnUiThread {

                    playGeneratedMp3(
                        audioFile
                    )
                }

            } catch (error: Exception) {

                runOnUiThread {

                    Toast.makeText(
                        this@MainActivity,
                        "Müzik oluşturma hatası:\n" +
                                error.message,
                        Toast.LENGTH_LONG
                    ).show()
                }

            } finally {

                connection?.disconnect()
            }

        }.start()
    }

    // =============================================================
    // GELEN MP3'Ü OYNAT
    // =============================================================

    private fun playGeneratedMp3(
        audioFile: File
    ) {

        try {

            mediaPlayer?.release()

            mediaPlayer =
                MediaPlayer()

            mediaPlayer?.setDataSource(
                audioFile.absolutePath
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

            Toast.makeText(
                this,
                "Müzik hazır ve çalıyor.",
                Toast.LENGTH_LONG
            ).show()

        } catch (error: Exception) {

            Toast.makeText(
                this,
                "MP3 oynatma hatası:\n" +
                        error.message,
                Toast.LENGTH_LONG
            ).show()
        }
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
                "Müzik oynatma hatası:\n" +
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
                "Oynatma hatası:\n" +
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
    // TELEFONA MP3 OLARAK KAYDET
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
                        "NOVA_Muzik_${System.currentTimeMillis()}.mp3"
                    )

                    put(
                        MediaStore.Downloads.MIME_TYPE,
                        "audio/mpeg"
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
                "MP3 müzik telefona kaydedildi.",
                Toast.LENGTH_LONG
            ).show()

        } catch (error: Exception) {

            Toast.makeText(
                this,
                "Kaydetme hatası:\n" +
                        error.message,
                Toast.LENGTH_LONG
            ).show()
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

        if (
            videoRoot != null
        ) {

            videoRoot = null

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

        lyricsWebView?.destroy()

        lyricsWebView = null

        videoRoot = null

        super.onDestroy()
    }
}
