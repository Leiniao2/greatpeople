package com.greatpeople.card.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.greatpeople.card.data.model.Card
import com.greatpeople.card.data.model.CardTier
import com.greatpeople.card.ui.theme.GPBackground

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardDetailScreen(card: Card, onBack: () -> Unit) {
    val tierColor = when (card.tier) {
        CardTier.LEGENDARY -> Color(0xFFF59E0B)
        CardTier.EPIC      -> Color(0xFF8B5CF6)
        CardTier.RARE      -> Color(0xFF3B82F6)
        CardTier.COMMON    -> Color(0xFF64748B)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    navigationIconContentColor = Color.White,
                ),
            )
        },
        containerColor = GPBackground,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = padding.calculateTopPadding())
                .verticalScroll(rememberScrollState()),
        ) {
            // ── Image slot (16:9 landscape) ──────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f),
            ) {
                if (card.portraitUrl.isNotEmpty()) {
                    AsyncImage(
                        model = card.portraitUrl,
                        contentDescription = card.figureName,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize()
                            .background(tierColor.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("♟", fontSize = 80.sp, color = tierColor.copy(alpha = 0.2f))
                    }
                }

                // Bottom gradient overlay
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .fillMaxHeight(0.45f)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, GPBackground.copy(alpha = 0.85f), GPBackground),
                            )
                        ),
                )

                // Name + years at bottom of image
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(horizontal = 20.dp, vertical = 20.dp),
                ) {
                    Text(
                        card.figureName,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                    if (card.years.isNotEmpty()) {
                        Text(
                            card.years,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.55f),
                        )
                    }
                }
            }

            // ── Info panel ───────────────────────────────────────────
            Column(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {

                // Identities
                if (card.identities.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        card.identities.take(2).forEach { identity ->
                            Surface(
                                color = tierColor.copy(alpha = 0.12f),
                                shape = CircleShape,
                                border = androidx.compose.foundation.BorderStroke(
                                    1.dp, tierColor.copy(alpha = 0.35f)
                                ),
                            ) {
                                Text(
                                    identity,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = tierColor,
                                )
                            }
                        }
                    }
                }

                // Characteristics
                if (card.characteristics.isNotEmpty()) {
                    InfoSection("Characteristics", card.characteristics, tierColor)
                }

                // Achievement
                if (card.achievement.isNotEmpty()) {
                    InfoSection("Achievement", card.achievement, tierColor)
                }

                // Stats — 4×2 grid
                val allStats = listOf(
                    listOf("POL" to card.politics, "STR" to card.strength, "CUL" to card.culture, "WEA" to card.wealth),
                    listOf("INT" to card.intelligence, "TEC" to card.technique, "BEL" to card.belief, "REP" to card.reputation),
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    allStats.forEach { row ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            row.forEach { (label, value) ->
                                Surface(
                                    modifier = Modifier.weight(1f),
                                    color = tierColor.copy(alpha = 0.07f),
                                    shape = RoundedCornerShape(10.dp),
                                    border = androidx.compose.foundation.BorderStroke(
                                        1.dp, tierColor.copy(alpha = 0.2f)
                                    ),
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 10.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        Text(value.toString(), fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold, color = tierColor)
                                        Text(label,
                                            style = MaterialTheme.typography.labelSmall,
                                            letterSpacing = 2.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                }

                // Era / Gender / Identities
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(card.era.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("·", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(card.gender.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (card.identities.isNotEmpty()) {
                        Text("·", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(card.identities.joinToString(", "),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                // Lore
                if (card.lore.isNotEmpty()) {
                    InfoSection("Lore", card.lore, tierColor, italic = true)
                }

                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun InfoSection(label: String, text: String, color: Color, italic: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
            color = color)
        Text(text,
            style = MaterialTheme.typography.bodyMedium,
            fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            color = if (italic) MaterialTheme.colorScheme.onSurfaceVariant
                    else Color.White.copy(alpha = 0.85f),
            lineHeight = 22.sp)
    }
}
