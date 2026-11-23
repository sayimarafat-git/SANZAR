package com.sanzar.app.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

object SanzarColors {
    val BrandEmerald = Color(0xFF176B4B)
    val BrandJade = Color(0xFF247754)
    val BrandForest = Color(0xFF12392A)
    val Success = Color(0xFF19B46B)
    val Warning = Color(0xFFF5A524)
    val Danger = Color(0xFFEF4444)
    val Gold = Color(0xFFC6A46A)

    val BrandGradient = Brush.linearGradient(
        colors = listOf(Color(0xFF0B523B), Color(0xFF146C4D), Color(0xFF247754))
    )

    val HeroGradient = Brush.linearGradient(
        colors = listOf(Color(0xFF0B1D14), Color(0xFF12402D), Color(0xFF1D6044))
    )

    val SubjectColors = mapOf(
        "math" to Color(0xFF3D6BFF),
        "physics" to Color(0xFF3E8092),
        "chemistry" to Color(0xFFD97A3E),
        "biology" to Color(0xFF258A5C),
        "english" to Color(0xFFD95D72),
        "ict" to Color(0xFF1A86A0),
        "bangla" to Color(0xFFB28A45),
        "others" to Color(0xFF66786D)
    )

    fun forSubject(id: String): Color = SubjectColors[id] ?: SubjectColors.getValue("others")

    fun parseHex(hex: String?, fallback: Color): Color {
        if (hex.isNullOrBlank()) return fallback
        val clean = hex.trim().removePrefix("#")
        return try {
            val argb = when (clean.length) {
                6 -> ("FF$clean").toLong(16)
                8 -> clean.toLong(16)
                else -> return fallback
            }
            Color(argb.toInt())
        } catch (_: NumberFormatException) {
            fallback
        }
    }
}

data class SanzarPalette(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val text: Color,
    val text2: Color,
    val muted: Color,
    val border: Color,
    val primary: Color,
    val onPrimary: Color,
    val primarySoft: Color,
    val isDark: Boolean
)

val SanzarLightPalette = SanzarPalette(
    bg = Color(0xFFF2F6F1),
    surface = Color(0xFFFFFFFF),
    surface2 = Color(0xFFF4F7F2),
    text = Color(0xFF15251B),
    text2 = Color(0xFF42584A),
    muted = Color(0xFF637268),
    border = Color(0xFFDCE7DE),
    primary = Color(0xFF176B4B),
    onPrimary = Color(0xFFFFFFFF),
    primarySoft = Color(0xFFE2F0E7),
    isDark = false
)

val SanzarDarkPalette = SanzarPalette(
    bg = Color(0xFF09140F),
    surface = Color(0xFF13231A),
    surface2 = Color(0xFF1B2D22),
    text = Color(0xFFEEF5EF),
    text2 = Color(0xFFC8D7CA),
    muted = Color(0xFF92A496),
    border = Color(0xFF2C4233),
    primary = Color(0xFF6FC294),
    onPrimary = Color(0xFF102017),
    primarySoft = Color(0xFF1D3D2B),
    isDark = true
)

object SanzarRadius {
    const val XS = 8
    const val SM = 12
    const val MD = 16
    const val LG = 20
    const val XL = 28
}

object SanzarSpace {
    const val S1 = 4
    const val S2 = 8
    const val S3 = 12
    const val S4 = 16
    const val S5 = 20
    const val S6 = 24
    const val S8 = 32
}
