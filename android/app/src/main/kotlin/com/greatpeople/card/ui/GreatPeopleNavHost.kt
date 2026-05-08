package com.greatpeople.card.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.greatpeople.card.ui.screens.BattleScreen
import com.greatpeople.card.ui.screens.CardDetailScreen
import com.greatpeople.card.ui.screens.CollectionScreen
import com.greatpeople.card.ui.screens.LoginScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Collection : Screen("collection")
    object Battle : Screen("battle")
    object CardDetail : Screen("card/{cardId}") {
        fun route(cardId: String) = "card/$cardId"
    }
}

@Composable
fun GreatPeopleNavHost() {
    val navController = rememberNavController()
    var isGuest by remember { mutableStateOf(false) }

    NavHost(navController = navController, startDestination = Screen.Login.route) {
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = { navController.navigate(Screen.Collection.route) },
                onGuestMode = {
                    isGuest = true
                    navController.navigate(Screen.Collection.route)
                },
            )
        }
        composable(Screen.Collection.route) {
            CollectionScreen(
                isGuest = isGuest,
                onBattleClick = { navController.navigate(Screen.Battle.route) },
                onCardClick = { card ->
                    navController.currentBackStackEntry?.savedStateHandle?.set("card", card)
                    navController.navigate(Screen.CardDetail.route(card.id))
                },
                onSignIn = {
                    isGuest = false
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Collection.route) { inclusive = true }
                    }
                },
            )
        }
        composable(Screen.CardDetail.route) {
            val card = navController.previousBackStackEntry
                ?.savedStateHandle?.get<com.greatpeople.card.data.model.Card>("card")
            if (card != null) {
                CardDetailScreen(card = card, onBack = { navController.popBackStack() })
            }
        }
        composable(Screen.Battle.route) {
            BattleScreen(
                isGuest = isGuest,
                onBack = { navController.popBackStack() },
                onSignIn = {
                    isGuest = false
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Collection.route) { inclusive = true }
                    }
                },
            )
        }
    }
}
