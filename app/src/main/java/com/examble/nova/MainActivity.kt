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

        