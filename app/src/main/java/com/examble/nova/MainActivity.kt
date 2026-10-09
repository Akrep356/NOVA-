
package com.nova.ai

import android.app.Activity
import android.os.Bundle
import android.os.Build
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import android.media.MediaPlayer
import android.util.Base64

import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayOutputStream
import org.json.JSONObject

class MainActivity : Activity() {

    // =====================================================
    // NOVA SERVER
    // =====================================================

    private val musicServerUrl =
        "https://nova-cf5h.onrender.com/generate"

    private val videoServerUrl =
        "https://nova-cf5h.onrender.com/prepare-video"

    private val wanVideoServerUrl =
        "https://nova-cf5h.onrender.com/wan-video"

    private val mergeVideoAudioServerUrl =
        "https://nova-cf5h.onrender.com/merge-video-audio"

    private val musicDurationSeconds = 190

    // =====================================================
    // STATE
    // =====================================================

    private var mediaPlayer: MediaPlayer? = null
    private var generatedAudioFile: File? = null
    private var generatedVideoFile: File? = null

    private var selectedArtistImageBase64: String? = null
    private var selectedArtistImageMimeType = "image/jpeg"

    private var lyricsWebView: WebView? = null
    private var mainPrompt: EditText? = null

    private val PICK_ARTIST_IMAGE = 5001

