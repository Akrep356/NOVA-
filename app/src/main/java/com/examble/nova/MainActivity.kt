package com.nova.ai

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.media.MediaPlayer
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : Activity() {

    private var mediaPlayer: MediaPlayer? = null

    /*
     * NOVA müzik üretim sunucusunun adresi.
     *
     * Şimdilik kendi sunucumuz hazır olana kadar
     * bu adresi değiştirmiyoruz.
     */
    private val musicApiUrl = "https://nova-cf5h.onrender.com/generate"
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNovaInterface()
    }

    private fun createNovaInterface() {

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(Color.rgb(12, 12, 20))
        root.setPadding(dp(20), dp(24), dp(20), dp(20))

        val title = TextView(this)
        title.text = "NOVA"
        title.textSize = 32f
        title.setTextColor(Color.WHITE)
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD)
        title.gravity = Gravity.CENTER

        root.addView(
            title,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        )

        val subtitle = TextView(this)
        subtitle.text = "AI Müzik Video & Sanatçı Yarat"
        subtitle.textSize = 16f
        subtitle.setTextColor(Color.LTGRAY)
        subtitle.gravity = Gravity.CENTER

        root.addView(
            subtitle,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(45)
            )
        )

        val prompt = EditText(this)
        prompt.hint = "Nasıl bir şarkı oluşturmak istiyorsun?"
        prompt.setHintTextColor(Color.GRAY)
        prompt.setTextColor(Color.WHITE)
        prompt.setSingleLine(false)
        prompt.gravity = Gravity.TOP

        root.addView(
            prompt,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(120)
            )
        )

        val musicButton = Button(this)
        musicButton.text = "MÜZİK OLUŞTUR"

        musicButton.setOnClickListener {

            val userPrompt = prompt.text.toString().trim()

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

        val stopButton = Button(this)
        stopButton.text = "MÜZİĞİ DURDUR"

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

        val videoButton = Button(this)
        videoButton.text = "VİDEO OLUŞTUR"

        videoButton.setOnClickListener {
            Toast.makeText(
                this,
                "NOVA video oluşturma bölümü hazırlanıyor.",
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

        val artistButton = Button(this)
        artistButton.text = "SANATÇI OLUŞTUR"

        artistButton.setOnClickListener {
            Toast.makeText(
                this,
                "NOVA sanatçı oluşturma bölümü hazırlanıyor.",
                Toast.LENGTH_SHORT
            ).show()
        }

        root.addView(
            artistButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(55)
            )
        )

        setContentView(root)
    }

    private fun generateMusic(prompt: String) {

        Toast.makeText(
            this,
            "NOVA müzik oluşturuyor...",
            Toast.LENGTH_LONG
        ).show()

        thread {

            try {

                val url = URL(musicApiUrl)

                val connection =
                    url.openConnection() as HttpURLConnection

                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.connectTimeout = 30000
                connection.readTimeout = 120000
                connection.setRequestProperty(
                    "Content-Type",
                    "application/json"
                )

                val json =
                    "{\"prompt\":\"${escapeJson(prompt)}\"}"

                connection.outputStream.use { output ->
                    output.write(json.toByteArray())
                    output.flush()
                }

                val responseCode = connection.responseCode

                if (responseCode == 200) {

                    val musicFile =
                        File(cacheDir, "nova_music.mp3")

                    connection.inputStream.use { input ->

                        FileOutputStream(musicFile).use { output ->

                            val buffer = ByteArray(8192)

                            var length: Int

                            while (
                                input.read(buffer).also {
                                    length = it
                                } != -1
                            ) {
                                output.write(
                                    buffer,
                                    0,
                                    length
                                )
                            }
                        }
                    }

                    runOnUiThread {

                        Toast.makeText(
                            this,
                            "Müzik hazır! Çalınıyor...",
                            Toast.LENGTH_SHORT
                        ).show()

                        playMusic(musicFile)
                    }

                } else {

                    runOnUiThread {

                        Toast.makeText(
                            this,
                            "Müzik üretilemedi. Sunucu hatası: $responseCode",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }

                connection.disconnect()

            } catch (e: Exception) {

                runOnUiThread {

                    Toast.makeText(
                        this,
                        "Bağlantı hatası: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    private fun playMusic(file: File) {

        stopMusic()

        mediaPlayer = MediaPlayer()

        mediaPlayer?.setDataSource(
            file.absolutePath
        )

        mediaPlayer?.prepare()

        mediaPlayer?.start()

        mediaPlayer?.setOnCompletionListener {
            stopMusic()
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

    private fun escapeJson(text: String): String {

        return text
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
    }

    private fun dp(value: Int): Int {

        return (
            value *
            resources.displayMetrics.density
        ).toInt()
    }

    override fun onDestroy() {

        stopMusic()

        super.onDestroy()
    }
}
