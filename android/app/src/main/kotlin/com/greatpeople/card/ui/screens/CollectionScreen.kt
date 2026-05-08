package com.greatpeople.card.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.greatpeople.card.data.model.Card

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(onBattleClick: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Collection") },
                actions = { Button(onClick = onBattleClick) { Text("Battle") } },
            )
        }
    ) { padding ->
        // Cards will be provided by a ViewModel connected to the Room cache
        Text("Card grid goes here", modifier = Modifier.padding(padding).padding(16.dp))
    }
}
