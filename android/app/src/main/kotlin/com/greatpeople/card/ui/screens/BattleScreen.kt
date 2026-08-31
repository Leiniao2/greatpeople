package com.greatpeople.card.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

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
    var showRules by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fight Arena") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showRules = true }) {
                        Icon(Icons.Filled.Info, contentDescription = "Rules", tint = Color(0xFFF59E0B))
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

        // Rules dialog
        if (showRules) {
            BattleRulesDialog(onDismiss = { showRules = false })
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

// ── Rules dialog ──────────────────────────────────────────────────────────────

private data class RuleItem(val head: String, val body: String)
private data class RuleSection(val title: String, val items: List<RuleItem>)

private val BATTLE_RULES = listOf(
    RuleSection("Objective", listOf(
        RuleItem("", "First player to earn 5 Victory Points wins the game."),
    )),
    RuleSection("On Your Turn", listOf(
        RuleItem("Deploy", "Play one Great Person from your hand to any location."),
        RuleItem("Add Follower", "Place a follower at a location where you have a Great Person."),
        RuleItem("Move", "Relocate one of your cards to a different location."),
        RuleItem("Trigger Event", "Activate the event at a location where you have a Great Person."),
        RuleItem("Attack", "During a Local Event, challenge a rival's card."),
        RuleItem("Retrieve", "Return one of your cards from the board to your hand."),
    )),
    RuleSection("Events", listOf(
        RuleItem("⚔ Local Event", "Compare your total stat vs. rivals. Winner may attack the loser's card."),
        RuleItem("☠ Local Survival", "Cards at this location with that stat below 10 are discarded."),
        RuleItem("🏆 Global Competition", "Player with the highest total stat across all public cards earns a prize."),
        RuleItem("🌊 Natural Hazard", "Cards with total stats below 100 are discarded."),
    )),
    RuleSection("Victory Points", listOf(
        RuleItem("", "Win events and complete card achievements to earn points. Each card's achievement is shown in its detail view."),
    )),
)

@Composable
private fun BattleRulesDialog(onDismiss: () -> Unit) {
    val amber = Color(0xFFF59E0B)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("📖 How to Play") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                BATTLE_RULES.forEach { section ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            section.title.uppercase(),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.5.sp,
                            color = amber,
                        )
                        section.items.forEach { item ->
                            if (item.head.isEmpty()) {
                                Text(item.body, style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            } else {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(item.head, style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.width(100.dp))
                                    Text(item.body, style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Got it", color = amber) }
        },
    )
}
