package com.greatpeople.card.ui.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.greatpeople.card.data.remote.ApiService
import com.greatpeople.card.data.remote.GoogleLoginRequest
import com.greatpeople.card.data.remote.LoginRequest
import com.greatpeople.card.data.remote.RegisterRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class AuthUiState {
    object Idle : AuthUiState()
    object Loading : AuthUiState()
    object Success : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val state = _state.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _state.value = AuthUiState.Loading
            try {
                val resp = apiService.login(LoginRequest(email, password))
                prefs.edit().putString("access_token", resp.accessToken).apply()
                _state.value = AuthUiState.Success
            } catch (e: Exception) {
                _state.value = AuthUiState.Error("Invalid email or password.")
            }
        }
    }

    fun register(email: String, password: String, displayName: String) {
        viewModelScope.launch {
            _state.value = AuthUiState.Loading
            try {
                val resp = apiService.register(RegisterRequest(email, password, displayName))
                prefs.edit().putString("access_token", resp.accessToken).apply()
                _state.value = AuthUiState.Success
            } catch (e: Exception) {
                _state.value = AuthUiState.Error("Registration failed. Please try again.")
            }
        }
    }

    fun googleLogin(idToken: String) {
        viewModelScope.launch {
            _state.value = AuthUiState.Loading
            try {
                val resp = apiService.googleLogin(GoogleLoginRequest(idToken))
                prefs.edit().putString("access_token", resp.accessToken).apply()
                _state.value = AuthUiState.Success
            } catch (e: Exception) {
                _state.value = AuthUiState.Error("Google sign-in failed. Please try again.")
            }
        }
    }

    fun resetState() { _state.value = AuthUiState.Idle }
}
