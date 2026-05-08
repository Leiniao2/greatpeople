package com.greatpeople.card

import com.greatpeople.card.ui.viewmodel.AuthUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthUiStateTest {

    // Idle tests

    @Test
    fun `AuthUiState Idle is instance of Idle`() {
        val state = AuthUiState.Idle
        assertTrue(state is AuthUiState.Idle)
    }

    @Test
    fun `AuthUiState Idle is not Loading`() {
        val state: AuthUiState = AuthUiState.Idle
        assertFalse(state is AuthUiState.Loading)
    }

    @Test
    fun `AuthUiState Idle is not Success`() {
        val state: AuthUiState = AuthUiState.Idle
        assertFalse(state is AuthUiState.Success)
    }

    @Test
    fun `AuthUiState Idle is not Error`() {
        val state: AuthUiState = AuthUiState.Idle
        assertFalse(state is AuthUiState.Error)
    }

    // Loading tests

    @Test
    fun `AuthUiState Loading is instance of Loading`() {
        val state = AuthUiState.Loading
        assertTrue(state is AuthUiState.Loading)
    }

    @Test
    fun `AuthUiState Loading is not Idle`() {
        val state: AuthUiState = AuthUiState.Loading
        assertFalse(state is AuthUiState.Idle)
    }

    // Success tests

    @Test
    fun `AuthUiState Success is instance of Success`() {
        val state = AuthUiState.Success
        assertTrue(state is AuthUiState.Success)
    }

    @Test
    fun `AuthUiState Success is distinct from Idle`() {
        val success: AuthUiState = AuthUiState.Success
        val idle: AuthUiState = AuthUiState.Idle
        assertFalse(success is AuthUiState.Idle)
        assertFalse(idle is AuthUiState.Success)
    }

    @Test
    fun `AuthUiState Success is not Error`() {
        val state: AuthUiState = AuthUiState.Success
        assertFalse(state is AuthUiState.Error)
    }

    // Error tests

    @Test
    fun `AuthUiState Error carries its message`() {
        val state = AuthUiState.Error("Something went wrong")
        assertEquals("Something went wrong", state.message)
    }

    @Test
    fun `AuthUiState Error is instance of Error`() {
        val state: AuthUiState = AuthUiState.Error("Oops")
        assertTrue(state is AuthUiState.Error)
    }

    @Test
    fun `AuthUiState Error is not Idle`() {
        val state: AuthUiState = AuthUiState.Error("Oops")
        assertFalse(state is AuthUiState.Idle)
    }

    @Test
    fun `AuthUiState Error is not Loading`() {
        val state: AuthUiState = AuthUiState.Error("Oops")
        assertFalse(state is AuthUiState.Loading)
    }

    @Test
    fun `AuthUiState Error is not Success`() {
        val state: AuthUiState = AuthUiState.Error("Oops")
        assertFalse(state is AuthUiState.Success)
    }

    @Test
    fun `AuthUiState Error smart cast exposes message`() {
        val state: AuthUiState = AuthUiState.Error("Network timeout")
        if (state is AuthUiState.Error) {
            assertEquals("Network timeout", state.message)
        } else {
            throw AssertionError("Expected Error state")
        }
    }

    // when-expression exhaustiveness

    @Test
    fun `when expression covers all AuthUiState subtypes`() {
        val states: List<AuthUiState> = listOf(
            AuthUiState.Idle,
            AuthUiState.Loading,
            AuthUiState.Success,
            AuthUiState.Error("err"),
        )
        val labels = states.map { state ->
            when (state) {
                is AuthUiState.Idle -> "idle"
                is AuthUiState.Loading -> "loading"
                is AuthUiState.Success -> "success"
                is AuthUiState.Error -> "error"
            }
        }
        assertEquals(listOf("idle", "loading", "success", "error"), labels)
    }
}
