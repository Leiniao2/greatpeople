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
    Card(id = "demo-1", figureName = "Gandhi", era = "Modern", domain = Domain.POLITICS,
        influence = 97, innovation = 85, legacy = 98, tier = CardTier.LEGENDARY,
        lore = "The soul force that moved an empire.",
        portraitUrl = "file:///android_asset/portraits/portrait_gandhi.jpeg",
        years = "1869–1948", identities = listOf("Leader", "Activist"),
        characteristics = "Resolute, compassionate, and unwavering in pursuit of justice through nonviolence.",
        achievement = "Led India's independence movement through peaceful civil disobedience, inspiring liberation movements worldwide."),
    Card(id = "demo-2", figureName = "Coco Chanel", era = "Modern", domain = Domain.ARTS,
        influence = 88, innovation = 93, legacy = 90, tier = CardTier.EPIC,
        lore = "She dressed the world in modernity.",
        portraitUrl = "file:///android_asset/portraits/portrait_coco_chanel.jpeg",
        years = "1883–1971", identities = listOf("Designer", "Pioneer"),
        characteristics = "Audacious, elegant, and fiercely independent in defiance of convention.",
        achievement = "Liberated women's fashion from corsets and built a global luxury empire around her name."),
    Card(id = "demo-3", figureName = "Mao Zedong", era = "Modern", domain = Domain.POLITICS,
        influence = 92, innovation = 78, legacy = 88, tier = CardTier.EPIC,
        lore = "A revolution forged from peasant to chairman.",
        portraitUrl = "file:///android_asset/portraits/portrait_mao_zedong.jpeg",
        years = "1893–1976", identities = listOf("Revolutionary", "Statesman"),
        characteristics = "Strategic, ideological, and ruthlessly determined in reshaping society.",
        achievement = "Founded the People's Republic of China and united it under Communist rule in 1949."),
    Card(id = "demo-4", figureName = "Belisarius", era = "Byzantine", domain = Domain.POLITICS,
        influence = 75, innovation = 82, legacy = 72, tier = CardTier.RARE,
        lore = "The last great general of Rome.",
        portraitUrl = "file:///android_asset/portraits/portrait_belisarius.jpeg",
        years = "505–565 AD", identities = listOf("General", "Commander"),
        characteristics = "Brilliant tactician, loyal to a fault, and capable of the impossible.",
        achievement = "Reconquered North Africa and Italy for the Byzantine Empire with a fraction of the expected resources."),
    Card(id = "demo-5", figureName = "Imhotep", era = "Ancient", domain = Domain.ARTS,
        influence = 85, innovation = 96, legacy = 88, tier = CardTier.LEGENDARY,
        lore = "Deified by two civilizations for mastery of stone and medicine.",
        portraitUrl = "file:///android_asset/portraits/portrait_imhotep.jpeg",
        years = "c. 2650–2600 BC", identities = listOf("Architect", "Physician"),
        characteristics = "Visionary, meticulous, and revered as a god in his own time.",
        achievement = "Designed the Step Pyramid of Djoser — the world's first monumental stone structure."),
    Card(id = "demo-6", figureName = "Lu Yu", era = "Tang Dynasty", domain = Domain.ARTS,
        influence = 65, innovation = 80, legacy = 70, tier = CardTier.RARE,
        lore = "He turned leaves and water into philosophy.",
        portraitUrl = "file:///android_asset/portraits/portrait_lu_yu.jpeg",
        years = "733–804 AD", identities = listOf("Scholar", "Tea Master"),
        characteristics = "Reflective, disciplined, and devoted to the art of simplicity.",
        achievement = "Authored The Classic of Tea, establishing the philosophy and ritual of Chinese tea culture."),
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
