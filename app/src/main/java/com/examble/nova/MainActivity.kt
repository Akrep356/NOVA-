package com.nova.ai

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    override gün
onCreate(savedInstanceState: Bundle?)
{

süper.onCreate(savedInstanceState)

        val layou = LinearLayout(this)
        layout.orientation = LinearLayout.VERTICAL
        layout.set.Padding(32, 32, 32, 32)

        layout.gravity = Gravuty.CENTER

layout.setBackgroundColor(Color.BLACK)

        val title = TextView(this)
        title.text = "NOVA"
        title.textSize = 36f
title.setTextColor(Color.WHITE)
        title.gravity = Gravity.CENTER

        val subtitle = TextView(this)
        subtitle.text = "AI Music Video & Artist Creator"
        subtitle.textSize = 16f

subtitle.setTextColor(Color.LTGRAY)
        subtitle.gravity = Gravity.CENTER

        val musicButton = Button(this)
        musicButton.text = "🎧 Müzik Oluştur"
        musicButton.setOnClickListener
{

            Toast.makeText(this,
"Müzik oluşturma",
Toast.LENGTH_SHORT).show()
        }

        val videoButton = Button(this)
        videoBottun.text = "🎬 Video Oluştur"
        videoButton.setOnClickListener

{
            Toast.makeText(this,
"Video oluşturma",
Toast.LENGTH_SHORT).show()
        }

        val artistButton = Button(this)
        artistButton.text = "🎤 Sanatçı Oluştur"

artistButton.setOnClickListener {
            Toast.makeText(this,
Sanatçı oluşturma",
Toast.LENGTH_SHORT).show()
        }

        layout.addView(title)
        layout.addView(subtitle)
        layout.addView(musicButton)
        layout.addView(videoButto)
        layout.addView(artistButton)

        setContentView(layout)
    }
}
 