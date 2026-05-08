package com.greatpeople.card.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.greatpeople.card.data.model.Card
import com.greatpeople.card.data.model.CardTier
import com.greatpeople.card.data.model.Domain
import com.greatpeople.card.ui.viewmodel.CollectionViewModel

private val demoCards = listOf(
    Card(id = "demo-1", figureName = "Leonardo da Vinci", era = "Renaissance", domain = Domain.ARTS,
        influence = 95, innovation = 98, legacy = 100, tier = CardTier.LEGENDARY,
        lore = "The ultimate Renaissance man.", portraitUrl = "",
        years = "1452–1519", identities = listOf("Polymath", "Inventor"),
        characteristics = "Insatiably curious, visionary, and obsessively detail-oriented.",
        achievement = "Painted the Mona Lisa; designed flying machines centuries before they were built."),
    Card(id = "demo-2", figureName = "Marie Curie", era = "Modern", domain = Domain.SCIENCE,
        influence = 88, innovation = 95, legacy = 92, tier = CardTier.EPIC,
        lore = "She broke every barrier twice.", portraitUrl = "",
        years = "1867–1934", identities = listOf("Scientist", "Pioneer"),
        characteristics = "Rigorous, determined, and fearless in the face of adversity.",
        achievement = "First person to win Nobel Prizes in two sciences — Physics and Chemistry."),
    Card(id = "demo-3", figureName = "Nikola Tesla", era = "Industrial", domain = Domain.SCIENCE,
        influence = 82, innovation = 97, legacy = 85, tier = CardTier.EPIC,
        lore = "Visionary engineer ahead of his time.", portraitUrl = "",
        years = "1856–1943", identities = listOf("Inventor", "Engineer"),
        characteristics = "Eccentric, brilliant, and relentlessly inventive.",
        achievement = "Developed alternating current (AC) systems powering the modern world."),
    Card(id = "demo-4", figureName = "Julius Caesar", era = "Ancient", domain = Domain.POLITICS,
        influence = 90, innovation = 72, legacy = 88, tier = CardTier.RARE,
        lore = "His name became a title for millennia.", portraitUrl = "",
        years = "100–44 BC", identities = listOf("General", "Statesman"),
        characteristics = "Decisive, charismatic, calculating, and supremely confident.",
        achievement = "Conquered Gaul and reformed the Roman calendar still in use today."),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(
    isGuest: Boolean = false,
    onBattleClick: () -> Unit,
    onCardClick: (Card) -> Unit = {},
    onSignIn: () -> Unit = {},
    viewModel: CollectionViewModel = hiltViewModel(),
) {
    val vmCards by viewModel.cards.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val cards = if (isGuest) demoCards else vmCards

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(if (isGuest) "Demo Collection" else "My Collection")
                        if (!loading || isGuest) Text("${cards.size} cards",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                actions = {
                    Button(onClick = onBattleClick, modifier = Modifier.padding(end = 8.dp)) {
                        Text("Battle")
                    }
                },
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Guest banner
            if (isGuest) {
                Row(
                    modifier = Modifier.fillMaxWidth()
                        .background(Color(0xFFF59E0B).copy(alpha = 0.08f))
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Exploring as guest — demo cards only",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFFF59E0B).copy(alpha = 0.8f),
                        modifier = Modifier.weight(1f))
                    TextButton(onClick = onSignIn, contentPadding = PaddingValues(0.dp)) {
                        Text("Sign In",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                            color = Color(0xFFF59E0B))
                    }
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    loading && !isGuest -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    cards.isEmpty() -> EmptyState(modifier = Modifier.align(Alignment.Center))
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(160.dp),
                        contentPadding = PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(cards, key = { it.id }) { card ->
                            CardItem(card, onClick = { onCardClick(card) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CardItem(card: Card, onClick: () -> Unit = {}) {
    val tierColor = when (card.tier) {
        CardTier.LEGENDARY -> Color(0xFFD97706)
        CardTier.EPIC      -> Color(0xFF7C3AED)
        CardTier.RARE      -> Color(0xFF2563EB)
        CardTier.COMMON    -> Color(0xFF475569)
    }

    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = MaterialTheme.shapes.medium,
    ) {
        Column {
            // Portrait
            Box(
                modifier = Modifier.fillMaxWidth().height(140.dp)
                    .background(tierColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                if (card.portraitUrl.isNotEmpty()) {
                    AsyncImage(
                        model = card.portraitUrl, contentDescription = card.figureName,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Text("♟", style = MaterialTheme.typography.displaySmall,
                        color = tierColor.copy(alpha = 0.4f))
                }
                // Tier badge
                Surface(
                    modifier = Modifier.align(Alignment.TopEnd).padding(6.dp),
                    color = tierColor.copy(alpha = 0.85f),
                    shape = MaterialTheme.shapes.extraSmall,
                ) {
                    Text(card.tier.name.lowercase().replaceFirstChar { it.uppercase() },
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White)
                }
            }

            // Info
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(card.figureName, style = MaterialTheme.typography.titleSmall,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${card.era} · ${card.domain.name.lowercase()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)

                // Stats
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    listOf("INF" to card.influence, "INN" to card.innovation, "LEG" to card.legacy)
                        .forEach { (label, value) ->
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(value.toString(), style = MaterialTheme.typography.labelMedium,
                                    color = tierColor)
                                Text(label, style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(modifier: Modifier = Modifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("♛", style = MaterialTheme.typography.displayMedium)
        Text("No cards yet", style = MaterialTheme.typography.titleMedium)
        Text("Win battles to earn cards", style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
