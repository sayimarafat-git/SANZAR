package com.sanzar.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MarkEmailUnread
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.data.model.Level
import com.sanzar.app.ui.components.BrandMark
import com.sanzar.app.ui.components.ErrorRetryView
import com.sanzar.app.ui.components.SanzarCard
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(
    onSignInClick: () -> Unit,
    onContinueGuest: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current

    Scaffold(containerColor = palette.bg) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 440.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(SanzarSpace.S5.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                BrandMark(size = 72.dp)
                Spacer(Modifier.height(SanzarSpace.S4.dp))
                Text(
                    text = "Sanzar",
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold)
                )
                Text(
                    text = s("tagline"),
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.muted,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(SanzarSpace.S6.dp))

                Button(
                    onClick = onSignInClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(SanzarRadius.MD.dp)
                ) {
                    Text(s("signIn"), fontWeight = FontWeight.SemiBold)
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = SanzarSpace.S4.dp), color = palette.border)

                TextButton(
                    onClick = onContinueGuest,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(s("continueGuest"), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
fun VerifyEmailScreen(
    email: String,
    onCheckVerified: suspend () -> Boolean,
    onResend: suspend () -> String?,
    onSignOut: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()
    var checking by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }

    Scaffold(containerColor = palette.bg) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(SanzarSpace.S6.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Rounded.MarkEmailUnread,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = palette.primary
            )
            Spacer(Modifier.height(SanzarSpace.S4.dp))
            Text(
                text = s("verifyEmail", mapOf("email" to email)),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center
            )
            if (feedback != null) {
                Spacer(Modifier.height(SanzarSpace.S3.dp))
                Text(
                    text = feedback!!,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center
                )
            }
            Spacer(Modifier.height(SanzarSpace.S6.dp))
            Button(
                onClick = {
                    checking = true
                    feedback = null
                    scope.launch {
                        val ok = onCheckVerified()
                        checking = false
                        if (!ok) feedback = s("notVerified")
                    }
                },
                enabled = !checking,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(SanzarRadius.MD.dp)
            ) {
                if (checking) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text(s("continue"))
            }
            Spacer(Modifier.height(SanzarSpace.S3.dp))
            OutlinedButton(
                onClick = {
                    scope.launch {
                        val err = onResend()
                        feedback = err ?: s("verifyEmail", mapOf("email" to email))
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(SanzarRadius.MD.dp)
            ) {
                Text(s("resend"))
            }
            Spacer(Modifier.height(SanzarSpace.S2.dp))
            TextButton(onClick = onSignOut) {
                Text(s("signOut"))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChooseClassScreen(
    levels: List<Level>,
    initialLevelId: String?,
    initialName: String = "",
    initialLanguage: String = "en",
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onSelectLanguage: (String) -> Unit,
    onConfirm: (displayName: String, language: String, levelId: String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val displayLevels = remember(levels) {
        levels.ifEmpty {
            listOf(
                Level("zh", "Chinese", "চীনা ভাষা", "中文"),
                Level("en", "English", "ইংরেজি", "英语")
            )
        }
    }
    var step by remember { mutableIntStateOf(0) }
    var name by remember(initialName) { mutableStateOf(initialName) }
    var selectedLang by remember(initialLanguage) { mutableStateOf(initialLanguage) }
    var selected by remember(initialLevelId) { mutableStateOf(initialLevelId) }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("welcomeToSanzar")) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                displayLevels.isEmpty() && error != null -> ErrorRetryView(message = s("err.generic"), onRetry = onRetry)
                displayLevels.isEmpty() && loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                displayLevels.isEmpty() -> Text(s("noClasses"), modifier = Modifier.align(Alignment.Center))
                else -> Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(SanzarSpace.S4.dp),
                    verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
                ) {
                    Text(
                        text = s("stepOf", mapOf("a" to (step + 1), "b" to 3)),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.primary,
                        fontWeight = FontWeight.Bold
                    )

                    when (step) {
                        0 -> {
                            Text(
                                text = s("setupProfile"),
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                            )
                            Text(
                                text = s("setupSubtitle"),
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.muted
                            )
                            OutlinedTextField(
                                value = name,
                                onValueChange = { name = it },
                                label = { Text(s("name")) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(SanzarRadius.SM.dp)
                            )
                            Text(s("language"), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                            listOf("en" to "English", "bn" to "বাংলা", "zh" to "中文").forEach { (code, label) ->
                                SanzarCard(
                                    onClick = {
                                        selectedLang = code
                                        onSelectLanguage(code)
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = SanzarSpace.S3.dp, vertical = SanzarSpace.S2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        RadioButton(
                                            selected = selectedLang == code,
                                            onClick = {
                                                selectedLang = code
                                                onSelectLanguage(code)
                                            }
                                        )
                                        Spacer(Modifier.width(SanzarSpace.S2.dp))
                                        Text(label, style = MaterialTheme.typography.titleMedium)
                                    }
                                }
                            }
                        }

                        1 -> {
                            Text(
                                text = s("chooseClass"),
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                            )
                            displayLevels.forEach { level ->
                                SanzarCard(
                                    onClick = { selected = level.id },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        RadioButton(
                                            selected = selected == level.id,
                                            onClick = { selected = level.id }
                                        )
                                        Spacer(Modifier.width(SanzarSpace.S2.dp))
                                        Text(
                                            text = level.name(s.lang),
                                            style = MaterialTheme.typography.titleMedium
                                        )
                                    }
                                }
                            }
                        }

                        else -> {
                            Text(
                                text = s("quickTour"),
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                            )
                            SanzarCard(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                                    Text(s("library"), fontWeight = FontWeight.Bold)
                                    Text(s("onb1.body"), style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                            }
                            SanzarCard(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                                    Text(s("dictionary"), fontWeight = FontWeight.Bold)
                                    Text(s("dictionarySubtitle"), style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                            }
                            SanzarCard(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                                    Text(s("tutor"), fontWeight = FontWeight.Bold)
                                    Text(s("onb4.body"), style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(SanzarSpace.S3.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
                    ) {
                        if (step > 0) {
                            OutlinedButton(
                                onClick = { step -= 1 },
                                modifier = Modifier.weight(1f).height(52.dp),
                                shape = RoundedCornerShape(SanzarRadius.MD.dp)
                            ) {
                                Text("←")
                            }
                        }
                        Button(
                            onClick = {
                                if (step < 2) {
                                    step += 1
                                } else {
                                    selected?.let { onConfirm(name, selectedLang, it) }
                                }
                            },
                            enabled = when (step) {
                                0 -> name.trim().length >= 2 || initialName.isBlank()
                                1 -> selected != null
                                else -> selected != null
                            },
                            modifier = Modifier.weight(2f).height(52.dp),
                            shape = RoundedCornerShape(SanzarRadius.MD.dp)
                        ) {
                            Text(s(if (step < 2) "continue" else "finishSetup"))
                        }
                    }
                }
            }
        }
    }
}
