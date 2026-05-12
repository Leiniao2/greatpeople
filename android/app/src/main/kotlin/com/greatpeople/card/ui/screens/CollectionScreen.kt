package com.greatpeople.card.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.greatpeople.card.data.loadDemoCards
import com.greatpeople.card.data.model.Card
import com.greatpeople.card.data.model.CardTier
import com.greatpeople.card.ui.viewmodel.CollectionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(
    isGuest: Boolean = false,
    onBattleClick: () -> Unit,
    onCardClick: (Card) -> Unit = {},
    onSignIn: () -> Unit = {},
    viewModel: CollectionViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val demoCards = remember { loadDemoCards(context) }
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
                        Text("Fight")
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
            }

            // Info
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(card.figureName, style = MaterialTheme.typography.titleSmall,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${card.era} · ${card.gender}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)

                if (card.identities.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        card.identities.take(2).forEach { identity ->
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFF59E0B).copy(alpha = 0.08f),
                                border = BorderStroke(0.5.dp, Color(0xFFF59E0B).copy(alpha = 0.3f)),
                            ) {
                                Text(
                                    identity,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                    color = Color(0xFFF59E0B).copy(alpha = 0.7f),
                                )
                            }
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
