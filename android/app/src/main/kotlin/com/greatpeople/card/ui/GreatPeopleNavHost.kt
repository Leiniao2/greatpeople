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
import androidx.compose.runtime.DisposableEffect
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import com.greatpeople.card.ui.screens.GamePlayerScreen
import com.greatpeople.card.ui.screens.PlayUrls
import com.greatpeople.card.ui.screens.Session
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
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

private fun android.content.Context.authPrefs() =
    getSharedPreferences("auth", android.content.Context.MODE_PRIVATE)

private fun android.content.Context.accessToken(): String? = authPrefs().getString("access_token", null)

/** The saved session for the web player, or null when signed out. */
private fun android.content.Context.session(): Session? =
    accessToken()?.let { Session(it, authPrefs().getString("refresh_token", null)) }

/**
 * Forget the session here and in the embedded web app's storage. An explicit
 * sign-out also forgets the Google account, so the login screen doesn't sign
 * straight back in with it; an expired session keeps it for a silent sign-in.
 */
private fun android.content.Context.signOut(forgetGoogle: Boolean) {
    authPrefs().edit().remove("access_token").remove("refresh_token").apply()
    android.webkit.WebStorage.getInstance().deleteAllData()
    if (forgetGoogle) GoogleSignIn.getClient(this, GoogleSignInOptions.DEFAULT_SIGN_IN).signOut()
}

@Composable
fun GreatPeopleNavHost() {
    val navController = rememberNavController()
    var isGuest by remember { mutableStateOf(false) }
    val appContext = LocalContext.current
    // A saved session skips the login screen; sign-out clears it.
    val startRoute = remember { if (appContext.accessToken() != null) Screen.Home.route else Screen.Login.route }
    // The web player found the session expired: sign in again natively,
    // where the phone's Google account is picked up without a prompt.
    val sessionEnded = {
        appContext.signOut(forgetGoogle = false)
        navController.navigate(Screen.Login.route) { popUpTo(0) { inclusive = true } }
    }

    Scaffold(
        containerColor = Color(0xFF080812),
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = startRoute,
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

            // The Arcade is the web one (per-game A1–D6 ladders), full screen.
            composable(Screen.Arcade.route) {
                val context = LocalContext.current
                GamePlayerScreen(
                    url = PlayUrls.arcade(if (isGuest) null else context.session()),
                    onMessage = { msg -> if (msg.type == "signedOut") sessionEnded() else if (msg.type == "close") navController.popBackStack() },
                    onClose = { navController.popBackStack() },
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
                    url = PlayUrls.story(slug, context.session()),
                    onMessage = { msg ->
                        when (msg.type) {
                            "storyComplete" -> navController.previousBackStackEntry?.savedStateHandle?.set("storyCompleted", msg.slug ?: slug)
                            "close" -> navController.popBackStack()
                            "signedOut" -> sessionEnded()
                        }
                    },
                    onClose = { navController.popBackStack() },
                )
            }

            composable(Screen.PlayChallenge.route) { entry ->
                val context = LocalContext.current
                val id = entry.arguments?.getString("id") ?: return@composable
                GamePlayerScreen(
                    url = PlayUrls.challenge(id, context.session()),
                    onMessage = { msg -> if (msg.type == "signedOut") sessionEnded() else if (msg.type == "close" || msg.type == "challengeComplete") navController.popBackStack() },
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

            // The Fight Arena is the web game, full screen in a WebView, played
            // in landscape; the rest of the app stays portrait.
            composable(Screen.Battle.route) {
                val context = LocalContext.current
                DisposableEffect(Unit) {
                    val activity = context.findActivity()
                    activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    onDispose { activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
                }
                GamePlayerScreen(
                    url = PlayUrls.battle(if (isGuest) null else context.session()),
                    onMessage = { msg -> if (msg.type == "signedOut") sessionEnded() else if (msg.type == "close") navController.popBackStack() },
                    onClose = { navController.popBackStack() },
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
                        appContext.signOut(forgetGoogle = true)
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }
        }
    }
}

/** The Activity behind a Compose context, unwrapping any ContextWrapper. */
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
