package com.greatpeople.card.ui.screens

import androidx.compose.foundation.background
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
import com.greatpeople.card.ui.viewmodel.CollectionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(
    onBattleClick: () -> Unit,
    viewModel: CollectionViewModel = hiltViewModel(),
) {
    val cards by viewModel.cards.collectAsState()
    val loading by viewModel.loading.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("My Collection")
                        if (!loading) Text("${cards.size} cards",
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
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                cards.isEmpty() -> EmptyState(modifier = Modifier.align(Alignment.Center))
                else -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(160.dp),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(cards, key = { it.id }) { card -> CardItem(card) }
                }
            }
        }
    }
}

@Composable
private fun CardItem(card: Card) {
    val tierColor = when (card.tier) {
        CardTier.LEGENDARY -> Color(0xFFD97706)
        CardTier.EPIC      -> Color(0xFF7C3AED)
        CardTier.RARE      -> Color(0xFF2563EB)
        CardTier.COMMON    -> Color(0xFF475569)
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
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
