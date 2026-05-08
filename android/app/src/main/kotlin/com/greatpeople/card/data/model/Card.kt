package com.greatpeople.card.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class CardTier { COMMON, RARE, EPIC, LEGENDARY }
enum class Domain { SCIENCE, ARTS, POLITICS, PHILOSOPHY, SPORTS, OTHER }

@Entity(tableName = "cards")
data class Card(
    @PrimaryKey val id: String,
    val figureName: String,
    val era: String,
    val domain: Domain,
    val influence: Int,
    val innovation: Int,
    val legacy: Int,
    val tier: CardTier,
    val lore: String,
    val portraitUrl: String,
)
