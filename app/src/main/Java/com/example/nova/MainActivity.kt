package com.nova.ai

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    
    override fun
onCreate(savedInstanceState: Bundle?)
  {

super.onCreate(savedInstanceState)

        val textView = TextView(this)
        textView.text = "NOVA\nAI
Müzik Video & Sanatçı Yarat"
        textView.textSize = 24f
      
        setContentView(textView)
  }
}
