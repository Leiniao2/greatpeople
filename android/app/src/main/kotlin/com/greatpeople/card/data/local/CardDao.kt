package com.greatpeople.card.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.greatpeople.card.data.model.Card
import kotlinx.coroutines.flow.Flow

@Dao
interface CardDao {
    @Query("SELECT * FROM cards")
    fun observeAll(): Flow<List<Card>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(cards: List<Card>)

    @Query("DELETE FROM cards")
    suspend fun deleteAll()
}
