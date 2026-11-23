package com.sanzar.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

val LocalSanzarPalette = staticCompositionLocalOf { SanzarLightPalette }

private val SanzarShapes = Shapes(
    extraSmall = RoundedCornerShape(SanzarRadius.XS.dp),
    small = RoundedCornerShape(SanzarRadius.SM.dp),
    medium = RoundedCornerShape(SanzarRadius.MD.dp),
    large = RoundedCornerShape(SanzarRadius.LG.dp),
    extraLarge = RoundedCornerShape(SanzarRadius.XL.dp)
)

@Composable
fun SanzarTheme(
    themeMode: String = "system",
    content: @Composable () -> Unit
) {
    val useDark = when (themeMode) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    val palette = if (useDark) SanzarDarkPalette else SanzarLightPalette
    val colorScheme = if (useDark) {
        darkColorScheme(
            primary = palette.primary,
            onPrimary = palette.onPrimary,
            secondary = SanzarColors.Gold,
            onSecondary = SanzarColors.BrandForest,
            error = SanzarColors.Danger,
            onError = Color.White,
            background = palette.bg,
            onBackground = palette.text,
            surface = palette.surface,
            onSurface = palette.text,
            surfaceVariant = palette.surface2,
            onSurfaceVariant = palette.muted,
            outline = palette.border,
            primaryContainer = palette.primarySoft,
            onPrimaryContainer = palette.primary
        )
    } else {
        lightColorScheme(
            primary = palette.primary,
            onPrimary = palette.onPrimary,
            secondary = SanzarColors.Gold,
            onSecondary = SanzarColors.BrandForest,
            error = SanzarColors.dangerColorOrDefault(),
            onError = Color.White,
            background = palette.bg,
            onBackground = palette.text,
            surface = palette.surface,
            onSurface = palette.text,
            surfaceVariant = palette.surface2,
            onSurfaceVariant = palette.muted,
            outline = palette.border,
            primaryContainer = palette.primarySoft,
            onPrimaryContainer = palette.primary
        )
    }

    CompositionLocalProvider(LocalSanzarPalette provides palette) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = SanzarTypography,
            shapes = SanzarShapes,
            content = content
        )
    }
}

private fun SanzarColors.dangerColorOrDefault(): Color = Danger
