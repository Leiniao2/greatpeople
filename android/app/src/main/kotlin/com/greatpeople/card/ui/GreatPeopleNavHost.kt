package com.greatpeople.card.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.padding
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.greatpeople.card.ui.screens.BattleScreen
import com.greatpeople.card.ui.screens.CardDetailScreen
import com.greatpeople.card.ui.screens.CollectionScreen
import com.greatpeople.card.ui.screens.EpicScreen
import com.greatpeople.card.ui.screens.LoginScreen
import com.greatpeople.card.ui.screens.ProfileScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Epic : Screen("epic")
    object Collection : Screen("collection")
    object Battle : Screen("battle")
    object Profile : Screen("profile")
    object CardDetail : Screen("card/{cardId}") {
        fun route(cardId: String) = "card/$cardId"
    }
}

private data class NavItem(
    val screen: Screen,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
)

private val bottomNavItems = listOf(
    NavItem(Screen.Epic, "Epic", Icons.Default.Star),
    NavItem(Screen.Collection, "Collection", Icons.Default.List),
    NavItem(Screen.Battle, "Battle", Icons.Default.Warning),
    NavItem(Screen.Profile, "Profile", Icons.Default.Person),
)

private val tabRoutes = setOf(
    Screen.Epic.route,
    Screen.Collection.route,
    Screen.Battle.route,
    Screen.Profile.route,
)

@Composable
fun GreatPeopleNavHost() {
    val navController = rememberNavController()
    var isGuest by remember { mutableStateOf(false) }
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val showBottomBar = currentRoute in tabRoutes

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        NavigationBarItem(
                            selected = currentRoute == item.screen.route,
                            onClick = {
                                navController.navigate(item.screen.route) {
                                    popUpTo(Screen.Epic.route) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label) },
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Login.route,
            modifier = Modifier.padding(padding),
        ) {
            composable(Screen.Login.route) {
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate(Screen.Collection.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onGuestMode = {
                        isGuest = true
                        navController.navigate(Screen.Collection.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                )
            }

            composable(Screen.Epic.route) {
                EpicScreen()
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
                            popUpTo(Screen.Epic.route) { inclusive = true }
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
                            popUpTo(Screen.Epic.route) { inclusive = true }
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
                            popUpTo(Screen.Epic.route) { inclusive = true }
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
