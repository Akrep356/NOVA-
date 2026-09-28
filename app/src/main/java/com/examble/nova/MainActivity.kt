package com.examble.nova

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private val backgroundColor =
Color.rgb(10, 10, 18)
    private val cardColor =
Color.rgb(24, 24, 36)
    private val accentColor =
Color.rgb(110, 80, 225)
    private val whiteColor =
Color.WHITE
    private val grayColor=
Color.rgb(180, 180, 195)

    override run
onCreate(savedInstanceState: Bundle?)
{

super.onCreate(savedInstanceState)

        window.statusBarColor =
Color.BLACK
        window.navigationBarColor =
Color.BKACK

        createNovaInterface()
    }
    
    private run createNovaInterface()
{

        val root = LinearLayout(this)
        root.orientation =
LinearLayout.VERTICAL

root.setBackgroundColor(backgroundColor)
 
        root.setPadding(dp(20),
dp(30), dp(20), dp(20))

        val title = TextView(this)
        title.text = "NOVA"
        title.textSize = 36f
        title.setTextColor(whiteColor)
        title.setTypeface(null,
Typeface.BOLD
        title.gravity = Gravity.CENTER

        root.addView(
            title,
            LinearLayout.LayoutParams(

LinearLayout.LayoutParams.MATCH_PARENT,

LinearLayout.LayoutParams.WRAP_CONTENT
            )
        )

        val subtitle = TextView(this)
        subtitle.text = "AI Müzik 
Video & Sanatçı Yarat"
        subtitle.textSize = 16f

subtitle.setTextColor(grayColor)
        subtitle.gravity =
Gravity.CENTER
        subtitle.setPadding(0, dp(6),
0, dp(25))

        root.addView(
        subtitle,
        LinearLayout.LayoutParams(

LinearLayout.LayoutParams.MATCH_PARENT,

LinearLayout.LayoutParams.WRAP_CONTENT
            )
        )
        
        val welcome = TextView(this)

        welcome.text = "NOVA'ya hoş
geldin"
        welcome.textSize = 24f

welcome.setTextColor(whiteColor)
        welcome.setTypeface(null,
typeface.BOLD)
        welcome.gravity =
Gravity.CENTER

        root.adfView(
            welcome
            LinearLayout.LayoutParams(

LinearLayout.LayoutParams.MATCH_PARENT,

LinearLayout.LayiutParsms.WRAB_CONTENT
            )
        )

        val description =
TextView(this)
        description.text =
            "Hayalindeki müziği
oluştur, videonu hazırla ve kendi
sanatçını yarat."
        description.textSize = 15f

description.setTextColor(grayColor)
        description.gravity =
Gravity.CENTER
        description.setPadding(dp(10),
dp(10), dp(10), dp(25))

                root.addView(
            description,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        )

        val musicButton = Button(this)
        musicButton.text = "🎵 Müzik Oluştur"
        musicButton.textSize = 18f
        musicButton.setTextColor(whiteColor)
        musicButton.setBackgroundColor(accentColor)

        musicButton.setOnClickListener {
            Toast.makeText(
                this,
                "Müzik oluşturma bölümü hazırlanıyor...",
                Toast.LENGTH_SHORT
            ).show()
        }

        root.addView(
            musicButton,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(55)
            ).apply {
                setMargins(0, dp(10), 0, dp(10))
            }
        )

        val videoButton = Button(this)
        videoButton.text = "🎬 Video Oluştur"
        videoButton.textSize = 18f
        videoButton.setTextColor(whiteColor)
        videoButton.setBackgroundColor(cardColor)

        videoButton.setOnClickListener {
            Toast.makeText(
                this,
                "Video oluşturma bölümü hazırlanıyor...",
                Toast.LENGTH_SHORT
            ).show()
        }

        root.addView(
            videoButton,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(55)
            ).apply {
                setMargins(0, 0, 0, dp(10))
            }
        )

        val artistButton = Button(this)
        artistButton.text = "🎤 Sanatçı Oluştur"
        artistButton.textSize = 18f
        artistButton.setTextColor(whiteColor)
        artistButton.setBackgroundColor(cardColor)

        artistButton.setOnClickListener {
            Toast.makeText(
                this,
                "Sanatçı oluşturma bölümü hazırlanıyor...",
                Toast.LENGTH_SHORT
            ).show()
        }

        root.addView(
            artistButton,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(55)
            ).apply {
                setMargins(0, 0, 0, dp(10))
            }
        )

        val libraryButton = Button(this)
        libraryButton.text = "📁 Projelerim"
        libraryButton.textSize = 18f
        libraryButton.setTextColor(whiteColor)
        libraryButton.setBackgroundColor(cardColor)

        libraryButton.setOnClickListener {
            Toast.makeText(
                this,
                "Projelerim bölümü hazırlanıyor...",
                Toast.LENGTH_SHORT
            ).show()
        }

        root.addView(
            libraryButton,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(55)
            ).apply {
                setMargins(0, 0, 0, dp(10))
            }
        )

        val footer = TextView(this)
        footer.text = "NOVA • AI Music Video & Artist Creator"
        footer.textSize = 12f
        footer.setTextColor(grayColor)
        footer.gravity = Gravity.CENTER
        footer.setPadding(0, dp(20), 0, dp(10))

        root.addView(
            footer,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        )

        setContentView(root)
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }
}