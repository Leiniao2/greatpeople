package com.greatpeople.card.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

private data class BattleMode(
    val icon: String,
    val title: String,
    val subtitle: String,
    val accent: Color,
    val requiresAuth: Boolean,
)

private val BATTLE_MODES = listOf(
    BattleMode("🤝", "Casual",       "vs Human · Friendly",    Color(0xFF34d399), requiresAuth = true),
    BattleMode("🏆", "Ranked",       "vs Human · Competitive", Color(0xFFF59E0B), requiresAuth = true),
    BattleMode("🤖", "vs Computer",  "Fight AI opponents",     Color(0xFF818CF8), requiresAuth = false),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BattleScreen(
    isGuest: Boolean = false,
    onBack: () -> Unit,
    onSignIn: () -> Unit = {},
) {
    var showGuestDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fight Arena") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp, vertical = 32.dp),
        ) {
            // Header
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color(0xFF818CF8).copy(alpha = 0.12f),
                modifier = Modifier.size(72.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("⚔", style = MaterialTheme.typography.displaySmall)
                }
            }
            Text("FIGHT ARENA",
                style = MaterialTheme.typography.titleLarge,
                letterSpacing = MaterialTheme.typography.titleLarge.letterSpacing)
            Text("Deploy Great People across history's greatest cities",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center)

            Spacer(Modifier.height(8.dp))

            // Mode cards
            BATTLE_MODES.forEach { mode ->
                val locked = isGuest && mode.requiresAuth
                BattleModeCard(
                    mode = mode,
                    locked = locked,
                    onClick = {
                        if (locked) showGuestDialog = true
                        // else: navigate to lobby (future)
                    },
                )
            }

            if (isGuest) {
                Text(
                    "Sign in to unlock Casual & Ranked matches",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }

        // Guest sign-in dialog
        if (showGuestDialog) {
            AlertDialog(
                onDismissRequest = { showGuestDialog = false },
                icon = { Text("🔒", style = MaterialTheme.typography.displaySmall) },
                title = { Text("Sign In Required") },
                text = {
                    Text(
                        "Create a free account to challenge other players, earn cards, and climb the ranked ladder.",
                        textAlign = TextAlign.Center,
                    )
                },
                confirmButton = {
                    Button(onClick = { showGuestDialog = false; onSignIn() }) {
                        Text("Sign In / Register")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showGuestDialog = false }) {
                        Text("Maybe later")
                    }
                },
            )
        }
    }
}

@Composable
private fun BattleModeCard(mode: BattleMode, locked: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (locked) MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                        else mode.accent.copy(alpha = 0.35f),
                shape = RoundedCornerShape(16.dp),
            ),
        tonalElevation = if (locked) 0.dp else 1.dp,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 14.dp)
                .then(if (locked) Modifier.then(Modifier) else Modifier),
        ) {
            Text(mode.icon, style = MaterialTheme.typography.headlineSmall)
            Column(Modifier.weight(1f)) {
                Text(
                    mode.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = if (locked) MaterialTheme.colorScheme.onSurfaceVariant else mode.accent,
                )
                Text(
                    mode.subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                if (locked) "🔒" else "›",
                style = if (locked) MaterialTheme.typography.bodyMedium
                        else MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
