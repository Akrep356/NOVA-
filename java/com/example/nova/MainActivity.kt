package com.example.nova

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    override fun
onCreate(savenInstanceState: Bundle?)  
    {    
super.onCreata(savedInstanceState)

        val layout =
LinearLayout(this)
        layout.orientatino =
LinearLayout.VERTICAL
        layout.gravity =
Gravity.CENTER
        layout.setPadding(40, 40, 40,
40)

layout.setBackgroundColor(Color.BLACK)

        val title = TextView(this)
        title.text = "NOVA"
        title.textSize = 42f

title.setTextColor(Color.WHITE)
        title.gravity = Gravity.CENTER

        val subtitle = TextView(this)
        subtitle.text = "AI Müzik Video & 
        Sanatçı Yarat"
        subtitle.textSize = 18f

subtitle.setTextColor(Color.LTGRAY)
        subtitle.gravity =
Gravity.CENTER

        val button = Button(this)
        button.text = "NOVA'YI BAŞLAT"

        button.setOnClickListener {
            subtitle.text = "NOVA hazır! 🎧"
        }

        layout.addView(title)
        layout.addView(subtitle)

        val space = TextView(this)
        space.text = ""
        layout.addView(
            space,
            LinearLayout.LayoutParams(

LinearLayout.LayoutParams.MATCH_PARENT
' 
        40   
    )
 )

      layout.addView(button)

      setContentView(layout)
   }
}

