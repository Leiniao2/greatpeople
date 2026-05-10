package com.greatpeople.card.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Amber = Color(0xFFF59E0B)
private val BackgroundColor = Color(0xFF080812)

private data class ModeItem(
    val icon: String,
    val name: String,
    val subtitle: String,
)

private val modes = listOf(
    ModeItem("⚡", "EPIC",       "Unlock stories, earn cards"),
    ModeItem("♛", "COLLECTION", "Your card gallery"),
    ModeItem("⚔", "BATTLE",     "Compete with others"),
    ModeItem("◉", "PROFILE",    "Your account & stats"),
)

@Composable
fun HomeScreen(
    isGuest: Boolean = false,
    onSignIn: () -> Unit = {},
    onEpic: () -> Unit = {},
    onCollection: () -> Unit = {},
    onBattle: () -> Unit = {},
    onProfile: () -> Unit = {},
) {
    val modeCallbacks = listOf(onEpic, onCollection, onBattle, onProfile)

    Scaffold(
        containerColor = BackgroundColor,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Guest banner
            if (isGuest) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Amber.copy(alpha = 0.08f))
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Exploring as guest — sign in to save progress",
                        style = MaterialTheme.typography.labelSmall,
                        color = Amber.copy(alpha = 0.8f),
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = onSignIn, contentPadding = PaddingValues(0.dp)) {
                        Text(
                            "Sign In",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.SemiBold,
                            ),
                            color = Amber,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Logo area
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 40.dp),
            ) {
                Surface(
                    modifier = Modifier.size(64.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = Amber.copy(alpha = 0.12f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Amber.copy(alpha = 0.25f)),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("⚡", fontSize = 28.sp)
                    }
                }

                Text(
                    "GREAT PEOPLE",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 4.sp,
                        color = Color.White,
                    ),
                )

                Text(
                    "COLLECTIBLE CARD GAME",
                    style = MaterialTheme.typography.labelSmall.copy(
                        letterSpacing = 3.sp,
                        color = Color(0xFF94A3B8),
                    ),
                )
            }

            // Mode buttons
            Column(
                modifier = Modifier
                    .widthIn(max = 400.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                modes.forEachIndexed { index, mode ->
                    HomeModeButton(
                        mode = mode,
                        onClick = modeCallbacks[index],
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun HomeModeButton(mode: ModeItem, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = Amber.copy(alpha = 0.25f),
                shape = RoundedCornerShape(16.dp),
            )
            .background(
                color = Color.White.copy(alpha = 0.03f),
                shape = RoundedCornerShape(16.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Icon box
        Surface(
            modifier = Modifier.size(44.dp),
            shape = RoundedCornerShape(12.dp),
            color = Amber.copy(alpha = 0.12f),
            border = androidx.compose.foundation.BorderStroke(1.dp, Amber.copy(alpha = 0.20f)),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(mode.icon, fontSize = 20.sp)
            }
        }

        // Labels
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                mode.name,
                style = MaterialTheme.typography.titleSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = Color.White,
                ),
            )
            Text(
                mode.subtitle,
                style = MaterialTheme.typography.labelSmall.copy(
                    color = Color(0xFF94A3B8),
                ),
            )
        }

        // Arrow
        Text(
            "→",
            style = MaterialTheme.typography.titleMedium.copy(
                color = Amber.copy(alpha = 0.6f),
            ),
        )
    }
}
