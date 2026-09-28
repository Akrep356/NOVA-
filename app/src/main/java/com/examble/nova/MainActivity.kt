package com.example.nova

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

class MainActivity : Activity() {

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
            Toast.makeText(
                this,
                "NOVA müzik oluşturma özelliği hazırlanıyor.",
                Toast.LENGTH_SHORT
            ).show()
        }

        root.addView(
            musicButton,
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
                "NOVA video oluşturma özelliği hazırlanıyor.",
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
                "NOVA sanatçı oluşturma özelliği hazırlanıyor.",
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

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }
}