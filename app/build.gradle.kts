plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.nova.ai"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nova.ai"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
    }
}

dependencies {

implementation("androidx.core:core-ktx:1.15.0")

implementation("androidx.appcompat:appcompat:1.7.0")
}
