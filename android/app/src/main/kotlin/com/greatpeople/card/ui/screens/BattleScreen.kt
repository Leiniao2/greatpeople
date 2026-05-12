package com.greatpeople.card.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BattleScreen(
    isGuest: Boolean = false,
    onBack: () -> Unit,
    onSignIn: () -> Unit = {},
) {
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
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            if (isGuest) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.padding(32.dp),
                ) {
                    Surface(
                        shape = MaterialTheme.shapes.large,
                        color = Color(0xFFF59E0B).copy(alpha = 0.12f),
                        modifier = Modifier.size(80.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("⚔", style = MaterialTheme.typography.displaySmall)
                        }
                    }
                    Text("Sign In to Fight",
                        style = MaterialTheme.typography.headlineSmall,
                        textAlign = TextAlign.Center)
                    Text("Create a free account to challenge other players, earn cards, and build your collection.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center)
                    Button(
                        onClick = onSignIn,
                        modifier = Modifier.padding(top = 8.dp),
                    ) {
                        Text("Sign In / Register")
                    }
                }
            } else {
                // Battle state and WebSocket connection managed by a ViewModel
                Text("Battle arena goes here")
            }
        }
    }
}
