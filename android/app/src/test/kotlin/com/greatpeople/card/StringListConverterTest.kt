package com.greatpeople.card

import com.greatpeople.card.data.local.StringListConverter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class StringListConverterTest {

    private lateinit var converter: StringListConverter

    @Before
    fun setUp() {
        converter = StringListConverter()
    }

    // fromList tests

    @Test
    fun `fromList with empty list returns empty string`() {
        val result = converter.fromList(emptyList())
        assertEquals("", result)
    }

    @Test
    fun `fromList with single item returns that item string`() {
        val result = converter.fromList(listOf("Einstein"))
        assertEquals("Einstein", result)
    }

    @Test
    fun `fromList with multiple items returns comma-joined string`() {
        val result = converter.fromList(listOf("Einstein", "Newton", "Curie"))
        assertEquals("Einstein,Newton,Curie", result)
    }

    // toList tests

    @Test
    fun `toList with empty string returns empty list`() {
        val result = converter.toList("")
        assertTrue(result.isEmpty())
    }

    @Test
    fun `toList with single item string returns list of one`() {
        val result = converter.toList("Einstein")
        assertEquals(listOf("Einstein"), result)
    }

    @Test
    fun `toList with comma-joined string returns correct list`() {
        val result = converter.toList("Einstein,Newton,Curie")
        assertEquals(listOf("Einstein", "Newton", "Curie"), result)
    }

    // Round-trip tests

    @Test
    fun `round trip toList(fromList(list)) returns original list for single item`() {
        val original = listOf("Einstein")
        val result = converter.toList(converter.fromList(original))
        assertEquals(original, result)
    }

    @Test
    fun `round trip toList(fromList(list)) returns original list for multiple items`() {
        val original = listOf("Einstein", "Newton", "Curie")
        val result = converter.toList(converter.fromList(original))
        assertEquals(original, result)
    }
}