    // =====================================================
    // ACTIVITY
    // =====================================================

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showMainScreen()
    }

    // =====================================================
    // MAIN SCREEN
    // =====================================================

    private fun showMainScreen() {
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setPadding(dp(16), dp(16), dp(16), dp(24))
        root.setBackgroundColor(Color.BLACK)

        val scroll = ScrollView(this)
        scroll.addView(root)
        scroll.setBackgroundColor(Color.BLACK)
        setContentView(scroll)

        val title = makeText("NOVA", 34f, true)
        title.gravity = Gravity.CENTER
        root.addView(title, fullHeight(70))

        val subtitle = makeText(
            "AI MUSIC VIDEO & ARTIST CREATOR",
            13f,
            false
        )
        subtitle.gravity = Gravity.CENTER
        root.addView(subtitle, fullHeight(40))

        root.addView(
            makeText("MÜZİK FİKRİN", 18f, true),
            fullHeight(45)
        )

        val prompt = EditText(this)
        prompt.hint =
            "Türkçe pop, enerjik, romantik, kadın vokal..."
        prompt.setHintTextColor(Color.GRAY)
        prompt.setTextColor(Color.WHITE)
        prompt.setBackgroundColor(Color.DKGRAY)
        prompt.setPadding(dp(12), dp(12), dp(12), dp(12))
        mainPrompt = prompt
        root.addView(prompt, fullHeight(110))

        val lyricsButton = makeButton("✍️ SÖZ OLUŞTUR")
        lyricsButton.setOnClickListener { showLyricsScreen() }
        root.addView(lyricsButton, fullHeight(55))

        val musicButton = makeButton("🎵 MÜZİK OLUŞTUR")
        musicButton.setOnClickListener {
            val text = mainPrompt?.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) {
                toast("Önce müzik fikrini yaz.")
            } else {
                generateMusic(text)
            }
        }
        root.addView(musicButton, fullHeight(60))

        val controls = LinearLayout(this)
        controls.orientation = LinearLayout.HORIZONTAL

        val play = makeButton("▶️ OYNAT")
        play.setOnClickListener { playGeneratedMusic() }
        controls.addView(play, weightedHeight(55))

        val pause = makeButton("⏸️ DURAKLAT")
        pause.setOnClickListener {
            try {
                if (mediaPlayer?.isPlaying == true) {
                    mediaPlayer?.pause()
                }
            } catch (_: Exception) {
            }
        }
        controls.addView(pause, weightedHeight(55))

        val stop = makeButton("⏹️ DURDUR")
        stop.setOnClickListener { stopMusic() }
        controls.addView(stop, weightedHeight(55))

        root.addView(controls, fullHeight(65))

        val saveMusic = makeButton("💾 MP3'Ü TELEFONA KAYDET")
        saveMusic.setOnClickListener { saveMusicToPhone() }
        root.addView(saveMusic, fullHeight(60))

        val videoButton = makeButton("🎬 MÜZİK VİDEOSU OLUŞTUR")
        videoButton.setOnClickListener { showVideoScreen() }
        root.addView(videoButton, fullHeight(65))

        val info = makeText(
            "\nNOVA hazır.\n\n" +
                "Müzik: Render + Stable Audio\n" +
                "Şarkı sözleri: Gemini destekli ekran\n" +
                "Sanatçı animasyonu: WAN 2.2 sunucusu\n" +
                "Video ve ses birleştirme: Render sunucusu",
            13f,
            false
        )
        info.gravity = Gravity.CENTER
        root.addView(info, fullHeight(150))
    }

    // =====================================================
    // MUSIC GENERATION
    // =====================================================

    private fun generateMusic(prompt: String) {
        toast("🎵 Müzik oluşturuluyor. Lütfen bekle...")

        Thread {
            try {
                val json = JSONObject()
                json.put("prompt", prompt)
                json.put("duration", musicDurationSeconds)

                val bytes = postJson(
                    musicServerUrl,
                    json.toString(),
                    "audio/mpeg, application/json"
                )

                val file = File(cacheDir, "nova_generated.mp3")
                file.writeBytes(bytes)

                if (!file.exists() || file.length() == 0L) {
                    throw Exception("Boş müzik dosyası alındı.")
                }

                generatedAudioFile = file

                runOnUiThread {
                    toast("🎵 Müzik hazır!")
                    playGeneratedMp3(file)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    toast("Müzik hatası: ${e.message}")
                }
            }
        }.start()
    }

    // =====================================================
    // PLAYBACK
    // =====================================================

    private fun playGeneratedMusic() {
        val file = generatedAudioFile
        if (file == null || !file.exists()) {
            toast("Önce müzik oluştur.")
            return
        }
        playGeneratedMp3(file)
    }

    private fun playGeneratedMp3(file: File) {
        try {
            mediaPlayer?.release()
            mediaPlayer = MediaPlayer()
            mediaPlayer?.setDataSource(file.absolutePath)
            mediaPlayer?.setOnPreparedListener {
                it.start()
            }
            mediaPlayer?.prepareAsync()
        } catch (e: Exception) {
            toast("Müzik oynatılamadı: ${e.message}")
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

    // =====================================================
    // SAVE MP3
    // =====================================================

    private fun saveMusicToPhone() {
        val source = generatedAudioFile

        if (source == null || !source.exists()) {
            toast("Önce müzik oluştur.")
            return
        }

        try {
            val values = ContentValues().apply {
                put(
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    "NOVA_Music_${System.currentTimeMillis()}.mp3"
                )
                put(MediaStore.MediaColumns.MIME_TYPE, "audio/mpeg")

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(
                        MediaStore.MediaColumns.RELATIVE_PATH,
                        "Music/NOVA"
                    )
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }

            val uri = contentResolver.insert(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                values
            ) ?: throw Exception("Dosya oluşturulamadı.")

            contentResolver.openOutputStream(uri).use { output ->
                if (output == null) {
                    throw Exception("Dosya yazılamadı.")
                }
                source.inputStream().use { input ->
                    input.copyTo(output)
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val finish = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                contentResolver.update(uri, finish, null, null)
            }

            toast("💾 MP3 telefona kaydedildi.")
        } catch (e: Exception) {
            toast("Kaydetme hatası: ${e.message}")
        }
    }

    // =====================================================
    // LYRICS SCREEN
    // =====================================================

    private fun showLyricsScreen() {
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setPadding(dp(12), dp(12), dp(12), dp(12))
        root.setBackgroundColor(Color.BLACK)

        val title = makeText("✍️ NOVA SÖZ YAZARI", 24f, true)
        title.gravity = Gravity.CENTER
        root.addView(title, fullHeight(60))

        val web = WebView(this)
        lyricsWebView = web
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(LyricsBridge(), "Android")
        web.loadUrl("file:///android_asset/lyrics.html")

        root.addView(
            web,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        )

        val back = makeButton("⬅️ ANA EKRANA DÖN")
        back.setOnClickListener { showMainScreen() }
        root.addView(back, fullHeight(60))

        setContentView(root)
    }

    inner class LyricsBridge {
        @JavascriptInterface
        fun generateMusic(lyrics: String) {
            runOnUiThread {
                val clean = lyrics.trim()
                if (clean.isEmpty()) {
                    toast("Sözler boş.")
                    return@runOnUiThread
                }
                showMainScreen()
                mainPrompt?.setText(clean)
                generateMusic(clean)
            }
        }

        @JavascriptInterface
        fun setLyrics(lyrics: String) {
            runOnUiThread {
                mainPrompt?.setText(lyrics)
            }
        }
    }

    // =====================================================
    // VIDEO SCREEN
    // =====================================================

    private fun showVideoScreen() {
        val scroll = ScrollView(this)
        scroll.setBackgroundColor(Color.BLACK)

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setPadding(dp(14), dp(14), dp(14), dp(30))
        root.setBackgroundColor(Color.BLACK)
        scroll.addView(root)

        val title = makeText("🎬 NOVA MÜZİK VİDEOSU", 25f, true)
        title.gravity = Gravity.CENTER
        root.addView(title, fullHeight(70))

        root.addView(
            makeText("👤 AI SANATÇI", 19f, true),
            fullHeight(45)
        )

        root.addView(
            makeText(
                "Bir fotoğraf seç. WAN 2.2 sunucusu bu fotoğrafı hareketli videoya dönüştürür.",
                13f,
                false
            ),
            fullHeight(65)
        )

        val selectPhoto = makeButton("📷 SANATÇI FOTOĞRAFI SEÇ")
        selectPhoto.setOnClickListener {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            intent.addCategory(Intent.CATEGORY_OPENABLE)
            intent.type = "image/*"
            startActivityForResult(intent, PICK_ARTIST_IMAGE)
        }
        root.addView(selectPhoto, fullHeight(60))

        root.addView(
            makeText("🎥 HAREKET PROMPTU", 17f, true),
            fullHeight(45)
        )

        val wanPrompt = EditText(this)
        wanPrompt.setText(
            "Sanatçı kameraya doğru yavaşça yürüsün, doğal yüz " +
                "hareketleri, hafif saç hareketi, sinematik kamera hareketi"
        )
        wanPrompt.setTextColor(Color.WHITE)
        wanPrompt.setHintTextColor(Color.GRAY)
        wanPrompt.setBackgroundColor(Color.DKGRAY)
        wanPrompt.setPadding(dp(12), dp(12), dp(12), dp(12))
        root.addView(wanPrompt, fullHeight(120))

        root.addView(
            makeText("⏱️ WAN VİDEO SÜRESİ", 17f, true),
            fullHeight(45)
        )

        val wanDuration = Spinner(this)
        wanDuration.adapter = spinnerAdapter(
            arrayOf("3 saniye", "3.5 saniye", "4 saniye", "5 saniye")
        )
        wanDuration.setSelection(1)
        root.addView(wanDuration, fullHeight(55))

        val wanButton = makeButton("🤖 WAN 2.2 İLE SANATÇIYI CANLANDIR")
        wanButton.setOnClickListener {
            val image = selectedArtistImageBase64

            if (image.isNullOrEmpty()) {
                toast("Önce sanatçı fotoğrafını seç.")
                return@setOnClickListener
            }

            val prompt = wanPrompt.text.toString().trim()
            if (prompt.isEmpty()) {
                toast("Hareket promptu yaz.")
                return@setOnClickListener
            }

            val duration = when (
                wanDuration.selectedItem.toString()
            ) {
                "3.5 saniye" -> 3.5
                "4 saniye" -> 4.0
                "5 saniye" -> 5.0
                else -> 3.0
            }

            generateWanVideo(
                image,
                selectedArtistImageMimeType,
                prompt,
                duration
            )
        }
        root.addView(wanButton, fullHeight(70))

        root.addView(
            makeText("────────────────────", 14f, false),
            fullHeight(45)
        )

        root.addView(
            makeText("🎵 MÜZİK KLİBİ AYARLARI", 19f, true),
            fullHeight(50)
        )

        root.addView(
            makeText("ŞARKI SÖZLERİ", 17f, true),
            fullHeight(40)
        )

        val lyrics = EditText(this)
        lyrics.hint = "Şarkı sözlerini yaz..."
        lyrics.setHintTextColor(Color.GRAY)
        lyrics.setTextColor(Color.WHITE)
        lyrics.setBackgroundColor(Color.DKGRAY)
        lyrics.gravity = Gravity.TOP
        mainPrompt?.text?.toString()?.trim()?.let {
            if (it.isNotEmpty()) lyrics.setText(it)
        }
        root.addView(lyrics, fullHeight(130))

        root.addView(
            makeText("VİDEO STİLİ", 17f, true),
            fullHeight(45)
        )

        val style = Spinner(this)
        style.adapter = spinnerAdapter(
            arrayOf(
                "Sinematik", "Duygusal", "Enerjik", "Romantik",
                "Karanlık", "Neon", "Doğa", "Konser"
            )
        )
        root.addView(style, fullHeight(55))

        root.addView(
            makeText("📐 VİDEO YÖNÜ", 17f, true),
            fullHeight(45)
        )

        val orientation = Spinner(this)
        orientation.adapter = spinnerAdapter(
            arrayOf("Dikey 9:16", "Yatay 16:9", "Kare 1:1")
        )
        root.addView(orientation, fullHeight(55))

        root.addView(
            makeText("⏱️ VİDEO SÜRESİ", 17f, true),
            fullHeight(45)
        )

        val duration = Spinner(this)
        duration.adapter = spinnerAdapter(
            arrayOf("15 saniye", "30 saniye", "60 saniye")
        )
        duration.setSelection(1)
        root.addView(duration, fullHeight(55))

        root.addView(
            makeText("🎞️ KLİPTE GÖRÜNECEK SAHNELER", 17f, true),
            fullHeight(45)
        )

        val visuals = EditText(this)
        visuals.hint = "Gece şehri, neon ışıklar, konser sahnesi..."
        visuals.setHintTextColor(Color.GRAY)
        visuals.setTextColor(Color.WHITE)
        visuals.setBackgroundColor(Color.DKGRAY)
        visuals.gravity = Gravity.TOP
        visuals.setPadding(dp(12), dp(12), dp(12), dp(12))
        root.addView(visuals, fullHeight(120))

        val prepare = makeButton("🎬 VİDEO KLİBİNİ HAZIRLA")
        prepare.setOnClickListener {
            val lyricsText = lyrics.text.toString().trim()

            if (lyricsText.isEmpty()) {
                toast("Önce şarkı sözlerini yaz.")
                return@setOnClickListener
            }

            val selectedStyle = style.selectedItem.toString()
            val selectedDuration = when (
                duration.selectedItem.toString()
            ) {
                "15 saniye" -> 15
                "60 saniye" -> 60
                else -> 30
            }

            val selectedOrientation = when (
                orientation.selectedItem.toString()
            ) {
                "Yatay 16:9" -> "16:9"
                "Kare 1:1" -> "1:1"
                else -> "9:16"
            }

            prepareVideo(
                lyricsText,
                selectedStyle,
                selectedDuration,
                selectedOrientation,
                visuals.text.toString().trim()
            )
        }
        root.addView(prepare, fullHeight(65))

        val preview = makeButton("▶️ OLUŞAN VİDEOYU OYNAT")
        preview.setOnClickListener { playGeneratedVideo(root) }
        root.addView(preview, fullHeight(60))

        val saveVideo = makeButton("💾 VİDEOYU TELEFONA KAYDET")
        saveVideo.setOnClickListener { saveVideoToPhone() }
        root.addView(saveVideo, fullHeight(60))

        val back = makeButton("⬅️ ANA EKRANA DÖN")
        back.setOnClickListener { showMainScreen() }
        root.addView(back, fullHeight(60))

        setContentView(scroll)
    }

    // =====================================================
    // PICK ARTIST PHOTO
    // =====================================================

    @Deprecated("Uses the activity result callback for broad Android compatibility")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode != PICK_ARTIST_IMAGE ||
            resultCode != RESULT_OK
        ) return

        val uri: Uri = data?.data ?: run {
            toast("Fotoğraf seçilemedi.")
            return
        }

        try {
            contentResolver.openInputStream(uri).use { input ->
                if (input == null) {
                    throw Exception("Fotoğraf açılamadı.")
                }

                val bytes = input.readBytes()
                if (bytes.isEmpty()) {
                    throw Exception("Fotoğraf dosyası boş.")
                }

                selectedArtistImageBase64 =
                    Base64.encodeToString(bytes, Base64.NO_WRAP)

                selectedArtistImageMimeType =
                    contentResolver.getType(uri) ?: "image/jpeg"
            }

            toast("✅ Sanatçı fotoğrafı seçildi.")
        } catch (e: Exception) {
            selectedArtistImageBase64 = null
            toast("Fotoğraf hatası: ${e.message}")
        }
    }

    // =====================================================
    // WAN 2.2 VIDEO GENERATION
    // =====================================================

    private fun generateWanVideo(
        imageBase64: String,
        mimeType: String,
        prompt: String,
        duration: Double
    ) {
        toast("🤖 WAN 2.2 sanatçıyı canlandırıyor...")

        Thread {
            try {
                val json = JSONObject()
                json.put("imageBase64", imageBase64)
                json.put("imageMimeType", mimeType)
                json.put("prompt", prompt)
                json.put("duration", duration)

                val bytes = postJson(
                    wanVideoServerUrl,
                    json.toString(),
                    "video/mp4, application/json"
                )

                val file = File(cacheDir, "nova_wan_video.mp4")
                file.writeBytes(bytes)

                if (!file.exists() || file.length() == 0L) {
                    throw Exception("WAN sunucusu boş video döndürdü.")
                }

                generatedVideoFile = file

                runOnUiThread {
                    toast("✅ Sanatçı videosu hazır.")
                }

                // Mevcut NOVA müziği varsa videoya ekle.
                val audio = generatedAudioFile
                if (audio != null && audio.exists()) {
                    mergeVideoWithAudio(file, audio)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    toast("WAN video hatası: ${e.message}")
                }
            }
        }.start()
    }

    // =====================================================
    // MERGE VIDEO + AUDIO
    // =====================================================

    private fun mergeVideoWithAudio(
        videoFile: File,
        audioFile: File
    ) {
        if (!videoFile.exists() || !audioFile.exists()) {
            toast("Birleştirme için video veya müzik eksik.")
            return
        }

        Thread {
            try {
                val json = JSONObject()
                json.put(
                    "videoBase64",
                    Base64.encodeToString(
                        videoFile.readBytes(),
                        Base64.NO_WRAP
                    )
                )
                json.put(
                    "audioBase64",
                    Base64.encodeToString(
                        audioFile.readBytes(),
                        Base64.NO_WRAP
                    )
                )
                json.put("videoMimeType", "video/mp4")
                json.put("audioMimeType", "audio/mpeg")

                val bytes = postJson(
                    mergeVideoAudioServerUrl,
                    json.toString(),
                    "video/mp4, application/json"
                )

                val merged = File(cacheDir, "nova_music_video.mp4")
                merged.writeBytes(bytes)

                if (!merged.exists() || merged.length() == 0L) {
                    throw Exception("Birleştirilmiş video boş.")
                }

                generatedVideoFile = merged

                runOnUiThread {
                    toast("✅ Video ve müzik birleştirildi.")
                }
            } catch (e: Exception) {
                runOnUiThread {
                    toast("Birleştirme hatası: ${e.message}")
                }
            }
        }.start()
    }

    // =====================================================
    // PREPARE MUSIC VIDEO
    // =====================================================

    private fun prepareVideo(
        lyrics: String,
        style: String,
        duration: Int,
        orientation: String,
        visualDescription: String
    ) {
        toast("🎬 Video klibi hazırlanıyor...")

        Thread {
            try {
                val json = JSONObject()
                json.put("lyrics", lyrics)
                json.put("style", style)
                json.put("duration", duration)
                json.put("orientation", orientation)
                json.put("visualDescription", visualDescription)

                val bytes = postJson(
                    videoServerUrl,
                    json.toString(),
                    "video/mp4, application/json"
                )

                val file = File(cacheDir, "nova_prepared_video.mp4")
                file.writeBytes(bytes)

                if (!file.exists() || file.length() == 0L) {
                    throw Exception("Sunucu boş video döndürdü.")
                }

                generatedVideoFile = file

                runOnUiThread {
                    toast("✅ Video klibi hazır.")
                }

                val audio = generatedAudioFile
                if (audio != null && audio.exists()) {
                    mergeVideoWithAudio(file, audio)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    toast("Video hatası: ${e.message}")
                }
            }
        }.start()
    }

    // =====================================================
    // VIDEO PREVIEW
    // =====================================================

    private fun playGeneratedVideo(root: LinearLayout) {
        val file = generatedVideoFile

        if (file == null || !file.exists()) {
            toast("Önce bir video oluştur.")
            return
        }

        val videoView = VideoView(this)
        videoView.setVideoPath(file.absolutePath)
        videoView.setMediaController(MediaController(this).apply {
            setAnchorView(videoView)
        })

        root.addView(
            videoView,
            0,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(300)
            )
        )

        videoView.setOnPreparedListener {
            videoView.start()
        }
    }

    // =====================================================
    // SAVE VIDEO
    // =====================================================

    private fun saveVideoToPhone() {
        val source = generatedVideoFile

        if (source == null || !source.exists()) {
            toast("Önce bir video oluştur.")
            return
        }

        try {
            val values = ContentValues().apply {
                put(
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    "NOVA_Video_${System.currentTimeMillis()}.mp4"
                )
                put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(
                        MediaStore.MediaColumns.RELATIVE_PATH,
                        "Movies/NOVA"
                    )
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }

            val uri = contentResolver.insert(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                values
            ) ?: throw Exception("Video dosyası oluşturulamadı.")

            contentResolver.openOutputStream(uri).use { output ->
                if (output == null) {
                    throw Exception("Video dosyasına yazılamadı.")
                }
                source.inputStream().use { input ->
                    input.copyTo(output)
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val finish = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                contentResolver.update(uri, finish, null, null)
            }

            toast("💾 Video telefona kaydedildi.")
        } catch (e: Exception) {
            toast("Video kaydetme hatası: ${e.message}")
        }
    }

    // =====================================================
    // HTTP JSON REQUEST
    // =====================================================

    private fun postJson(
        endpoint: String,
        json: String,
        accept: String
    ): ByteArray {
        val connection = URL(endpoint).openConnection()
            as HttpURLConnection

        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 60_000
            connection.readTimeout = 15 * 60 * 1000
            connection.doOutput = true
            connection.setRequestProperty(
                "Content-Type",
                "application/json; charset=UTF-8"
            )
            connection.setRequestProperty("Accept", accept)

            connection.outputStream.use { output ->
                output.write(json.toByteArray(Charsets.UTF_8))
                output.flush()
            }

            val code = connection.responseCode
            val responseBytes = if (code in 200..299) {
                connection.inputStream.use { it.readBytes() }
            } else {
                connection.errorStream?.use { it.readBytes() }
                    ?: ByteArray(0)
            }

            if (code !in 200..299) {
                val message = String(responseBytes, Charsets.UTF_8)
                throw Exception("HTTP $code: $message")
            }

            val contentType = connection.contentType.orEmpty()

            // Sunucu JSON hata yanıtını 200 ile döndürürse
            // MP4/MP3 dosyası gibi kaydetmeyelim.
            if (contentType.contains("application/json", true)) {
                val body = String(responseBytes, Charsets.UTF_8)
                val error = try {
                    JSONObject(body).optString(
                        "error",
                        JSONObject(body).optString("message", body)
                    )
                } catch (_: Exception) {
                    body
                }
                throw Exception(error)
            }

            if (responseBytes.isEmpty()) {
                throw Exception("Sunucudan boş yanıt geldi.")
            }

            return responseBytes
        } finally {
            connection.disconnect()
        }
    }

    // =====================================================
    // UI HELPERS
    // =====================================================

    private fun makeText(
        text: String,
        size: Float,
        bold: Boolean
    ): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = size
            setTextColor(Color.WHITE)
            if (bold) setTypeface(null, Typeface.BOLD)
        }
    }

    private fun makeButton(text: String): Button {
        return Button(this).apply {
            this.text = text
            isAllCaps = false
        }
    }

    private fun fullHeight(height: Int): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(height)
        )
    }

    private fun weightedHeight(height: Int): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(
            0,
            dp(height),
            1f
        )
    }

    private fun spinnerAdapter(items: Array<String>): ArrayAdapter<String> {
        return ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            items
        )
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    private fun toast(message: String) {
        Toast.makeText(
            this,
            message,
            Toast.LENGTH_LONG
        ).show()
    }

    // =====================================================
    // CLEANUP
    // =====================================================

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
}
