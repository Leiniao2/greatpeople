package com.greatpeople.card.ui.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.greatpeople.card.data.remote.ApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext context: Context,
) : ViewModel() {

    private val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)

    val email: String? get() = prefs.getString("user_email", null)

    private val _cardsCount = MutableStateFlow<Int?>(null)
    val cardsCount = _cardsCount.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading = _loading.asStateFlow()

    init { loadCards() }

    fun loadCards() {
        viewModelScope.launch {
            _loading.value = true
            try { _cardsCount.value = apiService.getCards().cards.size }
            catch (_: Exception) {}
            finally { _loading.value = false }
        }
    }
}
