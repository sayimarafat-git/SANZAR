package com.sanzar.app

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.core.SanzarStrings
import com.sanzar.app.ui.SanzarViewModel
import com.sanzar.app.ui.navigation.AppShell
import com.sanzar.app.ui.theme.SanzarTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val viewModel: SanzarViewModel = viewModel()
            val state by viewModel.uiState.collectAsState()
            val scope = rememberCoroutineScope()

            val googleLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.StartActivityForResult()
            ) { result ->
                if (result.resultCode == Activity.RESULT_OK) {
                    val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                    runCatching {
                        val account = task.getResult(ApiException::class.java)
                        account.idToken?.let { token ->
                            scope.launch { viewModel.signInWithGoogleIdToken(token) }
                        }
                    }
                }
            }

            fun launchGoogleSignIn() {
                val webClientIdRes = resources.getIdentifier(
                    "default_web_client_id",
                    "string",
                    packageName
                )
                val gsoBuilder = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                if (webClientIdRes != 0) {
                    gsoBuilder.requestIdToken(getString(webClientIdRes))
                }
                val client = GoogleSignIn.getClient(this, gsoBuilder.build())
                googleLauncher.launch(client.signInIntent)
            }

            CompositionLocalProvider(LocalStrings provides SanzarStrings(state.language)) {
                SanzarTheme(themeMode = state.themeMode) {
                    AppShell(
                        viewModel = viewModel,
                        onGoogleSignInClick = ::launchGoogleSignIn
                    )
                }
            }
        }
    }
}
