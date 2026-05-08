package com.greatpeople.card

import com.greatpeople.card.data.model.Card
import com.greatpeople.card.data.model.CardTier
import com.greatpeople.card.data.model.Domain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CardModelTest {

    private fun makeCard(
        id: String = "1",
        figureName: String = "Albert Einstein",
        era: String = "Modern",
        domain: Domain = Domain.SCIENCE,
        influence: Int = 95,
        innovation: Int = 98,
        legacy: Int = 99,
        tier: CardTier = CardTier.LEGENDARY,
        lore: String = "Developed the theory of relativity.",
        portraitUrl: String = "https://example.com/einstein.png",
        years: String = "",
        identities: List<String> = emptyList(),
        characteristics: String = "",
        achievement: String = "",
    ): Card = Card(
        id = id,
        figureName = figureName,
        era = era,
        domain = domain,
        influence = influence,
        innovation = innovation,
        legacy = legacy,
        tier = tier,
        lore = lore,
        portraitUrl = portraitUrl,
        years = years,
        identities = identities,
        characteristics = characteristics,
        achievement = achievement,
    )

    // Default value tests

    @Test
    fun `Card years defaults to empty string`() {
        val card = makeCard()
        assertEquals("", card.years)
    }

    @Test
    fun `Card identities defaults to empty list`() {
        val card = makeCard()
        assertEquals(emptyList<String>(), card.identities)
    }

    @Test
    fun `Card characteristics defaults to empty string`() {
        val card = makeCard()
        assertEquals("", card.characteristics)
    }

    @Test
    fun `Card achievement defaults to empty string`() {
        val card = makeCard()
        assertEquals("", card.achievement)
    }

    @Test
    fun `Card stores provided optional fields correctly`() {
        val card = makeCard(
            years = "1879–1955",
            identities = listOf("German", "Swiss", "American"),
            characteristics = "Theoretical physicist",
            achievement = "Nobel Prize in Physics 1921",
        )
        assertEquals("1879–1955", card.years)
        assertEquals(listOf("German", "Swiss", "American"), card.identities)
        assertEquals("Theoretical physicist", card.characteristics)
        assertEquals("Nobel Prize in Physics 1921", card.achievement)
    }

    // CardTier enum tests

    @Test
    fun `CardTier enum has exactly 4 values`() {
        assertEquals(4, CardTier.entries.size)
    }

    @Test
    fun `CardTier enum contains COMMON`() {
        assertEquals(CardTier.COMMON, CardTier.valueOf("COMMON"))
    }

    @Test
    fun `CardTier enum contains RARE`() {
        assertEquals(CardTier.RARE, CardTier.valueOf("RARE"))
    }

    @Test
    fun `CardTier enum contains EPIC`() {
        assertEquals(CardTier.EPIC, CardTier.valueOf("EPIC"))
    }

    @Test
    fun `CardTier enum contains LEGENDARY`() {
        assertEquals(CardTier.LEGENDARY, CardTier.valueOf("LEGENDARY"))
    }

    // Domain enum tests

    @Test
    fun `Domain enum has exactly 6 values`() {
        assertEquals(6, Domain.entries.size)
    }

    @Test
    fun `Domain enum contains SCIENCE`() {
        assertEquals(Domain.SCIENCE, Domain.valueOf("SCIENCE"))
    }

    @Test
    fun `Domain enum contains ARTS`() {
        assertEquals(Domain.ARTS, Domain.valueOf("ARTS"))
    }

    @Test
    fun `Domain enum contains POLITICS`() {
        assertEquals(Domain.POLITICS, Domain.valueOf("POLITICS"))
    }

    @Test
    fun `Domain enum contains PHILOSOPHY`() {
        assertEquals(Domain.PHILOSOPHY, Domain.valueOf("PHILOSOPHY"))
    }

    @Test
    fun `Domain enum contains SPORTS`() {
        assertEquals(Domain.SPORTS, Domain.valueOf("SPORTS"))
    }

    @Test
    fun `Domain enum contains OTHER`() {
        assertEquals(Domain.OTHER, Domain.valueOf("OTHER"))
    }

    // Card equality tests

    @Test
    fun `two Cards with same id and fields are equal`() {
        val card1 = makeCard(id = "abc123")
        val card2 = makeCard(id = "abc123")
        assertEquals(card1, card2)
    }

    @Test
    fun `two Cards with different ids are not equal`() {
        val card1 = makeCard(id = "abc123")
        val card2 = makeCard(id = "xyz789")
        assertNotEquals(card1, card2)
    }

    @Test
    fun `Card copy with same id is equal to original`() {
        val card = makeCard(id = "abc123")
        val copy = card.copy()
        assertEquals(card, copy)
    }

    @Test
    fun `Card copy with different id is not equal to original`() {
        val card = makeCard(id = "abc123")
        val modified = card.copy(id = "different")
        assertNotEquals(card, modified)
    }
}
