package com.greatpeople.card

import com.greatpeople.card.data.model.Card
import com.greatpeople.card.data.model.CardTier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CardModelTest {

    private fun makeCard(
        id: String = "1",
        figureName: String = "Alan Turing",
        era: String = "Electricity",
        gender: String = "male",
        identities: List<String> = emptyList(),
        tier: CardTier = CardTier.LEGENDARY,
        lore: String = "He built the machine that broke the unbreakable.",
        portraitUrl: String = "https://example.com/turing.png",
        years: String = "1912–1954",
        trait: String = "",
        achievement: String = "",
        politics: Int = 40,
        strength: Int = 25,
        culture: Int = 65,
        wealth: Int = 35,
        intelligence: Int = 98,
        technique: Int = 92,
        belief: Int = 20,
        reputation: Int = 80,
    ): Card = Card(
        id = id,
        figureName = figureName,
        era = era,
        gender = gender,
        identities = identities,
        tier = tier,
        lore = lore,
        portraitUrl = portraitUrl,
        years = years,
        trait = trait,
        achievement = achievement,
        politics = politics,
        strength = strength,
        culture = culture,
        wealth = wealth,
        intelligence = intelligence,
        technique = technique,
        belief = belief,
        reputation = reputation,
    )

    // Default value tests

    @Test
    fun `Card years defaults to provided value`() {
        val card = makeCard(years = "1912–1954")
        assertEquals("1912–1954", card.years)
    }

    @Test
    fun `Card identities defaults to empty list`() {
        val card = makeCard()
        assertEquals(emptyList<String>(), card.identities)
    }

    @Test
    fun `Card trait defaults to empty string`() {
        val card = makeCard()
        assertEquals("", card.trait)
    }

    @Test
    fun `Card achievement defaults to empty string`() {
        val card = makeCard()
        assertEquals("", card.achievement)
    }

    @Test
    fun `Card stores gender correctly`() {
        val male = makeCard(gender = "male")
        val female = makeCard(gender = "female")
        assertEquals("male", male.gender)
        assertEquals("female", female.gender)
    }

    @Test
    fun `Card stores all eight stats correctly`() {
        val card = makeCard(
            politics = 92, strength = 35, culture = 78, wealth = 25,
            intelligence = 82, technique = 40, belief = 90, reputation = 95,
        )
        assertEquals(92, card.politics)
        assertEquals(35, card.strength)
        assertEquals(78, card.culture)
        assertEquals(25, card.wealth)
        assertEquals(82, card.intelligence)
        assertEquals(40, card.technique)
        assertEquals(90, card.belief)
        assertEquals(95, card.reputation)
    }

    @Test
    fun `Card stat defaults are zero`() {
        val card = Card(
            id = "x", figureName = "X", era = "Ancient",
            tier = CardTier.COMMON, lore = "", portraitUrl = "",
        )
        assertEquals(0, card.politics)
        assertEquals(0, card.strength)
        assertEquals(0, card.culture)
        assertEquals(0, card.wealth)
        assertEquals(0, card.intelligence)
        assertEquals(0, card.technique)
        assertEquals(0, card.belief)
        assertEquals(0, card.reputation)
    }

    @Test
    fun `Card stores optional fields correctly`() {
        val card = makeCard(
            years = "1912–1954",
            identities = listOf("Mathematician", "Scientist"),
            trait = "Codebreaker: if opponent's Intelligence is higher, treat as equal.",
            achievement = "Cracked — when Intelligence wins 3 rounds, generate 1 winning point.",
        )
        assertEquals("1912–1954", card.years)
        assertEquals(listOf("Mathematician", "Scientist"), card.identities)
        assertEquals("Codebreaker: if opponent's Intelligence is higher, treat as equal.", card.trait)
        assertEquals("Cracked — when Intelligence wins 3 rounds, generate 1 winning point.", card.achievement)
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

    // Era validation

    @Test
    fun `Card stores all 7 era values`() {
        val eras = listOf("Ancient", "Classical", "Medieval", "Renaissance",
                          "Steam", "Electricity", "Information")
        eras.forEach { era ->
            val card = makeCard(era = era)
            assertEquals(era, card.era)
        }
    }
}
