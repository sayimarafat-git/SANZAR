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
    onSignIn: suspend (String, String) -> String?,
    onRegister: suspend (String, String, String) -> String?,
    onForgotPassword: suspend (String) -> String?,
    onGoogleSignInClick: () -> Unit,
    onContinueGuest: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()

    var isRegister by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(true) }

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
                Text(
                    text = s(if (isRegister) "signUp" else "signIn"),
                    style = MaterialTheme.typography.titleLarge
                )
                Spacer(Modifier.height(SanzarSpace.S4.dp))

                if (isRegister) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text(s("name")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(SanzarRadius.SM.dp)
                    )
                    Spacer(Modifier.height(SanzarSpace.S3.dp))
                }

                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text(s("email")) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(SanzarRadius.SM.dp)
                )
                Spacer(Modifier.height(SanzarSpace.S3.dp))

                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text(s("password")) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(SanzarRadius.SM.dp)
                )

                if (message != null) {
                    Spacer(Modifier.height(SanzarSpace.S3.dp))
                    Text(
                        text = message!!,
                        color = if (isError) MaterialTheme.colorScheme.error else palette.primary,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(Modifier.height(SanzarSpace.S4.dp))

                Button(
                    onClick = {
                        if (isRegister && name.trim().length < 2) {
                            isError = true
                            message = s("err.name")
                            return@Button
                        }
                        if (!email.contains("@")) {
                            isError = true
                            message = s("err.email")
                            return@Button
                        }
                        if (password.length < 6) {
                            isError = true
                            message = s("err.password")
                            return@Button
                        }
                        busy = true
                        message = null
                        scope.launch {
                            val err = if (isRegister) {
                                onRegister(name, email, password)
                            } else {
                                onSignIn(email, password)
                            }
                            busy = false
                            if (err != null) {
                                isError = true
                                message = if (err.startsWith("err.")) s(err) else err
                            }
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(SanzarRadius.MD.dp)
                ) {
                    if (busy) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text(s(if (isRegister) "signUp" else "signIn"))
                    }
                }

                Spacer(Modifier.height(SanzarSpace.S2.dp))

                OutlinedButton(
                    onClick = onGoogleSignInClick,
                    enabled = !busy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(SanzarRadius.MD.dp)
                ) {
                    Text(s("google"))
                }

                TextButton(
                    onClick = {
                        isRegister = !isRegister
                        message = null
                    },
                    enabled = !busy
                ) {
                    Text(
                        if (isRegister) "${s("haveAccount")} ${s("signIn")}"
                        else "${s("noAccount")} ${s("signUp")}"
                    )
                }

                if (!isRegister) {
                    TextButton(
                        onClick = {
                            if (!email.contains("@")) {
                                isError = true
                                message = s("err.email")
                                return@TextButton
                            }
                            busy = true
                            scope.launch {
                                val err = onForgotPassword(email)
                                busy = false
                                if (err == null) {
                                    isError = false
                                    message = s("resetSent", mapOf("email" to email.trim()))
                                } else {
                                    isError = true
                                    message = if (err.startsWith("err.")) s(err) else err
                                }
                            }
                        },
                        enabled = !busy
                    ) {
                        Text(s("forgot"))
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = SanzarSpace.S3.dp), color = palette.border)

                TextButton(
                    onClick = onContinueGuest,
                    enabled = !busy,
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
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onConfirm: (String) -> Unit
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
    var selected by remember(initialLevelId) { mutableStateOf(initialLevelId) }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("chooseClass")) },
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
                        .padding(SanzarSpace.S4.dp)
                ) {
                    displayLevels.forEach { level ->
                        SanzarCard(
                            onClick = { selected = level.id },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = SanzarSpace.S2.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { selected = level.id }
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
                    Spacer(Modifier.height(SanzarSpace.S4.dp))
                    Button(
                        onClick = { selected?.let(onConfirm) },
                        enabled = selected != null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(SanzarRadius.MD.dp)
                    ) {
                        Text(s("continue"))
                    }
                }
            }
        }
    }
}
