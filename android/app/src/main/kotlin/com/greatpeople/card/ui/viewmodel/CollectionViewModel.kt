package com.greatpeople.card.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.greatpeople.card.data.remote.ApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CollectionViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _ownedIds = MutableStateFlow<Set<String>>(emptySet())
    val ownedIds = _ownedIds.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading = _loading.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _loading.value = true
            try {
                val fetched = apiService.getCards().cards
                _ownedIds.value = fetched.map { it.id }.toSet()
            }
            catch (_: Exception) {}
            finally { _loading.value = false }
        }
    }
}
