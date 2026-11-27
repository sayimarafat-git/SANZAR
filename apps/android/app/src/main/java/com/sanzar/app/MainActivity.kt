package com.sanzar.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.core.SanzarStrings
import com.sanzar.app.ui.SanzarViewModel
import com.sanzar.app.ui.navigation.AppShell
import com.sanzar.app.ui.theme.SanzarTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val viewModel: SanzarViewModel = viewModel()
            val state by viewModel.uiState.collectAsState()

            CompositionLocalProvider(LocalStrings provides SanzarStrings(state.language)) {
                SanzarTheme(themeMode = state.themeMode) {
                    AppShell(
                        viewModel = viewModel,
                        onSignInClick = { viewModel.signInWithLogto(this) }
                    )
                }
            }
        }
    }
}
