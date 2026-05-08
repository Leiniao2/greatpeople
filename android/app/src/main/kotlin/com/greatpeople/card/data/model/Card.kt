package com.greatpeople.card.data.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import com.greatpeople.card.data.local.StringListConverter
import kotlinx.parcelize.Parcelize

enum class CardTier { COMMON, RARE, EPIC, LEGENDARY }
enum class Domain { SCIENCE, ARTS, POLITICS, PHILOSOPHY, SPORTS, OTHER }

@Parcelize
@Entity(tableName = "cards")
@TypeConverters(StringListConverter::class)
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
    val years: String = "",
    val identities: List<String> = emptyList(),
    val characteristics: String = "",
    val achievement: String = "",
) : Parcelable
