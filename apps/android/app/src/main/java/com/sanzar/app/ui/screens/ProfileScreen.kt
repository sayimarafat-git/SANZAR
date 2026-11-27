package com.sanzar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.data.model.Level
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.components.SanzarCard
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    state: SanzarUiState,
    onEditProfile: () -> Unit,
    onOpenProgress: () -> Unit,
    onOpenExams: () -> Unit,
    onOpenLeaderboard: () -> Unit,
    onChangeVisibility: suspend (String) -> Boolean,
    onChangeLanguage: (String) -> Unit,
    onChangeTheme: (String) -> Unit,
    onRemoveDownload: (String) -> Unit,
    onTriggerSync: () -> Unit,
    onSignInClick: () -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: suspend () -> String?
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()

    val p = state.profile
    val level = state.catalog?.levels?.firstOrNull { it.id == (p?.levelId ?: state.selectedLevelId) }
    val displayName = p?.displayName?.ifBlank { null }
        ?: state.authUser?.displayName
        ?: if (state.guestMode) s("guestMode") else "Sanzar Student"
    val email = p?.email?.ifBlank { null } ?: state.authUser?.email.orEmpty()

    var visExpanded by remember { mutableStateOf(false) }
    var langExpanded by remember { mutableStateOf(false) }
    var themeExpanded by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var deleteConfirmText by remember { mutableStateOf("") }
    var deleteError by remember { mutableStateOf<String?>(null) }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("profile")) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(SanzarSpace.S4.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
        ) {
            item {
                SanzarCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(SanzarSpace.S4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(60.dp)
                                .clip(CircleShape)
                                .background(palette.primarySoft),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = displayName.firstOrNull()?.uppercase() ?: "?",
                                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                                color = palette.primary
                            )
                        }
                        Spacer(Modifier.width(SanzarSpace.S4.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(displayName, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                            if (email.isNotEmpty()) {
                                Text(email, style = MaterialTheme.typography.bodySmall, color = palette.text2)
                            }
                            if (level != null) {
                                Text(level.name(s.lang), style = MaterialTheme.typography.bodySmall, color = palette.muted)
                            }
                        }
                    }
                }
            }

            item {
                SanzarCard(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        ProfileNavRow(icon = Icons.Rounded.Edit, title = s("editProfile"), onClick = onEditProfile)
                        HorizontalDivider(color = palette.border)
                        ProfileNavRow(icon = Icons.Rounded.Insights, title = s("progress"), onClick = onOpenProgress)
                        HorizontalDivider(color = palette.border)
                        ProfileNavRow(icon = Icons.Rounded.Assignment, title = s("exams"), onClick = onOpenExams)
                        HorizontalDivider(color = palette.border)
                        ProfileNavRow(icon = Icons.Rounded.Leaderboard, title = s("leaderboard"), onClick = onOpenLeaderboard)
                        HorizontalDivider(color = palette.border)

                        // Visibility
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { visExpanded = true }
                                .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Rounded.Visibility, contentDescription = null)
                            Spacer(Modifier.width(SanzarSpace.S3.dp))
                            Text(s("visibility"), modifier = Modifier.weight(1f))
                            Box {
                                val visKey = when (p?.visibility) {
                                    "public" -> "visPublic"
                                    "followers" -> "visFollowers"
                                    else -> "visPrivate"
                                }
                                Text(s(visKey), color = palette.primary, fontWeight = FontWeight.SemiBold)
                                DropdownMenu(expanded = visExpanded, onDismissRequest = { visExpanded = false }) {
                                    listOf("public" to "visPublic", "followers" to "visFollowers", "private" to "visPrivate").forEach { (v, k) ->
                                        DropdownMenuItem(
                                            text = { Text(s(k)) },
                                            onClick = {
                                                visExpanded = false
                                                scope.launch { onChangeVisibility(v) }
                                            }
                                        )
                                    }
                                }
                            }
                        }
                        HorizontalDivider(color = palette.border)

                        // Language
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { langExpanded = true }
                                .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Rounded.Translate, contentDescription = null)
                            Spacer(Modifier.width(SanzarSpace.S3.dp))
                            Text(s("language"), modifier = Modifier.weight(1f))
                            Box {
                                val label = when (state.language) {
                                    "bn" -> "বাংলা"
                                    "zh" -> "中文"
                                    else -> "English"
                                }
                                Text(label, color = palette.primary, fontWeight = FontWeight.SemiBold)
                                DropdownMenu(expanded = langExpanded, onDismissRequest = { langExpanded = false }) {
                                    listOf("bn" to "বাংলা", "en" to "English", "zh" to "中文").forEach { (code, text) ->
                                        DropdownMenuItem(
                                            text = { Text(text) },
                                            onClick = {
                                                langExpanded = false
                                                onChangeLanguage(code)
                                            }
                                        )
                                    }
                                }
                            }
                        }
                        HorizontalDivider(color = palette.border)

                        // Theme
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { themeExpanded = true }
                                .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Rounded.DarkMode, contentDescription = null)
                            Spacer(Modifier.width(SanzarSpace.S3.dp))
                            Text(s("theme"), modifier = Modifier.weight(1f))
                            Box {
                                val tKey = if (state.themeMode == "dark") "themeDark" else "themeLight"
                                Text(s(tKey), color = palette.primary, fontWeight = FontWeight.SemiBold)
                                DropdownMenu(expanded = themeExpanded, onDismissRequest = { themeExpanded = false }) {
                                    listOf("light" to "themeLight", "dark" to "themeDark").forEach { (mode, key) ->
                                        DropdownMenuItem(
                                            text = { Text(s(key)) },
                                            onClick = {
                                                themeExpanded = false
                                                onChangeTheme(mode)
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Offline Downloads Manager
            item {
                SanzarCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.FolderZip, contentDescription = null, tint = palette.primary)
                            Spacer(Modifier.width(8.dp))
                            Text(s("offlineDownloads"), fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(SanzarSpace.S2.dp))
                        if (state.installedResources.isEmpty()) {
                            Text(s("noDownloads"), style = MaterialTheme.typography.bodySmall, color = palette.muted)
                        } else {
                            state.installedResources.values.forEach { item ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("${item.resourceId} (v${item.version})", fontWeight = FontWeight.Medium)
                                        Text(
                                            text = "${(item.sizeBytes / 1024).coerceAtLeast(1)} KB · SHA-256 ${item.sha256.take(10)}…",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = palette.muted
                                        )
                                    }
                                    IconButton(onClick = { onRemoveDownload(item.resourceId) }) {
                                        Icon(Icons.Rounded.Delete, contentDescription = s("removeDownload"), tint = SanzarColors.Danger)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Sync Status & Manual Sync
            item {
                SanzarCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(SanzarSpace.S4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Rounded.Sync, contentDescription = null, tint = palette.primary)
                        Spacer(Modifier.width(SanzarSpace.S3.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(s("syncStatus"), fontWeight = FontWeight.Bold)
                            Text(
                                text = if (state.pendingSyncCount > 0) {
                                    s("pendingOps", mapOf("n" to state.pendingSyncCount))
                                } else {
                                    s("allSynced")
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.muted
                            )
                        }
                        FilledTonalButton(
                            onClick = onTriggerSync,
                            enabled = !state.isSyncing
                        ) {
                            if (state.isSyncing) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Text(s("syncNow"))
                            }
                        }
                    }
                }
            }

            // Account Actions
            item {
                SanzarCard(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        if (state.authUser == null) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(onClick = onSignInClick)
                                    .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Rounded.Person, contentDescription = null, tint = palette.primary)
                                Spacer(Modifier.width(SanzarSpace.S3.dp))
                                Text(s("signIn"), fontWeight = FontWeight.SemiBold, color = palette.primary)
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(onClick = onSignOut)
                                    .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Rounded.Logout, contentDescription = null)
                                Spacer(Modifier.width(SanzarSpace.S3.dp))
                                Text(s("signOut"))
                            }
                            HorizontalDivider(color = palette.border)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        deleteConfirmText = ""
                                        deleteError = null
                                        showDeleteDialog = true
                                    }
                                    .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Rounded.DeleteForever, contentDescription = null, tint = SanzarColors.Danger)
                                Spacer(Modifier.width(SanzarSpace.S3.dp))
                                Text(s("deleteAccount"), color = SanzarColors.Danger)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(s("deleteAccount")) },
            text = {
                Column {
                    Text(s("deleteConfirm"))
                    Spacer(Modifier.height(SanzarSpace.S3.dp))
                    OutlinedTextField(
                        value = deleteConfirmText,
                        onValueChange = { deleteConfirmText = it },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (deleteError != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(deleteError!!, color = SanzarColors.Danger, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            val err = onDeleteAccount()
                            if (err == null) {
                                showDeleteDialog = false
                            } else {
                                deleteError = if (err.startsWith("err.") || err == "recentLogin") s(err) else err
                            }
                        }
                    },
                    enabled = deleteConfirmText.trim() == "DELETE"
                ) {
                    Text(s("delete"), color = SanzarColors.Danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text(s("cancel")) }
            }
        )
    }
}

@Composable
private fun ProfileNavRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    onClick: () -> Unit
) {
    val palette = LocalSanzarPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null)
        Spacer(Modifier.width(SanzarSpace.S3.dp))
        Text(title, modifier = Modifier.weight(1f))
        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.muted)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileScreen(
    state: SanzarUiState,
    levels: List<Level>,
    onBack: () -> Unit,
    onSave: suspend (String, String?, String, String) -> Boolean
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf(state.profile?.displayName ?: state.authUser?.displayName ?: "") }
    var institution by remember { mutableStateOf(state.profile?.institution ?: "") }
    var group by remember { mutableStateOf(state.profile?.group ?: "") }
    var selectedLevel by remember { mutableStateOf(state.profile?.levelId ?: state.selectedLevelId) }
    var levelMenuOpen by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("editProfile")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(SanzarSpace.S4.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(s("name")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            ExposedDropdownMenuBox(
                expanded = levelMenuOpen,
                onExpandedChange = { levelMenuOpen = !levelMenuOpen }
            ) {
                val currentLabel = levels.firstOrNull { it.id == selectedLevel }?.name(s.lang) ?: ""
                OutlinedTextField(
                    value = currentLabel,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(s("class")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = levelMenuOpen) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor()
                )
                ExposedDropdownMenu(
                    expanded = levelMenuOpen,
                    onDismissRequest = { levelMenuOpen = false }
                ) {
                    levels.forEach { lvl ->
                        DropdownMenuItem(
                            text = { Text(lvl.name(s.lang)) },
                            onClick = {
                                selectedLevel = lvl.id
                                levelMenuOpen = false
                            }
                        )
                    }
                }
            }

            OutlinedTextField(
                value = institution,
                onValueChange = { institution = it },
                label = { Text(s("institution")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = group,
                onValueChange = { group = it },
                label = { Text(s("group")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(SanzarSpace.S2.dp))
            Button(
                onClick = {
                    if (name.trim().length < 2) return@Button
                    busy = true
                    scope.launch {
                        val ok = onSave(name, selectedLevel, institution, group)
                        busy = false
                        if (ok) onBack()
                    }
                },
                enabled = !busy,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(SanzarRadius.MD.dp)
            ) {
                Text(s("save"))
            }
        }
    }
}
