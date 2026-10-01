package com.pulse.logistics.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Pulse Blue. Dispatch screens are read in daylight on a phone mounted in a
// vehicle, so the primary pair is chosen for contrast at arm's length, not for
// marketing. Status colours are reserved for order states and nothing else:
// a colour that also means "success banner" stops being a status signal.
val PulseBlue = Color(0xFF0B3D91)
val PulseBlueLit = Color(0xFF4A7BD8)
val PulseBlueDeep = Color(0xFF062A63)
val PulseInk = Color(0xFF10161F)
val PulseSurface = Color(0xFFF6F8FC)
val PulseSurfaceDim = Color(0xFFE4E9F2)

val StatusCreated = Color(0xFF5B6472)
val StatusAssigned = Color(0xFF0B6FA4)
val StatusActive = Color(0xFF1F6B3A)
val StatusDelivered = Color(0xFF2E7D32)
val StatusProblem = Color(0xFFB3261E)
val StatusCancelled = Color(0xFF6B6F76)
// A configured-but-unavailable integration reads amber, never green and never
// red: it is neither working nor failing.
val StatusUnconfigured = Color(0xFF8A6100)

private val LightScheme = lightColorScheme(
    primary = PulseBlue,
    onPrimary = Color.White,
    primaryContainer = PulseSurfaceDim,
    onPrimaryContainer = PulseBlueDeep,
    secondary = PulseBlueLit,
    onSecondary = Color.White,
    surface = PulseSurface,
    onSurface = PulseInk,
    surfaceVariant = PulseSurfaceDim,
    onSurfaceVariant = Color(0xFF39414D),
    error = StatusProblem,
    onError = Color.White,
)

private val DarkScheme = darkColorScheme(
    primary = PulseBlueLit,
    onPrimary = PulseBlueDeep,
    primaryContainer = PulseBlueDeep,
    onPrimaryContainer = Color.White,
    secondary = PulseBlueLit,
    onSecondary = PulseBlueDeep,
    surface = Color(0xFF10151C),
    onSurface = Color(0xFFE6EAF2),
    surfaceVariant = Color(0xFF1B2430),
    onSurfaceVariant = Color(0xFFBFC7D4),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
)

@Composable
fun PulseTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        typography = PulseTypography,
        content = content,
    )
}

val PulseTypography = Typography()
