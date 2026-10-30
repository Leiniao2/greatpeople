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
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import com.greatpeople.card.ui.screens.GamePlayerScreen
import com.greatpeople.card.ui.screens.PlayUrls
import com.greatpeople.card.ui.screens.ArcadeScreen
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
    object Arcade : Screen("arcade")
    object CardDetail : Screen("card/{cardId}") {
        fun route(cardId: String) = "card/$cardId"
    }
    object PlayStory : Screen("play/story/{slug}") {
        fun route(slug: String) = "play/story/$slug"
    }
    object PlayChallenge : Screen("play/challenge/{id}") {
        fun route(id: String) = "play/challenge/$id"
    }
}

private fun android.content.Context.accessToken(): String? =
    getSharedPreferences("auth", android.content.Context.MODE_PRIVATE).getString("access_token", null)

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
                    onArcade = { navController.navigate(Screen.Arcade.route) },
                    onCollection = { navController.navigate(Screen.Collection.route) },
                    onBattle = { navController.navigate(Screen.Battle.route) },
                    onProfile = { navController.navigate(Screen.Profile.route) },
                )
            }

            composable(Screen.Epic.route) { entry ->
                val completedSlug by entry.savedStateHandle.getStateFlow<String?>("storyCompleted", null).collectAsState()
                EpicScreen(
                    onPlayStory = { slug -> navController.navigate(Screen.PlayStory.route(slug)) },
                    completedSlug = completedSlug,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(Screen.Arcade.route) {
                ArcadeScreen(
                    onPlayChallenge = { id -> navController.navigate(Screen.PlayChallenge.route(id)) },
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

            composable(Screen.PlayStory.route) { entry ->
                val context = LocalContext.current
                val slug = entry.arguments?.getString("slug") ?: return@composable
                GamePlayerScreen(
                    url = PlayUrls.story(slug, context.accessToken()),
                    onMessage = { msg ->
                        when (msg.type) {
                            "storyComplete" -> navController.previousBackStackEntry?.savedStateHandle?.set("storyCompleted", msg.slug ?: slug)
                            "close" -> navController.popBackStack()
                        }
                    },
                    onClose = { navController.popBackStack() },
                )
            }

            composable(Screen.PlayChallenge.route) { entry ->
                val context = LocalContext.current
                val id = entry.arguments?.getString("id") ?: return@composable
                GamePlayerScreen(
                    url = PlayUrls.challenge(id, context.accessToken()),
                    onMessage = { msg -> if (msg.type == "close" || msg.type == "challengeComplete") navController.popBackStack() },
                    onClose = { navController.popBackStack() },
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
