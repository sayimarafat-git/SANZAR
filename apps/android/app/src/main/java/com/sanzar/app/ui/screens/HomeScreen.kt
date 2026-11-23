package com.sanzar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.data.model.Book
import com.sanzar.app.data.model.Catalog
import com.sanzar.app.data.model.ProgressData
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.components.*
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace

@Composable
fun HomeScreen(
    state: SanzarUiState,
    onRefresh: () -> Unit,
    onMarkNotificationsRead: () -> Unit,
    onToggleTheme: () -> Unit,
    onSelectLanguage: (String) -> Unit,
    onOpenExams: () -> Unit,
    onOpenProgress: () -> Unit,
    onOpenLeaderboard: () -> Unit,
    onOpenTutor: () -> Unit,
    onOpenSubjectLibrary: (String) -> Unit,
    onOpenAllLibrary: () -> Unit,
    onOpenBook: (String) -> Unit,
    onSignInClick: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val cat: Catalog? = state.catalog
    val levelId = state.profile?.levelId ?: state.selectedLevelId
    val firstName = state.profile?.displayName
        ?.trim()
        ?.split(" ")
        ?.firstOrNull()
        ?.takeIf { it.isNotEmpty() }
        ?: state.firebaseUser?.displayName?.split(" ")?.firstOrNull()
        ?: if (state.guestMode) s("guestMode") else ""

    var notifOpen by remember { mutableStateOf(false) }
    var langOpen by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        contentPadding = PaddingValues(bottom = SanzarSpace.S8.dp)
    ) {
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(bottomStart = SanzarRadius.XL.dp, bottomEnd = SanzarRadius.XL.dp))
                    .background(SanzarColors.HeroGradient)
                    .statusBarsPadding()
                    .padding(horizontal = SanzarSpace.S5.dp, vertical = SanzarSpace.S5.dp)
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BrandMark(size = 36.dp)
                        Spacer(Modifier.width(SanzarSpace.S2.dp))
                        Text(
                            text = "Sanzar",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.weight(1f)
                        )
                        if (state.catalogOffline) {
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = Color.White.copy(alpha = 0.16f)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Rounded.CloudOff, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text(s("offline"), color = Color.White, style = MaterialTheme.typography.labelSmall)
                                }
                            }
                            Spacer(Modifier.width(4.dp))
                        }

                        Box {
                            IconButton(onClick = { notifOpen = true }) {
                                BadgedBox(
                                    badge = {
                                        if (state.unreadNotifications > 0) {
                                            Badge { Text("${state.unreadNotifications}") }
                                        }
                                    }
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.NotificationsNone,
                                        contentDescription = s("notifications"),
                                        tint = Color.White
                                    )
                                }
                            }
                            DropdownMenu(
                                expanded = notifOpen,
                                onDismissRequest = { notifOpen = false }
                            ) {
                                if (state.notifications.isEmpty()) {
                                    DropdownMenuItem(
                                        text = { Text(s("noNotifications")) },
                                        onClick = { notifOpen = false }
                                    )
                                } else {
                                    state.notifications.take(6).forEach { n ->
                                        DropdownMenuItem(
                                            text = {
                                                Column {
                                                    Text(
                                                        n.title,
                                                        fontWeight = if (n.read) FontWeight.Normal else FontWeight.Bold,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                    if (n.body.isNotEmpty()) {
                                                        Text(
                                                            n.body,
                                                            style = MaterialTheme.typography.bodySmall,
                                                            maxLines = 2,
                                                            overflow = TextOverflow.Ellipsis
                                                        )
                                                    }
                                                }
                                            },
                                            onClick = {
                                                notifOpen = false
                                                onMarkNotificationsRead()
                                            }
                                        )
                                    }
                                }
                            }
                        }

                        IconButton(onClick = onToggleTheme) {
                            Icon(
                                imageVector = if (state.themeMode == "dark") Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                contentDescription = s("theme"),
                                tint = Color.White
                            )
                        }

                        Box {
                            IconButton(onClick = { langOpen = true }) {
                                Icon(Icons.Rounded.Translate, contentDescription = s("language"), tint = Color.White)
                            }
                            DropdownMenu(expanded = langOpen, onDismissRequest = { langOpen = false }) {
                                listOf("bn" to "বাংলা", "en" to "English", "zh" to "中文").forEach { (code, label) ->
                                    DropdownMenuItem(
                                        text = { Text(label) },
                                        onClick = {
                                            langOpen = false
                                            onSelectLanguage(code)
                                        }
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(SanzarSpace.S4.dp))
                    Text(
                        text = s("hello", mapOf("name" to firstName)),
                        color = Color.White,
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = s("tagline"),
                        color = Color.White.copy(alpha = 0.78f),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(SanzarSpace.S3.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SanzarPill(
                            text = s("streak", mapOf("n" to state.progress.streak)),
                            icon = Icons.Rounded.LocalFireDepartment,
                            containerColor = Color.White.copy(alpha = 0.16f),
                            contentColor = Color.White
                        )
                        SanzarPill(
                            text = s("xpTotal", mapOf("n" to state.progress.xp)),
                            icon = Icons.Rounded.Star,
                            containerColor = Color.White.copy(alpha = 0.16f),
                            contentColor = Color.White
                        )
                    }
                }
            }
        }

        if (state.guestMode && state.firebaseUser == null) {
            item {
                Spacer(Modifier.height(SanzarSpace.S3.dp))
                SanzarCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = SanzarSpace.S4.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(SanzarSpace.S3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Rounded.CloudOff, contentDescription = null, tint = palette.primary)
                        Spacer(Modifier.width(SanzarSpace.S3.dp))
                        Text(
                            text = s("guestSyncHint"),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = onSignInClick) {
                            Text(s("signIn"))
                        }
                    }
                }
            }
        }

        if (cat == null) {
            item {
                if (state.catalogError != null) {
                    ErrorRetryView(
                        message = s(if (state.catalogOffline) "err.network" else "err.generic"),
                        onRetry = onRefresh
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(SanzarSpace.S8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
            }
        } else {
            item {
                Spacer(Modifier.height(SanzarSpace.S4.dp))
                DailyGoalSummaryCard(
                    progress = state.progress,
                    modifier = Modifier.padding(horizontal = SanzarSpace.S4.dp),
                    onClick = onOpenProgress
                )
            }

            item {
                SectionTitle(title = s("quickActions"))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = SanzarSpace.S4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    QuickActionTile(
                        icon = Icons.Rounded.Assignment,
                        label = s("exams"),
                        onClick = onOpenExams,
                        modifier = Modifier.weight(1f)
                    )
                    QuickActionTile(
                        icon = Icons.Rounded.Insights,
                        label = s("progress"),
                        onClick = onOpenProgress,
                        modifier = Modifier.weight(1f)
                    )
                    QuickActionTile(
                        icon = Icons.Rounded.Leaderboard,
                        label = s("leaderboard"),
                        onClick = onOpenLeaderboard,
                        modifier = Modifier.weight(1f)
                    )
                    QuickActionTile(
                        icon = Icons.Rounded.SmartToy,
                        label = s("tutor"),
                        onClick = onOpenTutor,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            if (cat.announcements.isNotEmpty()) {
                item {
                    SectionTitle(title = s("announcements"))
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = SanzarSpace.S4.dp),
                        horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
                    ) {
                        items(cat.announcements.take(5), key = { it.id }) { ann ->
                            SanzarCard(modifier = Modifier.width(280.dp)) {
                                Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                                    Text(
                                        text = ann.title,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = ann.body,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.text2,
                                        maxLines = 3,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }

            val levelBooks = cat.booksFor(levelId)
            val subjects = cat.subjects.filter { sub -> levelBooks.any { it.subjectId == sub.id } }
            if (subjects.isNotEmpty()) {
                item {
                    SectionTitle(title = s("subjects"))
                    val rows = subjects.chunked(4)
                    Column(
                        modifier = Modifier.padding(horizontal = SanzarSpace.S4.dp),
                        verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
                    ) {
                        rows.forEach { rowItems ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
                            ) {
                                rowItems.forEach { sub ->
                                    val subColor = SanzarColors.forSubject(sub.id)
                                    Column(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(SanzarRadius.MD.dp))
                                            .clickable { onOpenSubjectLibrary(sub.id) }
                                            .padding(vertical = 4.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(56.dp)
                                                .clip(RoundedCornerShape(SanzarRadius.MD.dp))
                                                .background(subColor.copy(alpha = 0.14f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                imageVector = subjectIcon(sub.icon),
                                                contentDescription = null,
                                                tint = subColor
                                            )
                                        }
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            text = sub.name(s.lang),
                                            style = MaterialTheme.typography.bodySmall,
                                            textAlign = TextAlign.Center,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                                repeat(4 - rowItems.size) {
                                    Spacer(Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }

            val featured = cat.featured(levelId).ifEmpty { levelBooks.take(6) }
            if (featured.isNotEmpty()) {
                item {
                    SectionTitle(
                        title = s("featured"),
                        trailing = {
                            TextButton(onClick = onOpenAllLibrary) {
                                Text(s("seeAll"))
                            }
                        }
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = SanzarSpace.S4.dp),
                        horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
                    ) {
                        items(featured, key = { it.id }) { book ->
                            FeaturedBookItem(
                                book = book,
                                chaptersLabel = s("chapters", mapOf("n" to book.chapters.size)),
                                onClick = { onOpenBook(book.id) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickActionTile(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalSanzarPalette.current
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(SanzarRadius.MD.dp))
            .clickable(onClick = onClick)
            .padding(vertical = SanzarSpace.S2.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(RoundedCornerShape(SanzarRadius.MD.dp))
                .background(palette.primarySoft),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, tint = palette.primary)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun FeaturedBookItem(
    book: Book,
    chaptersLabel: String,
    onClick: () -> Unit
) {
    val palette = LocalSanzarPalette.current
    Column(
        modifier = Modifier
            .width(110.dp)
            .clickable(onClick = onClick)
    ) {
        BookCover(colors = book.cover, title = book.title, width = 110.dp)
        Spacer(Modifier.height(4.dp))
        Text(
            text = chaptersLabel,
            style = MaterialTheme.typography.bodySmall,
            color = palette.muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun DailyGoalSummaryCard(
    progress: ProgressData,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val ratio = (progress.todaySec.toFloat() / progress.goalSec.coerceAtLeast(1).toFloat()).coerceIn(0f, 1f)
    val minsDone = progress.todaySec / 60
    val minsGoal = (progress.goalSec + 30) / 60

    SanzarCard(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(SanzarSpace.S4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(74.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    progress = { ratio },
                    modifier = Modifier.fillMaxSize(),
                    strokeWidth = 7.dp,
                    trackColor = palette.primarySoft,
                    color = palette.primary
                )
                Text(
                    text = "${minsDone}m",
                    fontWeight = FontWeight.ExtraBold,
                    style = MaterialTheme.typography.titleMedium
                )
            }
            Spacer(Modifier.width(SanzarSpace.S4.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(s("today"), fontWeight = FontWeight.Bold)
                Text(
                    text = s("goalOf", mapOf("m" to minsDone, "g" to minsGoal)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.text2
                )
                Spacer(Modifier.height(SanzarSpace.S2.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SanzarPill(
                        text = s("streak", mapOf("n" to progress.streak)),
                        icon = Icons.Rounded.LocalFireDepartment,
                        containerColor = SanzarColors.Warning.copy(alpha = 0.14f),
                        contentColor = SanzarColors.Warning
                    )
                    SanzarPill(
                        text = s("levelN", mapOf("n" to progress.level)),
                        icon = Icons.Rounded.Star,
                        containerColor = SanzarColors.Gold.copy(alpha = 0.16f),
                        contentColor = SanzarColors.Gold
                    )
                }
            }
        }
    }
}
