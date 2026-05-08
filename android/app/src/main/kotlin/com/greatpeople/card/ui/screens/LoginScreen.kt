package com.greatpeople.card.ui.screens

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.greatpeople.card.R
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.greatpeople.card.ui.viewmodel.AuthUiState
import com.greatpeople.card.ui.viewmodel.AuthViewModel

private const val GOOGLE_CLIENT_ID =
    "109767033732-nnlj70jqivv608tkihkjhdiomu53bn6j.apps.googleusercontent.com"

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onGuestMode: () -> Unit = {},
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var isRegistering by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }

    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    // Google Sign-In client
    val googleSignInClient = remember {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(GOOGLE_CLIENT_ID)
            .requestEmail()
            .build()
        GoogleSignIn.getClient(context, gso)
    }

    // Launcher for Google sign-in intent
    val googleLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            try {
                val account = GoogleSignIn
                    .getSignedInAccountFromIntent(result.data)
                    .getResult(ApiException::class.java)
                account.idToken?.let { viewModel.googleLogin(it) }
            } catch (_: ApiException) {
                // sign-in cancelled or failed — state stays Idle
            }
        }
    }

    LaunchedEffect(state) {
        if (state is AuthUiState.Success) onLoginSuccess()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("♛", style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(4.dp))
        Text("Great People", style = MaterialTheme.typography.headlineLarge)
        Text("Collect · Battle · Conquer",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)

        Spacer(Modifier.height(32.dp))

        // Google Sign-In button
        OutlinedButton(
            onClick = { googleLauncher.launch(googleSignInClient.signInIntent) },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            enabled = state !is AuthUiState.Loading,
            colors = ButtonDefaults.outlinedButtonColors(
                containerColor = Color.White,
                contentColor = Color(0xFF1A1A2E),
            ),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFDADADA)),
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_google),
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = Color.Unspecified,
            )
            Spacer(Modifier.width(12.dp))
            Text("Continue with Google", style = MaterialTheme.typography.labelLarge)
        }

        // Divider
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.outline)
            Text("  or  ", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.outline)
        }

        // Tab switcher
        Row(modifier = Modifier.fillMaxWidth()) {
            listOf("Sign In" to false, "Register" to true).forEach { (label, register) ->
                val active = isRegistering == register
                Button(
                    onClick = { isRegistering = register; viewModel.resetState() },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (active) MaterialTheme.colorScheme.primary
                                         else MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = if (active) MaterialTheme.colorScheme.onPrimary
                                       else MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                    shape = MaterialTheme.shapes.small,
                ) { Text(label, style = MaterialTheme.typography.labelLarge) }
                if (label == "Sign In") Spacer(Modifier.width(8.dp))
            }
        }

        Spacer(Modifier.height(20.dp))

        // Fields
        if (isRegistering) {
            OutlinedTextField(
                value = displayName, onValueChange = { displayName = it },
                label = { Text("Display Name") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            )
            Spacer(Modifier.height(12.dp))
        }
        OutlinedTextField(
            value = email, onValueChange = { email = it },
            label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password, onValueChange = { password = it },
            label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        if (isRegistering) {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = confirmPassword, onValueChange = { confirmPassword = it },
                label = { Text("Confirm Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
            )
        }

        if (state is AuthUiState.Error) {
            Spacer(Modifier.height(12.dp))
            Text((state as AuthUiState.Error).message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall)
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                if (isRegistering) viewModel.register(email, password, displayName)
                else viewModel.login(email, password)
            },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            enabled = state !is AuthUiState.Loading,
        ) {
            if (state is AuthUiState.Loading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary)
                Spacer(Modifier.width(10.dp))
            }
            Text(if (isRegistering) "Create Account" else "Sign In",
                style = MaterialTheme.typography.labelLarge)
        }

        Spacer(Modifier.height(20.dp))

        TextButton(onClick = onGuestMode) {
            Text("Explore as Guest →",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
