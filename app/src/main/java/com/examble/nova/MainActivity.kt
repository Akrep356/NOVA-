package com.nova.ai

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.BitmapFactory
import android.graphics.Bitmap
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
import android.widget.MediaController
import android.media.MediaPlayer
import android.content.ContentValues
import android.content.Intent
import android.provider.MediaStore
import android.os.Build
import android.net.Uri
import android.util.Base64
import android.widget.VideoView

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.io.BufferedInputStream

class MainActivity : Activity() {

    // =========================================================
    // NOVA SERVER
    // =========================================================

    private val musicServerUrl =
        "https://nova-cf5h.onrender.com/generate"

    private val videoServerUrl =
        "https://nova-cf5h.onrender.com/prepare-video"

    // WAN 2.2
    private val wanVideoServerUrl =
        "https://nova-cf5h.onrender.com/wan-video"

    // WAN videosu + NOVA müziğini birleştirecek endpoint
    private val mergeVideoAudioServerUrl =
        "https://nova-cf5h.onrender.com/merge-video-audio"

    private val musicDurationSeconds = 190

    // =========================================================
    // MUSIC
    // =========================================================

    private var mediaPlayer: MediaPlayer? = null
    private var generatedAudioFile: File? = null

    // =========================================================
    // VIDEO
    // =========================================================

    private var generatedVideoFile: File? = null
    private var videoPreview: VideoView? = null

    // =========================================================
    // WAN 2.2
    // =========================================================

    private var selectedArtistImageBase64: String? = null

    private var selectedArtistImageMimeType: String =
        "image/jpeg"

    private val PICK_ARTIST_IMAGE =
        5001

    // =========================================================
    // LYRICS
    // =========================================================

    private var lyricsWebView: WebView? = null

    // =========================================================
    // UI
    // =========================================================

    private lateinit var mainRoot: LinearLayout

    private var mainPrompt: EditText? = null

    private var videoRoot: ScrollView? = null

    // =========================================================
    // ACTIVITY
    // =========================================================

    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(
            savedInstanceState
        )

