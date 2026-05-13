package com.greatpeople.card.data.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import com.greatpeople.card.data.local.StringListConverter
import kotlinx.parcelize.Parcelize

@Parcelize
@Entity(tableName = "cards")
@TypeConverters(StringListConverter::class)
data class Card(
    @PrimaryKey val id: String,
    val figureName: String,
    val era: String,
    val gender: String = "",
    val identities: List<String> = emptyList(),
    val lore: String,
    val portraitUrl: String,
    val years: String = "",
    val trait: String = "",
    val achievement: String = "",
    val politics: Int = 0,
    val strength: Int = 0,
    val culture: Int = 0,
    val wealth: Int = 0,
    val intelligence: Int = 0,
    val technique: Int = 0,
    val belief: Int = 0,
    val reputation: Int = 0,
) : Parcelable
