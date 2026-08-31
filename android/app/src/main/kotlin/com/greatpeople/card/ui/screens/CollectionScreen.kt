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
import com.greatpeople.card.data.loadCards
import com.greatpeople.card.data.model.Card
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
    val allCards = remember { loadCards(context) }
    val ownedIds by viewModel.ownedIds.collectAsState()
    val loading by viewModel.loading.collectAsState()

    fun isOwned(card: Card) = !isGuest && ownedIds.contains(card.id)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Collection")
                        if (!loading || isGuest) Text("${allCards.size} cards",
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
                    Text("Complete stories in Epic mode to unlock cards",
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
                    loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(160.dp),
                        contentPadding = PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(allCards, key = { it.id }) { card ->
                            CardItem(card, owned = isOwned(card), onClick = { onCardClick(card) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CardItem(card: Card, owned: Boolean = true, onClick: () -> Unit = {}) {
    val accentColor = Color(0xFFF59E0B)

    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = MaterialTheme.shapes.medium,
    ) {
        Column {
            // Portrait
            Box(
                modifier = Modifier.fillMaxWidth().height(140.dp)
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                if (card.portraitUrl.isNotEmpty()) {
                    AsyncImage(
                        model = card.portraitUrl, contentDescription = card.figureName,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize().then(
                            if (!owned) Modifier.clip(MaterialTheme.shapes.medium) else Modifier
                        ),
                        alpha = if (owned) 1f else 0.35f,
                    )
                } else {
                    Text("♟", style = MaterialTheme.typography.displaySmall,
                        color = accentColor.copy(alpha = 0.4f))
                }
                if (!owned) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                            .padding(6.dp),
                    ) {
                        Text("🔒", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }

            // Info
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(card.figureName,
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = if (owned) Color.Unspecified else Color(0xFF94A3B8)
                    ),
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