        showMainScreen()
    }

    // =========================================================
    // ANA EKRAN
    // =========================================================

    private fun showMainScreen() {

        mainRoot =
            LinearLayout(this)

        mainRoot.orientation =
            LinearLayout.VERTICAL

        mainRoot.setPadding(
            dp(16),
            dp(20),
            dp(16),
            dp(20)
        )

        mainRoot.setBackgroundColor(
            Color.BLACK
        )

        val scrollView =
            ScrollView(this)

        scrollView.setBackgroundColor(
            Color.BLACK
        )

        scrollView.addView(
            mainRoot
        )

        setContentView(
            scrollView
        )

        // -----------------------------------------------------
        // TITLE
        // -----------------------------------------------------

        val title =
            TextView(this)

        title.text =
            "NOVA"

        title.textSize =
            34f

        title.setTextColor(
            Color.WHITE
        )

        title.setTypeface(
            null,
            Typeface.BOLD
        )

        title.gravity =
            Gravity.CENTER

        mainRoot.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(70)
            )
        )

        // -----------------------------------------------------
        // SUBTITLE
        // -----------------------------------------------------

        val subtitle =
            TextView(this)

        subtitle.text =
            "AI MUSIC VIDEO & ARTIST CREATOR"

        subtitle.textSize =
            13f

        subtitle.setTextColor(
            Color.LTGRAY
        )

        subtitle.gravity =
            Gravity.CENTER

        mainRoot.addView(
            subtitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(40)
            )
        )

        // -----------------------------------------------------
        // PROMPT TITLE
        // -----------------------------------------------------

        val promptTitle =
            TextView(this)

        promptTitle.text =
            "MÜZİK FİKRİN"

        promptTitle.textSize =
            18f

        promptTitle.setTextColor(
            Color.WHITE
        )

        promptTitle.setTypeface(
            null,
            Typeface.BOLD
        )

        mainRoot.addView(
            promptTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        // -----------------------------------------------------
        // PROMPT
        // -----------------------------------------------------

        val prompt =
            EditText(this)

        prompt.hint =
            "Örn: Türkçe pop, enerjik, romantik, kadın vokal..."

        prompt.setHintTextColor(
            Color.GRAY
        )

        prompt.setTextColor(
            Color.WHITE
        )

        prompt.setBackgroundColor(
            Color.DKGRAY
        )

        prompt.setPadding(
            dp(12),
            dp(12),
            dp(12),
            dp(12)
        )

        mainPrompt =
            prompt

        mainRoot.addView(
            prompt,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(110)
            )
        )

        // -----------------------------------------------------
        // LYRICS
        // -----------------------------------------------------

        val lyricsButton =
            Button(this)

        lyricsButton.text =
            "✍️ SÖZ OLUŞTUR"

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

        // -----------------------------------------------------
        // MUSIC
        // -----------------------------------------------------

        val musicButton =
            Button(this)

        musicButton.text =
            "🎵 MÜZİK OLUŞTUR"

        musicButton.setOnClickListener {

            val userPrompt =
                mainPrompt
                    ?.text
                    ?.toString()
                    ?.trim()
                    ?: ""

            if (
                userPrompt.isEmpty()
            ) {

                Toast.makeText(
                    this,
                    "Önce müzik fikrini yaz.",
                    Toast.LENGTH_SHORT
                ).show()

                return@setOnClickListener
            }

            generateMusic(
                userPrompt
            )
        }

        mainRoot.addView(
            musicButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        // -----------------------------------------------------
        // MUSIC CONTROLS
        // -----------------------------------------------------

        val controls =
            LinearLayout(this)

        controls.orientation =
            LinearLayout.HORIZONTAL

        val playButton =
            Button(this)

        playButton.text =
            "▶️ OYNAT"

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

        val pauseButton =
            Button(this)

        pauseButton.text =
            "⏸️ DURAKLAT"

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

        val stopButton =
            Button(this)

        stopButton.text =
            "⏹️ DURDUR"

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

        // -----------------------------------------------------
        // SAVE MUSIC
        // -----------------------------------------------------

        val saveMusicButton =
            Button(this)

        saveMusicButton.text =
            "💾 MP3'Ü TELEFONA KAYDET"

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

        // -----------------------------------------------------
        // VIDEO
        // -----------------------------------------------------

        val videoButton =
            Button(this)

        videoButton.text =
            "🎬 MÜZİK VİDEOSU OLUŞTUR"

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

        // -----------------------------------------------------
        // INFO
        // -----------------------------------------------------

        val info =
            TextView(this)

        info.text =
            "\nNOVA hazır.\n\n" +
            "Müzik üretimi Render + Stable Audio üzerinden yapılır.\n" +
            "Şarkı sözleri Gemini üzerinden oluşturulur.\n" +
            "WAN 2.2 sanatçı fotoğrafını hareketli videoya dönüştürür.\n" +
            "Müzik klibi oluşturulduğunda görüntü ve ses birleştirilir."

        info.textSize =
            13f

        info.setTextColor(
            Color.LTGRAY
        )

        info.gravity =
            Gravity.CENTER

        mainRoot.addView(
            info,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(160)
            )
        )
    }

    // =========================================================
    // MUSIC GENERATION
    // =========================================================

    private fun generateMusic(
        prompt: String
    ) {

        Toast.makeText(
            this,
            "Müzik oluşturuluyor. Lütfen bekle...",
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
                    60_000

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
                    """{"prompt":"${jsonEscape(prompt)}","duration":$musicDurationSeconds}"""

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

                    val errorText =
                        try {

                            connection
                                .errorStream
                                ?.bufferedReader()
                                ?.use {
                                    it.readText()
                                }
                                ?: "Sunucu hatası"

                        } catch (
                            _: Exception
                        ) {

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

                connection
                    .inputStream
                    .use { input ->

                        FileOutputStream(
                            audioFile
                        ).use { output ->

                            val buffer =
                                ByteArray(
                                    8192
                                )

                            var count: Int

                            while (
                                input.read(
                                    buffer
                                ).also {
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

                generatedAudioFile =
                    audioFile

                runOnUiThread {

                    Toast.makeText(
                        this,
                        "🎵 Müzik hazır!",
                        Toast.LENGTH_LONG
                    ).show()

                    playGeneratedMp3(
                        audioFile
                    )
                }

            } catch (
                e: Exception
            ) {

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

    // =========================================================
    // AUTO MUSIC FOR WAN VIDEO
    // =========================================================

    private fun generateMusicForWanVideo(
        prompt: String,
        wanVideoFile: File
    ) {

        runOnUiThread {

            Toast.makeText(
                this,
                "🎵 NOVA müziği bulunamadı.\n" +
                    "Şimdi müzik otomatik oluşturuluyor...",
                Toast.LENGTH_LONG
            ).show()
        }

        Thread {

            var connection:
                    HttpURLConnection? = null

            try {

                if (
                    !wanVideoFile.exists() ||
                    wanVideoFile.length() <= 0
                ) {

                    throw Exception(
                        "WAN videosu bulunamadı."
                    )
                }

                val cleanPrompt =
                    prompt.trim()

                if (
                    cleanPrompt.isEmpty()
                ) {

                    throw Exception(
                        "Müzik oluşturmak için müzik fikri bulunamadı."
                    )
                }

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
                    60_000

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
                    """{"prompt":"${jsonEscape(cleanPrompt)}","duration":$musicDurationSeconds}"""

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

                    val errorText =
                        try {

                            connection
                                .errorStream
                                ?.bufferedReader()
                                ?.use {
                                    it.readText()
                                }
                                ?: "Müzik sunucu hatası"

                        } catch (
                            _: Exception
                        ) {

                            "Müzik sunucu hatası"
                        }

                    throw Exception(
                        "NOVA müzik oluşturulamadı: $errorText"
                    )
                }

                val audioFile =
                    File(
                        cacheDir,
                        "nova_generated.mp3"
                    )

                connection
                    .inputStream
                    .use { input ->

                        BufferedInputStream(
                            input
                        ).use {
                            bufferedInput ->

                            FileOutputStream(
                                audioFile
                            ).use { output ->

                                val buffer =
                                    ByteArray(
                                        16 * 1024
                                    )

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
                    !audioFile.exists() ||
                    audioFile.length() <= 0
                ) {

                    throw Exception(
                        "NOVA boş MP3 dosyası gönderdi."
                    )
                }

                generatedAudioFile =
                    audioFile

                runOnUiThread {

                    Toast.makeText(
                        this,
                        "🎵 NOVA müziği hazır!\n" +
                            "Şimdi görüntü ve müzik birleştiriliyor...",
                        Toast.LENGTH_LONG
                    ).show()
                }

                mergeVideoWithAudio(
                    wanVideoFile,
                    audioFile
                )

            } catch (
                e: Exception
            ) {

                runOnUiThread {

                    Toast.makeText(
                        this,
                        "Otomatik müzik hatası:\n${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }

            } finally {

                connection?.disconnect()
            }

        }.start()
    }

    // =========================================================
    // MUSIC PLAY
    // =========================================================

    private fun playGeneratedMusic() {

        val file =
            generatedAudioFile

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

        playGeneratedMp3(
            file
        )
    }

    private fun playGeneratedMp3(
        audioFile: File
    ) {

        try {

            mediaPlayer?.release()

            mediaPlayer =
                MediaPlayer()

            mediaPlayer!!.setDataSource(
                audioFile.absolutePath
            )

            mediaPlayer!!.prepare()

            mediaPlayer!!.start()

        } catch (
            e: Exception
        ) {

            Toast.makeText(
                this,
                "Müzik oynatılamadı:\n${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // =========================================================
    // STOP MUSIC
    // =========================================================

    private fun stopMusic() {

        try {
            mediaPlayer?.stop()
        } catch (
            _: Exception
        ) {
        }

        mediaPlayer?.release()

        mediaPlayer =
            null
    }

    // =========================================================
    // SAVE MUSIC
    // =========================================================

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

            resolver
                .openOutputStream(uri)
                .use { output ->

                    if (output == null) {

                        throw Exception(
                            "Dosya yazma akışı açılamadı."
                        )
                    }

                    sourceFile
                        .inputStream()
                        .use { input ->

                            val buffer =
                                ByteArray(
                                    8192
                                )

                            var count: Int

                            while (
                                input
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

        } catch (
            e: Exception
        ) {

            Toast.makeText(
                this,
                "MP3 kaydetme hatası:\n${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // =========================================================
    // LYRICS SCREEN
    // =========================================================

    private fun showLyricsScreen() {

        val root =
            LinearLayout(this)

        root.orientation =
            LinearLayout.VERTICAL

        root.setPadding(
            dp(12),
            dp(12),
            dp(12),
            dp(12)
        )

        root.setBackgroundColor(
            Color.BLACK
        )

        val title =
            TextView(this)

        title.text =
            "✍️ NOVA SÖZ YAZARI"

        title.textSize =
            24f

        title.setTextColor(
            Color.WHITE
        )

        title.setTypeface(
            null,
            Typeface.BOLD
        )

        title.gravity =
            Gravity.CENTER

        root.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        val webView =
            WebView(this)

        lyricsWebView =
            webView

        webView.setBackgroundColor(
            Color.BLACK
        )

        val settings =
            webView.settings

        settings.javaScriptEnabled =
            true

        settings.domStorageEnabled =
            true

        settings.loadWithOverviewMode =
            true

        settings.useWideViewPort =
            true

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

        setContentView(
            root
        )
    }

    // =========================================================
    // LYRICS BRIDGE
    // =========================================================

    inner class LyricsBridge {

        @JavascriptInterface
        fun generateMusic(
            lyrics: String
        ) {

            runOnUiThread {

                val cleanLyrics =
                    lyrics.trim()

                if (
                    cleanLyrics.isEmpty()
                ) {

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

                generateMusic(
                    cleanLyrics
                )
            }
        }

        @JavascriptInterface
        fun setLyrics(
            lyrics: String
        ) {

            runOnUiThread {

                mainPrompt?.setText(
                    lyrics
                )
            }
        }
    }

    // =========================================================
    // VIDEO SCREEN
    // =========================================================

    private fun showVideoScreen() {

        val scroll =
            ScrollView(this)

        videoRoot =
            scroll

        scroll.setBackgroundColor(
            Color.BLACK
        )

        val root =
            LinearLayout(this)

        root.orientation =
            LinearLayout.VERTICAL

        root.setPadding(
            dp(14),
            dp(14),
            dp(14),
            dp(30)
        )

        root.setBackgroundColor(
            Color.BLACK
        )

        scroll.addView(
            root
        )

        // -----------------------------------------------------
        // TITLE
        // -----------------------------------------------------

        val title =
            TextView(this)

        title.text =
            "🎬 NOVA MÜZİK VİDEOSU"

        title.textSize =
            25f

        title.setTextColor(
            Color.WHITE
        )

        title.setTypeface(
            null,
            Typeface.BOLD
        )

        title.gravity =
            Gravity.CENTER

        root.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(70)
            )
        )

        // -----------------------------------------------------
        // WAN ARTIST SECTION
        // -----------------------------------------------------

        val artistTitle =
            TextView(this)

        artistTitle.text =
            "👤 AI SANATÇI"

        artistTitle.textSize =
            19f

        artistTitle.setTextColor(
            Color.WHITE
        )

        artistTitle.setTypeface(
            null,
            Typeface.BOLD
        )

        root.addView(
            artistTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val artistInfo =
            TextView(this)

        artistInfo.text =
            "Sanatçının fotoğrafını seç. " +
            "NOVA bu fotoğrafı Wan 2.2 ile hareketli videoya dönüştürecek."

        artistInfo.textSize =
            13f

        artistInfo.setTextColor(
            Color.LTGRAY
        )

        root.addView(
            artistInfo,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(65)
            )
        )

        // -----------------------------------------------------
        // SELECT PHOTO
        // -----------------------------------------------------

        val selectArtistButton =
            Button(this)

        selectArtistButton.text =
            "📷 SANATÇI FOTOĞRAFI SEÇ"

        selectArtistButton.setOnClickListener {

            val intent =
                Intent(
                    Intent.ACTION_OPEN_DOCUMENT
                )

            intent.addCategory(
                Intent.CATEGORY_OPENABLE
            )

            intent.type =
                "image/*"

            startActivityForResult(
                intent,
                PICK_ARTIST_IMAGE
            )
        }

        root.addView(
            selectArtistButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        // -----------------------------------------------------
        // WAN PROMPT
        // -----------------------------------------------------

        val wanPromptTitle =
            TextView(this)

        wanPromptTitle.text =
            "🎥 HAREKET PROMPTU"

        wanPromptTitle.textSize =
            17f

        wanPromptTitle.setTextColor(
            Color.WHITE
        )

        wanPromptTitle.setTypeface(
            null,
            Typeface.BOLD
        )

        root.addView(
            wanPromptTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val wanPromptEdit =
            EditText(this)

        wanPromptEdit.hint =
            "Örn: sanatçı kameraya doğru yürüsün, saçları hafifçe hareket etsin..."

        wanPromptEdit.setHintTextColor(
            Color.GRAY
        )

        wanPromptEdit.setTextColor(
            Color.WHITE
        )

        wanPromptEdit.setBackgroundColor(
            Color.DKGRAY
        )

        wanPromptEdit.setPadding(
            dp(12),
            dp(12),
            dp(12),
            dp(12)
        )

        wanPromptEdit.setText(
            "genç erkek sanatçı kameraya doğru yavaşça yürüsün, doğal yüz hareketleri, hafif saç hareketi, sinematik kamera hareketi"
        )

        root.addView(
            wanPromptEdit,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(120)
            )
        )

        // -----------------------------------------------------
        // WAN DURATION
        // -----------------------------------------------------

        val wanDurationTitle =
            TextView(this)

        wanDurationTitle.text =
            "⏱️ WAN VİDEO SÜRESİ"

        wanDurationTitle.textSize =
            17f

        wanDurationTitle.setTextColor(
            Color.WHITE
        )

        wanDurationTitle.setTypeface(
            null,
            Typeface.BOLD
        )

        root.addView(
            wanDurationTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val wanDurations =
            arrayOf(
                "3 saniye",
                "3.5 saniye",
                "4 saniye",
                "5 saniye"
            )

        val wanDurationSpinner =
            Spinner(this)

        val wanDurationAdapter =
            ArrayAdapter(
                this,
                android.R.layout.simple_spinner_dropdown_item,
                wanDurations
            )

        wanDurationSpinner.adapter =
            wanDurationAdapter

        wanDurationSpinner.setSelection(
            1
        )

        root.addView(
            wanDurationSpinner,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        // -----------------------------------------------------
        // WAN BUTTON
        // -----------------------------------------------------

        val wanButton =
            Button(this)

        wanButton.text =
            "🤖 WAN 2.2 İLE SANATÇIYI CANLANDIR"

        wanButton.setOnClickListener {

            val image =
                selectedArtistImageBase64

            if (
                image.isNullOrEmpty()
            ) {

                Toast.makeText(
                    this,
                    "Önce sanatçı fotoğrafını seç.",
                    Toast.LENGTH_LONG
                ).show()

                return@setOnClickListener
            }

            val prompt =
                wanPromptEdit
                    .text
                    .toString()
                    .trim()

            if (
                prompt.isEmpty()
            ) {

                Toast.makeText(
                    this,
                    "Hareket promptu yaz.",
                    Toast.LENGTH_SHORT
                ).show()

                return@setOnClickListener
            }

            val durationText =
                wanDurationSpinner
                    .selectedItem
                    .toString()

            val duration =
                when {
                    durationText.contains(
                        "3.5"
                    ) -> 3.5

                    durationText.contains(
                        "4"
                    ) -> 4.0

                    durationText.contains(
                        "5"
                    ) -> 5.0

                    else -> 3.0
                }

            generateWanVideo(
                imageBase64 = image,
                imageMimeType =
                    selectedArtistImageMimeType,
                prompt = prompt,
                duration = duration
            )
        }

        root.addView(
            wanButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(70)
            )
        )

        // -----------------------------------------------------
        // SEPARATOR
        // -----------------------------------------------------

        val separator =
            TextView(this)

        separator.text =
            "\n────────────────────\n"

        separator.setTextColor(
            Color.GRAY
        )

        separator.gravity =
            Gravity.CENTER

        root.addView(
            separator,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(50)
            )
        )

        // -----------------------------------------------------
        // OLD VIDEO SYSTEM
        // -----------------------------------------------------

        val lyricsTitle =
            TextView(this)

        lyricsTitle.text =
            "ŞARKI SÖZLERİ"

        lyricsTitle.textSize =
            17f

        lyricsTitle.setTextColor(
            Color.WHITE
        )

        lyricsTitle.setTypeface(
            null,
            Typeface.BOLD
        )

        root.addView(
            lyricsTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(40)
            )
        )

        val lyricsEdit =
            EditText(this)

        lyricsEdit.hint =
            "Şarkı sözlerini buraya yaz..."

        lyricsEdit.setHintTextColor(
            Color.GRAY
        )

        lyricsEdit.setTextColor(
            Color.WHITE
        )

        lyricsEdit.setBackgroundColor(
            Color.DKGRAY
        )

        lyricsEdit.gravity =
            Gravity.TOP

        val currentPrompt =
            mainPrompt
                ?.text
                ?.toString()
                ?.trim()

        if (
            !currentPrompt.isNullOrEmpty()
        ) {

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

        // -----------------------------------------------------
        // STYLE
        // -----------------------------------------------------

        val styleTitle =
            TextView(this)

        styleTitle.text =
            "VİDEO STİLİ"

        styleTitle.textSize =
            17f

        styleTitle.setTextColor(
            Color.WHITE
        )

        styleTitle.setTypeface(
            null,
            Typeface.BOLD
        )

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

        val styleSpinner = Spinner(this)

        val styleAdapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            styles
        )

        styleSpinner.adapter = styleAdapter

        root.addView(
            styleSpinner,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        val orientationTitle = TextView(this)

        orientationTitle.text = "📐 VİDEO YÖNÜ"
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

        val orientations = arrayOf(
            "Dikey 9:16",
            "Yatay 16:9",
            "Kare 1:1"
        )

        val orientationSpinner = Spinner(this)

        val orientationAdapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            orientations
        )

        orientationSpinner.adapter = orientationAdapter

        root.addView(
            orientationSpinner,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        val durationTitle = TextView(this)

        durationTitle.text = "⏱️ VİDEO SÜRESİ"
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

        val videoDurations = arrayOf(
            "15 saniye",
            "30 saniye",
            "60 saniye"
        )

        val durationSpinner = Spinner(this)

        val durationAdapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            videoDurations
        )

        durationSpinner.adapter = durationAdapter
        durationSpinner.setSelection(1)

        root.addView(
            durationSpinner,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        val visualTitle = TextView(this)

        visualTitle.text = "🎞️ KLİPTE GÖRÜNECEK SAHNELER"
        visualTitle.textSize = 17f
        visualTitle.setTextColor(Color.WHITE)
        visualTitle.setTypeface(null, Typeface.BOLD)

        root.addView(
            visualTitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val visualDescriptionEdit = EditText(this)

        visualDescriptionEdit.hint =
            "Örn: gece şehri, neon ışıklar, sahnede şarkı söyleyen sanatçı..."

        visualDescriptionEdit.setHintTextColor(Color.GRAY)
        visualDescriptionEdit.setTextColor(Color.WHITE)
        visualDescriptionEdit.setBackgroundColor(Color.DKGRAY)
        visualDescriptionEdit.gravity = Gravity.TOP

        visualDescriptionEdit.setPadding(
            dp(12),
            dp(12),
            dp(12),
            dp(12)
        )

        root.addView(
            visualDescriptionEdit,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(120)
            )
        )

        val prepareVideoButton = Button(this)

        prepareVideoButton.text =
            "🎬 VİDEO KLİBİNİ HAZIRLA"

        prepareVideoButton.setOnClickListener {

            val lyrics =
                lyricsEdit.text.toString().trim()

            val style =
                styleSpinner.selectedItem.toString()

            val duration =
                when (
                    durationSpinner.selectedItem.toString()
                ) {
                    "15 saniye" -> 15
                    "30 saniye" -> 30
                    "60 saniye" -> 60
                    else -> 30
                }

            val orientation =
                when (
                    orientationSpinner.selectedItem.toString()
                ) {
                    "Yatay 16:9" -> "16:9"
                    "Kare 1:1" -> "1:1"
                    else -> "9:16"
                }

            val visualDescription =
                visualDescriptionEdit.text.toString().trim()

            if (lyrics.isEmpty()) {
                Toast.makeText(
                    this,
                    "Önce şarkı sözlerini yaz.",
                    Toast.LENGTH_LONG
                ).show()

                return@setOnClickListener
            }

            Toast.makeText(
                this,
                "Video ayarları hazır. Sunucu bağlantısını sonraki adımda ekleyeceğiz.",
                Toast.LENGTH_LONG
            ).show()
        }

        root.addView(
            prepareVideoButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(65)
            )
        setContentView(scroll)
}

// =========================================================
// YARDIMCI FONKSİYONLAR
// =========================================================

private fun jsonEscape(value: String): String {
    return value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
}

private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
}

override fun onDestroy() {
    mediaPlayer?.release()
    mediaPlayer = null
    lyricsWebView?.destroy()
    lyricsWebView = null
    super.onDestroy()
}

}
