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
import android.media.MediaPlayer
import android.content.ContentValues
import android.provider.MediaStore
import android.os.Build
import android.net.Uri
import android.widget.VideoView

import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.io.BufferedInputStream

class MainActivity : Activity() {

    private val musicServerUrl =
        "https://nova-cf5h.onrender.com/generate"

    private val videoServerUrl =
        "https://nova-cf5h.onrender.com/prepare-video"

    private val musicDurationSeconds = 190

    private var mediaPlayer: MediaPlayer? = null
    private var generatedAudioFile: File? = null

    private var generatedVideoFile: File? = null
    private var videoPreview: VideoView? = null

    private var lyricsWebView: WebView? = null

    private lateinit var mainRoot: LinearLayout
    private var mainPrompt: EditText? = null
    private var videoRoot: ScrollView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        showMainScreen()
    }

    private fun showMainScreen() {

        mainRoot = LinearLayout(this)
        mainRoot.orientation = LinearLayout.VERTICAL
        mainRoot.setPadding(
            dp(16),
            dp(20),
            dp(16),
            dp(20)
        )
        mainRoot.setBackgroundColor(Color.BLACK)

        val scrollView = ScrollView(this)
        scrollView.setBackgroundColor(Color.BLACK)
        scrollView.addView(mainRoot)

        setContentView(scrollView)

        val title = TextView(this)

        title.text = "NOVA"
        title.textSize = 34f
        title.setTextColor(Color.WHITE)
        title.setTypeface(null, Typeface.BOLD)
        title.gravity = Gravity.CENTER

        mainRoot.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(70)
            )
        )

        val subtitle = TextView(this)

        subtitle.text = "AI MUSIC VIDEO & ARTIST CREATOR"
        subtitle.textSize = 13f
        subtitle.setTextColor(Color.LTGRAY)
        subtitle.gravity = Gravity.CENTER

        mainRoot.addView(
            subtitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(40)
            )
        )

        val promptTitle = TextView(this)

        promptTitle.text = "MÜZİK FİKRİN"
        promptTitle.textSize = 18f
        promptTitle.setTextColor(Color.WHITE)
        promptTitle.setTypeface(null, Typeface.BOLD)

        mainRoot.addView(
            promptTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val prompt = EditText(this)

        prompt.hint =
            "Örn: Türkçe pop, enerjik, romantik, kadın vokal..."

        prompt.setHintTextColor(Color.GRAY)
        prompt.setTextColor(Color.WHITE)
        prompt.setBackgroundColor(Color.DKGRAY)
        prompt.setPadding(
            dp(12),
            dp(12),
            dp(12),
            dp(12)
        )

        mainPrompt = prompt

        mainRoot.addView(
            prompt,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(110)
            )
        )

        val lyricsButton = Button(this)

        lyricsButton.text = "✍️ SÖZ OLUŞTUR"

        lyricsButton.setOnClickListener {
            showLyricsScreen()
        }

        mainRoot.addView(
            lyricsButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        val musicButton = Button(this)

        musicButton.text = "🎵 MÜZİK OLUŞTUR"

        musicButton.setOnClickListener {

            val userPrompt =
                mainPrompt?.text?.toString()?.trim() ?: ""

            if (userPrompt.isEmpty()) {

                Toast.makeText(
                    this,
                    "Önce müzik fikrini yaz.",
                    Toast.LENGTH_SHORT
                ).show()

                return@setOnClickListener
            }

            generateMusic(userPrompt)
        }

        mainRoot.addView(
            musicButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        val controls = LinearLayout(this)

        controls.orientation = LinearLayout.HORIZONTAL

        val playButton = Button(this)

        playButton.text = "▶️ OYNAT"

        playButton.setOnClickListener {
            playGeneratedMusic()
        }

        controls.addView(
            playButton,
            LinearLayout.LayoutParams(
                0,
                dp(55),
                1f
            )
        )

        val pauseButton = Button(this)

        pauseButton.text = "⏸️ DURAKLAT"

        pauseButton.setOnClickListener {

            if (
                mediaPlayer != null &&
                mediaPlayer!!.isPlaying
            ) {
                mediaPlayer!!.pause()
            }
        }

        controls.addView(
            pauseButton,
            LinearLayout.LayoutParams(
                0,
                dp(55),
                1f
            )
        )

        val stopButton = Button(this)

        stopButton.text = "⏹️ DURDUR"

        stopButton.setOnClickListener {
            stopMusic()
        }

        controls.addView(
            stopButton,
            LinearLayout.LayoutParams(
                0,
                dp(55),
                1f
            )
        )

        mainRoot.addView(
            controls,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(65)
            )
        )

        val saveMusicButton = Button(this)

        saveMusicButton.text = "💾 MP3'Ü TELEFONA KAYDET"

        saveMusicButton.setOnClickListener {
            saveMusicToPhone()
        }

        mainRoot.addView(
            saveMusicButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        val videoButton = Button(this)

        videoButton.text = "🎬 MÜZİK VİDEOSU OLUŞTUR"

        videoButton.setOnClickListener {
            showVideoScreen()
        }

        mainRoot.addView(
            videoButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(65)
            )
        )

        val info = TextView(this)

        info.text =
            "\nNOVA hazır.\n\n" +
            "Müzik üretimi Render + Stable Audio üzerinden yapılır.\n" +
            "Video üretimi Wikimedia Commons + FFmpeg üzerinden yapılır."

        info.textSize = 13f
        info.setTextColor(Color.LTGRAY)
        info.gravity = Gravity.CENTER

        mainRoot.addView(
            info,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(120)
            )
        )
    }

    private fun generateMusic(prompt: String) {

        Toast.makeText(
            this,
            "Müzik oluşturuluyor. Lütfen bekle...",
            Toast.LENGTH_LONG
        ).show()

        Thread {

            var connection: HttpURLConnection? = null

            try {

                val url = URL(musicServerUrl)

                connection =
                    url.openConnection() as HttpURLConnection

                connection.requestMethod = "POST"
                connection.connectTimeout = 60_000
                connection.readTimeout = 15 * 60 * 1000
                connection.doOutput = true

                connection.setRequestProperty(
                    "Content-Type",
                    "application/json; charset=UTF-8"
                )

                connection.setRequestProperty(
                    "Accept",
                    "audio/mpeg, application/json"
                )

                val json =
                    """{"prompt":"${jsonEscape(prompt)}","duration":$musicDurationSeconds}"""

                connection.outputStream.use { output ->

                    output.write(
                        json.toByteArray(Charsets.UTF_8)
                    )

                    output.flush()
                }

                val responseCode =
                    connection.responseCode

                if (responseCode !in 200..299) {

                    val errorText =
                        try {

                            connection.errorStream
                                ?.bufferedReader()
                                ?.use { it.readText() }
                                ?: "Sunucu hatası"

                        } catch (e: Exception) {

                            "Sunucu hatası"
                        }

                    runOnUiThread {

                        Toast.makeText(
                            this,
                            "Müzik oluşturulamadı:\n$errorText",
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

                    FileOutputStream(audioFile).use { output ->

                        val buffer = ByteArray(8192)

                        var count: Int

                        while (
                            input.read(buffer).also {
                                count = it
                            } != -1
                        ) {

                            output.write(
                                buffer,
                                0,
                                count
                            )
                        }
                    }
                }

                if (
                    !audioFile.exists() ||
                    audioFile.length() <= 0
                ) {

                    throw Exception(
                        "Boş MP3 dosyası alındı."
                    )
                }

                generatedAudioFile = audioFile

                runOnUiThread {

                    Toast.makeText(
                        this,
                        "🎵 Müzik hazır!",
                        Toast.LENGTH_LONG
                    ).show()

                    playGeneratedMp3(audioFile)
                }

            } catch (e: Exception) {

                runOnUiThread {

                    Toast.makeText(
                        this,
                        "Müzik hatası:\n${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }

            } finally {

                connection?.disconnect()
            }

        }.start()
    }

    private fun playGeneratedMusic() {

        val file = generatedAudioFile

        if (
            file == null ||
            !file.exists()
        ) {

            Toast.makeText(
                this,
                "Önce müzik oluştur.",
                Toast.LENGTH_SHORT
            ).show()

            return
        }

        playGeneratedMp3(file)
    }

    private fun playGeneratedMp3(
        audioFile: File
    ) {

        try {

            mediaPlayer?.release()

            mediaPlayer = MediaPlayer()

            mediaPlayer!!.setDataSource(
                audioFile.absolutePath
            )

            mediaPlayer!!.prepare()
            mediaPlayer!!.start()

        } catch (e: Exception) {

            Toast.makeText(
                this,
                "Müzik oynatılamadı:\n${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun stopMusic() {

        try {
            mediaPlayer?.stop()
        } catch (_: Exception) {
        }

        mediaPlayer?.release()
        mediaPlayer = null
    }

    private fun saveMusicToPhone() {

        val sourceFile = generatedAudioFile

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

            val resolver = contentResolver

            val values =
                ContentValues().apply {

                    put(
                        MediaStore.MediaColumns.DISPLAY_NAME,
                        "NOVA_Music_${System.currentTimeMillis()}.mp3"
                    )

                    put(
                        MediaStore.MediaColumns.MIME_TYPE,
                        "audio/mpeg"
                    )

                    if (
                        Build.VERSION.SDK_INT >=
                        Build.VERSION_CODES.Q
                    ) {

                        put(
                            MediaStore.MediaColumns.RELATIVE_PATH,
                            "Music/NOVA"
                        )

                        put(
                            MediaStore.MediaColumns.IS_PENDING,
                            1
                        )
                    }
                }

            val uri =
                resolver.insert(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    values
                )

            if (uri == null) {

                throw Exception(
                    "Telefon depolamasında dosya oluşturulamadı."
                )
            }

            resolver.openOutputStream(uri).use { output ->

                if (output == null) {

                    throw Exception(
                        "Dosya yazma akışı açılamadı."
                    )
                }

                sourceFile.inputStream().use { input ->

                    val buffer = ByteArray(8192)

                    var count: Int

                    while (
                        input.read(buffer).also {
                            count = it
                        } != -1
                    ) {

                        output.write(
                            buffer,
                            0,
                            count
                        )
                    }
                }
            }

            if (
                Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.Q
            ) {

                val finishValues =
                    ContentValues().apply {

                        put(
                            MediaStore.MediaColumns.IS_PENDING,
                            0
                        )
                    }

                resolver.update(
                    uri,
                    finishValues,
                    null,
                    null
                )
            }

            Toast.makeText(
                this,
                "💾 MP3 telefona kaydedildi.",
                Toast.LENGTH_LONG
            ).show()

        } catch (e: Exception) {

            Toast.makeText(
                this,
                "MP3 kaydetme hatası:\n${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun showLyricsScreen() {

        val root = LinearLayout(this)

        root.orientation = LinearLayout.VERTICAL

        root.setPadding(
            dp(12),
            dp(12),
            dp(12),
            dp(12)
        )

        root.setBackgroundColor(Color.BLACK)

        val title = TextView(this)

        title.text = "✍️ NOVA SÖZ YAZARI"
        title.textSize = 24f
        title.setTextColor(Color.WHITE)
        title.setTypeface(null, Typeface.BOLD)
        title.gravity = Gravity.CENTER

        root.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        val webView = WebView(this)

        lyricsWebView = webView

        webView.setBackgroundColor(Color.BLACK)

        val settings = webView.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true

        webView.webViewClient =
            WebViewClient()

        webView.addJavascriptInterface(
            LyricsBridge(),
            "Android"
        )

        webView.loadUrl(
            "file:///android_asset/lyrics.html"
        )

        root.addView(
            webView,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        )

        val backButton = Button(this)

        backButton.text = "⬅️ ANA EKRANA DÖN"

        backButton.setOnClickListener {
            showMainScreen()
        }

        root.addView(
            backButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        setContentView(root)
    }

    inner class LyricsBridge {

        @JavascriptInterface
        fun generateMusic(lyrics: String) {

            runOnUiThread {

                val cleanLyrics =
                    lyrics.trim()

                if (cleanLyrics.isEmpty()) {

                    Toast.makeText(
                        this@MainActivity,
                        "Sözler boş.",
                        Toast.LENGTH_SHORT
                    ).show()

                    return@runOnUiThread
                }

                showMainScreen()

                mainPrompt?.setText(
                    cleanLyrics
                )

                generateMusic(cleanLyrics)
            }
        }

        @JavascriptInterface
        fun setLyrics(lyrics: String) {

            runOnUiThread {

                mainPrompt?.setText(
                    lyrics
                )
            }
        }
    }

    private fun showVideoScreen() {

        val scroll = ScrollView(this)

        videoRoot = scroll

        scroll.setBackgroundColor(Color.BLACK)

        val root = LinearLayout(this)

        root.orientation = LinearLayout.VERTICAL

        root.setPadding(
            dp(14),
            dp(14),
            dp(14),
            dp(30)
        )

        root.setBackgroundColor(Color.BLACK)

        scroll.addView(root)

        setContentView(scroll)

        val title = TextView(this)

        title.text = "🎬 NOVA MÜZİK VİDEOSU"
        title.textSize = 25f
        title.setTextColor(Color.WHITE)
        title.setTypeface(null, Typeface.BOLD)
        title.gravity = Gravity.CENTER

        root.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(70)
            )
        )

        val lyricsTitle = TextView(this)

        lyricsTitle.text = "ŞARKI SÖZLERİ"
        lyricsTitle.textSize = 17f
        lyricsTitle.setTextColor(Color.WHITE)
        lyricsTitle.setTypeface(null, Typeface.BOLD)

        root.addView(
            lyricsTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(40)
            )
        )

        val lyricsEdit = EditText(this)

        lyricsEdit.hint =
            "Şarkı sözlerini buraya yaz..."

        lyricsEdit.setHintTextColor(Color.GRAY)
        lyricsEdit.setTextColor(Color.WHITE)
        lyricsEdit.setBackgroundColor(Color.DKGRAY)
        lyricsEdit.gravity = Gravity.TOP

        val currentPrompt =
            mainPrompt?.text?.toString()?.trim()

        if (!currentPrompt.isNullOrEmpty()) {

            lyricsEdit.setText(
                currentPrompt
            )
        }

        root.addView(
            lyricsEdit,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(140)
            )
        )

        val styleTitle = TextView(this)

        styleTitle.text = "VİDEO STİLİ"
        styleTitle.textSize = 17f
        styleTitle.setTextColor(Color.WHITE)
        styleTitle.setTypeface(null, Typeface.BOLD)

        root.addView(
            styleTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val styles = arrayOf(
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
                android.R.layout.simple_spinner_dropdown_item,
                styles
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

        val durationTitle = TextView(this)

        durationTitle.text = "VİDEO SÜRESİ"
        durationTitle.textSize = 17f
        durationTitle.setTextColor(Color.WHITE)
        durationTitle.setTypeface(null, Typeface.BOLD)

        root.addView(
            durationTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val durations = arrayOf(
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
                android.R.layout.simple_spinner_dropdown_item,
                durations
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

        val orientationTitle = TextView(this)

        orientationTitle.text = "VİDEO ORYANTASYONU"
        orientationTitle.textSize = 17f
        orientationTitle.setTextColor(Color.WHITE)
        orientationTitle.setTypeface(null, Typeface.BOLD)

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

        val radio916 =
            RadioButton(this)

        radio916.text = "9:16 - Dikey"
        radio916.setTextColor(Color.WHITE)
        radio916.isChecked = true

        orientationGroup.addView(
            radio916
        )

        val radio169 =
            RadioButton(this)

        radio169.text = "16:9 - Yatay"
        radio169.setTextColor(Color.WHITE)

        orientationGroup.addView(
            radio169
        )

        val radio11 =
            RadioButton(this)

        radio11.text = "1:1 - Kare"
        radio11.setTextColor(Color.WHITE)

        orientationGroup.addView(
            radio11
        )

        root.addView(
            orientationGroup,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(150)
            )
        )

        val descriptionTitle = TextView(this)

        descriptionTitle.text =
            "GÖRSEL AÇIKLAMA"

        descriptionTitle.textSize = 17f
        descriptionTitle.setTextColor(Color.WHITE)
        descriptionTitle.setTypeface(null, Typeface.BOLD)

        root.addView(
            descriptionTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val descriptionEdit =
            EditText(this)

        descriptionEdit.hint =
            "Örn: gece şehri, neon ışıklar, yağmur..."

        descriptionEdit.setHintTextColor(Color.GRAY)
        descriptionEdit.setTextColor(Color.WHITE)
        descriptionEdit.setBackgroundColor(Color.DKGRAY)

        root.addView(
            descriptionEdit,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(100)
            )
        )

        val createVideoButton =
            Button(this)

        createVideoButton.text =
            "🎬 VİDEOYU OLUŞTUR"

        createVideoButton.setOnClickListener {

            val lyrics =
                lyricsEdit.text.toString().trim()

            if (lyrics.isEmpty()) {

                Toast.makeText(
                    this,
                    "Önce şarkı sözlerini yaz.",
                    Toast.LENGTH_SHORT
                ).show()

                return@setOnClickListener
            }

            val style =
                styleSpinner.selectedItem.toString()

            val durationText =
                durationSpinner.selectedItem.toString()

            val duration =
                durationText
                    .replace(
                        " saniye",
                        ""
                    )
                    .toIntOrNull()
                    ?: 60

            val orientation =
                when {
                    radio169.isChecked -> "16:9"
                    radio11.isChecked -> "1:1"
                    else -> "9:16"
                }

            val visualDescription =
                descriptionEdit.text
                    .toString()
                    .trim()

            prepareVideoOnServer(
                lyrics,
                style,
                duration,
                orientation,
                visualDescription
            )
        }

        root.addView(
            createVideoButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(65)
            )
        )

        val previewTitle =
            TextView(this)

        previewTitle.text =
            "🎞️ VİDEO ÖNİZLEME"

        previewTitle.textSize = 18f
        previewTitle.setTextColor(Color.WHITE)
        previewTitle.setTypeface(null, Typeface.BOLD)

        root.addView(
            previewTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(50)
            )
        )

        val preview =
            VideoView(this)

        videoPreview = preview

        preview.setBackgroundColor(
            Color.BLACK
        )

        root.addView(
            preview,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(420)
            )
        )

        val saveVideoButton =
            Button(this)

        saveVideoButton.text =
            "💾 VİDEOYU TELEFONA KAYDET"

        saveVideoButton.setOnClickListener {
            saveVideoToPhone()
        }

        root.addView(
            saveVideoButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        val backButton =
            Button(this)

        backButton.text =
            "⬅️ ANA EKRANA DÖN"

        backButton.setOnClickListener {
            showMainScreen()
        }

        root.addView(
            backButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )
    }

    private fun prepareVideoOnServer(
        lyrics: String,
        style: String,
        duration: Int,
        orientation: String,
        visualDescription: String
    ) {

        Toast.makeText(
            this,
            "🎬 Video hazırlanıyor...\nBu işlem birkaç dakika sürebilir.",
            Toast.LENGTH_LONG
        ).show()

        Thread {

            var connection:
                    HttpURLConnection? = null

            try {

                val url =
                    URL(videoServerUrl)

                connection =
                    url.openConnection()
                            as HttpURLConnection

                connection.requestMethod =
                    "POST"

                connection.connectTimeout =
                    60_000

                connection.readTimeout =
                    10 * 60 * 1000

                connection.doOutput =
                    true

                connection.setRequestProperty(
                    "Content-Type",
                    "application/json; charset=UTF-8"
                )

                connection.setRequestProperty(
                    "Accept",
                    "video/mp4, application/json"
                )

                val json =
                    """{"lyrics":"${jsonEscape(lyrics)}","style":"${jsonEscape(style)}","duration":$duration,"orientation":"${jsonEscape(orientation)}","visualDescription":"${jsonEscape(visualDescription)}"}"""

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

                if (responseCode !in 200..299) {

                    val errorText =
                        try {

                            connection.errorStream
                                ?.bufferedReader()
                                ?.use {
                                    it.readText()
                                }
                                ?: "Render sunucu hatası"

                        } catch (e: Exception) {

                            "Render sunucu hatası"
                        }

                    runOnUiThread {

                        Toast.makeText(
                            this,
                            "Video oluşturulamadı:\n$errorText",
                            Toast.LENGTH_LONG
                        ).show()
                    }

                    return@Thread
                }

                val videoFile =
                    File(
                        cacheDir,
                        "nova_generated_video.mp4"
                    )

                connection.inputStream.use { input ->

                    BufferedInputStream(
                        input
                    ).use { bufferedInput ->

                        FileOutputStream(
                            videoFile
                        ).use { output ->

                            val buffer =
                                ByteArray(16 * 1024)

                            var count: Int

                            while (
                                bufferedInput
                                    .read(buffer)
                                    .also {
                                        count = it
                                    } != -1
                            ) {

                                output.write(
                                    buffer,
                                    0,
                                    count
                                )
                            }

                            output.flush()
                        }
                    }
                }

                if (
                    !videoFile.exists() ||
                    videoFile.length() <= 0
                ) {

                    throw Exception(
                        "Render boş video dosyası gönderdi."
                    )
                }

                generatedVideoFile =
                    videoFile

                runOnUiThread {

                    val preview =
                        videoPreview

                    if (preview != null) {

                        preview.setVideoURI(
                            Uri.fromFile(
                                videoFile
                            )
                        )

                        preview.setOnPreparedListener {
                            it.isLooping = false
                        }

                        preview.start()
                    }

                    Toast.makeText(
                        this,
                        "🎬 Video hazır!",
                        Toast.LENGTH_LONG
                    ).show()
                }

            } catch (e: Exception) {

                runOnUiThread {

                    Toast.makeText(
                        this,
                        "Video hatası:\n${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }

            } finally {

                connection?.disconnect()
            }

        }.start()
    }

    private fun saveVideoToPhone() {

        val sourceFile =
            generatedVideoFile

        if (
            sourceFile == null ||
            !sourceFile.exists()
        ) {

            Toast.makeText(
                this,
                "Önce video oluştur.",
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
                        MediaStore.MediaColumns.DISPLAY_NAME,
                        "NOVA_Video_${System.currentTimeMillis()}.mp4"
                    )

                    put(
                        MediaStore.MediaColumns.MIME_TYPE,
                        "video/mp4"
                    )

                    if (
                        Build.VERSION.SDK_INT >=
                        Build.VERSION_CODES.Q
                    ) {

                        put(
                            MediaStore.MediaColumns.RELATIVE_PATH,
                            "Movies/NOVA"
                        )

                        put(
                            MediaStore.MediaColumns.IS_PENDING,
                            1
                        )
                    }
                }

            val uri =
                resolver.insert(
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                    values
                )

            if (uri == null) {

                throw Exception(
                    "Telefon depolamasında video oluşturulamadı."
                )
            }

            resolver.openOutputStream(
                uri
            ).use { output ->

                if (output == null) {

                    throw Exception(
                        "Video yazma akışı açılamadı."
                    )
                }

                sourceFile.inputStream().use { input ->

                    val buffer =
                        ByteArray(16 * 1024)

                    var count: Int

                    while (
                        input.read(buffer).also {
                            count = it
                        } != -1
                    ) {

                        output.write(
                            buffer,
                            0,
                            count
                        )
                    }
                }
            }

            if (
                Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.Q
            ) {

                val finishValues =
                    ContentValues().apply {

                        put(
                            MediaStore.MediaColumns.IS_PENDING,
                            0
                        )
                    }

                resolver.update(
                    uri,
                    finishValues,
                    null,
                    null
                )
            }

            Toast.makeText(
                this,
                "💾 Video telefona kaydedildi.",
                Toast.LENGTH_LONG
            ).show()

        } catch (e: Exception) {

            Toast.makeText(
                this,
                "Video kaydetme hatası:\n${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun jsonEscape(
        text: String
    ): String {

        return text
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
            )
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

        try {
            mediaPlayer?.release()
        } catch (_: Exception) {
        }

        mediaPlayer = null

        try {
            lyricsWebView?.destroy()
        } catch (_: Exception) {
        }

        lyricsWebView = null

        super.onDestroy()
    }

    override fun onBackPressed() {

        if (videoRoot != null) {

            videoRoot = null

            showMainScreen()

            return
        }

        super.onBackPressed()
    }
}
