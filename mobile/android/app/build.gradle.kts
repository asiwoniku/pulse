plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.pulse.pulse_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    // Required for the per-flavor buildConfigField values below.
    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Overridden per flavor below. A placeholder is used here only so an
        // un-flavored build still resolves; every real build passes --flavor.
        applicationId = "com.pulse.pulse"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Firebase/Google sign-in requires this to be a multiple of 64 on newer
        // plugins; keeping it explicit avoids a build-time surprise later.
        multiDexEnabled = true
    }

    /**
     * Product flavors: one app identity per company code.
     *
     * `applicationId` is baked into the APK at build time — it cannot vary per
     * user at runtime. So "a separate app for each driver" is not something an
     * app can do about itself; what it *can* do is give each **company** its own
     * installable app, and carry the individual driver's identity in the staff ID
     * they sign in with. That is the split this project takes:
     *
     *   pls-acme        Pulse   — Acme's partner workspace
     *   pls-acme-pulser Pulser  — Acme's driver app
     *
     * Build with:
     *   flutter build apk --release --flavor plsAcme -t lib/main.dart
     *   flutter build apk --release --flavor plsAcmePulser -t lib/main_pulser.dart
     *
     * Adding a company is one line here plus a matching google-services.json.
     */
    flavorDimensions += "company"

    productFlavors {
        create("plsAcme") {
            dimension = "company"
            applicationId = "pls.acme.pulse"
            resValue("string", "app_name", "Pulse")
            buildConfigField("String", "PULSE_APP", "\"partner\"")
            buildConfigField("String", "PULSE_COMPANY_CODE", "\"acme\"")
        }
        create("plsAcmePulser") {
            dimension = "company"
            applicationId = "pls.acme.pulser"
            resValue("string", "app_name", "Acme Pulser")
            buildConfigField("String", "PULSE_APP", "\"pulser\"")
            buildConfigField("String", "PULSE_COMPANY_CODE", "\"acme\"")
        }
        create("plsDemo") {
            dimension = "company"
            applicationId = "pls.demo.pulse"
            resValue("string", "app_name", "Pulse Demo")
            buildConfigField("String", "PULSE_APP", "\"partner\"")
            buildConfigField("String", "PULSE_COMPANY_CODE", "\"demo\"")
        }
        create("plsDemoPulser") {
            dimension = "company"
            applicationId = "pls.demo.pulser"
            resValue("string", "app_name", "Demo Pulser")
            buildConfigField("String", "PULSE_APP", "\"pulser\"")
            buildConfigField("String", "PULSE_COMPANY_CODE", "\"demo\"")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
