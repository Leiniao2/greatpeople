package com.greatpeople.card.ui.screens

import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import coil.compose.AsyncImage

/**
 * One of the painted medallion icons made with Google Flow
 * (assets/icons/icon_<key>.webp), the same set the web app uses.
 */
@Composable
fun MedallionIcon(key: String, size: Dp, modifier: Modifier = Modifier) {
    AsyncImage(
        model = "file:///android_asset/icons/icon_$key.webp",
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.size(size).clip(CircleShape),
    )
}
