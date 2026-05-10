package com.greatpeople.card.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.greatpeople.card.ui.screens.BattleScreen
import com.greatpeople.card.ui.screens.CardDetailScreen
import com.greatpeople.card.ui.screens.CollectionScreen
import com.greatpeople.card.ui.screens.EpicScreen
import com.greatpeople.card.ui.screens.HomeScreen
import com.greatpeople.card.ui.screens.LoginScreen
import com.greatpeople.card.ui.screens.ProfileScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Home : Screen("home")
    object Epic : Screen("epic")
    object Collection : Screen("collection")
    object Battle : Screen("battle")
    object Profile : Screen("profile")
    object CardDetail : Screen("card/{cardId}") {
        fun route(cardId: String) = "card/$cardId"
    }
}

@Composable
fun GreatPeopleNavHost() {
    val navController = rememberNavController()
    var isGuest by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = Color(0xFF080812),
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Login.route,
            modifier = Modifier.padding(padding),
        ) {
            composable(Screen.Login.route) {
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onGuestMode = {
                        isGuest = true
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                )
            }

            composable(Screen.Home.route) {
                HomeScreen(
                    isGuest = isGuest,
                    onSignIn = {
                        isGuest = false
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onEpic = { navController.navigate(Screen.Epic.route) },
                    onCollection = { navController.navigate(Screen.Collection.route) },
                    onBattle = { navController.navigate(Screen.Battle.route) },
                    onProfile = { navController.navigate(Screen.Profile.route) },
                )
            }

            composable(Screen.Epic.route) {
                EpicScreen(
                    onBack = { navController.popBackStack() },
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
                            popUpTo(0) { inclusive = true }
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
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }

            composable(Screen.Profile.route) {
                ProfileScreen(
                    isGuest = isGuest,
                    onSignIn = {
                        isGuest = false
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onSignOut = {
                        isGuest = false
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }
        }
    }
}
