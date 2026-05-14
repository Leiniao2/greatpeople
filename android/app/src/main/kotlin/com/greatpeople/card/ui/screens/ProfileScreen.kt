package com.greatpeople.card.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.greatpeople.card.ui.viewmodel.ProfileViewModel

private val Amber    = Color(0xFFF59E0B)
private val BgDark   = Color(0xFF080812)
private val Slate400 = Color(0xFF94A3B8)
private val Outline  = Color(0xFF1E2235)

private fun displayName(email: String): String =
    email.substringBefore('@')
        .replace(Regex("[._]"), " ")
        .split(" ")
        .joinToString(" ") { it.replaceFirstChar(Char::uppercaseChar) }

private fun initials(name: String): String =
    name.split(" ").mapNotNull { it.firstOrNull()?.uppercaseChar() }.take(2).joinToString("")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    isGuest: Boolean = false,
    onSignIn: () -> Unit = {},
    onSignOut: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val cardsCount by viewModel.cardsCount.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val email = viewModel.email

    Scaffold(
        containerColor = BgDark,
        topBar = {
            TopAppBar(
                title = { Text("Profile", color = Color.White, fontWeight = FontWeight.Bold, letterSpacing = 1.sp) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgDark),
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            if (isGuest) {
                GuestContent(onSignIn = onSignIn)
            } else {
                LoggedInContent(
                    email = email,
                    cardsCount = cardsCount,
                    loading = loading,
                    onSignOut = onSignOut,
                )
            }
        }
    }
}

@Composable
private fun GuestContent(onSignIn: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.padding(32.dp),
    ) {
        Surface(
            modifier = Modifier.size(80.dp),
            shape = RoundedCornerShape(20.dp),
            color = Amber.copy(alpha = 0.12f),
            border = androidx.compose.foundation.BorderStroke(1.dp, Amber.copy(alpha = 0.25f)),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("◉", style = MaterialTheme.typography.displaySmall)
            }
        }
        Text("Browsing as Guest",
            style = MaterialTheme.typography.headlineSmall,
            color = Color.White, fontWeight = FontWeight.Bold)
        Text(
            "Sign in to track your progress, earn real cards, and compete on the leaderboard.",
            style = MaterialTheme.typography.bodyMedium,
            color = Slate400,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Button(
            onClick = onSignIn,
            colors = ButtonDefaults.buttonColors(containerColor = Amber),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Sign In / Register", color = BgDark, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun LoggedInContent(
    email: String?,
    cardsCount: Int?,
    loading: Boolean,
    onSignOut: () -> Unit,
) {
    val name = email?.let(::displayName) ?: "Player"
    val avatarLetters = initials(name)

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
        modifier = Modifier
            .widthIn(max = 400.dp)
            .fillMaxWidth()
            .padding(32.dp),
    ) {
        // Avatar
        Box(
            modifier = Modifier
                .size(96.dp)
                .background(Amber.copy(alpha = 0.12f), RoundedCornerShape(24.dp))
                .border(1.dp, Amber.copy(alpha = 0.25f), RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(avatarLetters, color = Amber, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
        }

        // Name + email
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(name, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
            if (email != null) {
                Text(email, color = Slate400, style = MaterialTheme.typography.bodySmall)
            }
        }

        // Cards count
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(14.dp))
                .border(1.dp, Outline, RoundedCornerShape(14.dp))
                .padding(vertical = 20.dp),
        ) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = Amber)
            } else {
                Text(
                    cardsCount?.toString() ?: "—",
                    color = Amber, fontSize = 36.sp, fontWeight = FontWeight.Bold,
                )
            }
            Text(
                "Cards Collected",
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.sp),
                color = Slate400,
            )
        }

        // Sign out
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
        ) {
            Text("Sign Out")
        }
    }
}
