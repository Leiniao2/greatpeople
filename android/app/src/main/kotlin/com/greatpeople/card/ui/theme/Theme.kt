package com.greatpeople.card.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val ColorScheme = darkColorScheme(
    primary            = Amber500,
    onPrimary          = GPBackground,
    primaryContainer   = Amber900,
    onPrimaryContainer = Amber400,
    secondary          = Indigo500,
    onSecondary        = Color.White,
    secondaryContainer = Color(0xFF1E1B4B),
    background         = GPBackground,
    onBackground       = Color.White,
    surface            = GPSurface,
    onSurface          = Color.White,
    surfaceVariant     = GPSurfaceHigh,
    onSurfaceVariant   = Slate400,
    outline            = GPOutline,
    outlineVariant     = GPOutline,
    error              = ErrorRed,
    onError            = Color.White,
)

@Composable
fun GreatPeopleTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ColorScheme,
        content = content,
    )
}
