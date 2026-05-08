package com.greatpeople.card.ui

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.greatpeople.card.ui.screens.BattleScreen
import com.greatpeople.card.ui.screens.CollectionScreen
import com.greatpeople.card.ui.screens.LoginScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Collection : Screen("collection")
    object Battle : Screen("battle")
}

@Composable
fun GreatPeopleNavHost() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Screen.Login.route) {
        composable(Screen.Login.route) {
            LoginScreen(onLoginSuccess = { navController.navigate(Screen.Collection.route) })
        }
        composable(Screen.Collection.route) {
            CollectionScreen(onBattleClick = { navController.navigate(Screen.Battle.route) })
        }
        composable(Screen.Battle.route) {
            BattleScreen(onBack = { navController.popBackStack() })
        }
    }
}
