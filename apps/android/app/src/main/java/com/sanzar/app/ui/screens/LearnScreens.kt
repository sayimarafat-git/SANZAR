package com.sanzar.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.core.SanzarStrings
import com.sanzar.app.data.model.ResourceItem
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.components.*
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookDetailScreen(
    bookId: String,
    state: SanzarUiState,
    onBack: () -> Unit,
    onOpenChapter: (String, String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val book = state.catalog?.book(bookId)

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(book?.title ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        if (book == null) {
            EmptyStateView(message = s("noBooks"), modifier = Modifier.padding(padding))
            return@Scaffold
        }

        val subColor = SanzarColors.forSubject(book.subjectId)

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(SanzarSpace.S4.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
        ) {
            item {
                Row(
                    modifier = Modifier.padding(bottom = SanzarSpace.S3.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    BookCover(colors = book.cover, title = book.title, width = 100.dp)
                    Spacer(Modifier.width(SanzarSpace.S4.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = book.title,
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                        )
                        if (book.author.isNotEmpty()) {
                            Spacer(Modifier.height(4.dp))
                            Text(book.author, style = MaterialTheme.typography.bodyMedium)
                        }
                        if (book.edition.isNotEmpty()) {
                            Text(
                                text = book.edition,
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.muted
                            )
                        }
                        Spacer(Modifier.height(SanzarSpace.S2.dp))
                        SubjectBadge(
                            subjectId = book.subjectId,
                            label = s("chapters", mapOf("n" to book.chapters.size))
                        )
                    }
                }
            }

            items(book.chapters, key = { it.id }) { ch ->
                val done = state.progress.completed.contains("notes:${ch.id}")
                SanzarCard(
                    onClick = { onOpenChapter(book.id, ch.id) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(SanzarSpace.S3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(subColor.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "${ch.number}",
                                color = subColor,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(Modifier.width(SanzarSpace.S3.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(ch.title, fontWeight = FontWeight.SemiBold)
                            val meta = buildList {
                                if (ch.hasNotes) add(s("notes"))
                                if (ch.questionCount > 0) add(s("questions", mapOf("n" to ch.questionCount)))
                            }.joinToString(" · ")
                            if (meta.isNotEmpty()) {
                                Text(meta, style = MaterialTheme.typography.bodySmall, color = palette.muted)
                            }
                        }
                        if (done) {
                            Icon(Icons.Rounded.CheckCircle, contentDescription = s("done"), tint = SanzarColors.Success)
                        } else {
                            Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.muted)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChapterScreen(
    bookId: String,
    chapterId: String,
    state: SanzarUiState,
    onBack: () -> Unit,
    onOpenQuiz: (String) -> Unit,
    onOpenResourceReader: (String, String, String?) -> Unit,
    onDownloadResource: (ResourceItem) -> Unit,
    onRemoveDownload: (String) -> Unit,
    onMarkDone: (String) -> Unit,
    onStartStudy: (String, String) -> Unit,
    onStopStudy: () -> Unit,
    onStudyActivity: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val cat = state.catalog
    val book = cat?.book(bookId)
    val chapter = book?.chapters?.firstOrNull { it.id == chapterId }
    val notes = cat?.notes?.get(chapterId).orEmpty()
    val quiz = cat?.quizFor(chapterId)
    val done = state.progress.completed.contains("notes:$chapterId")

    DisposableEffect(chapterId) {
        onStartStudy("notes", chapterId)
        onDispose { onStopStudy() }
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("chapter", mapOf("n" to (chapter?.number ?: 1)))) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    if (state.activeStudySeconds > 0) {
                        SanzarPill(
                            text = SanzarStrings.formatMmSs(state.activeStudySeconds),
                            icon = Icons.Rounded.Timer,
                            modifier = Modifier.padding(end = 12.dp)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        if (book == null || chapter == null) {
            EmptyStateView(message = s("noNotes"), modifier = Modifier.padding(padding))
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(SanzarSpace.S4.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
        ) {
            item {
                Text(
                    text = chapter.title,
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                    text = book.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.muted
                )
            }

            if (chapter.resources.isNotEmpty() || quiz != null) {
                item {
                    Text(
                        text = s("resources"),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                }

                items(chapter.resources, key = { it.id }) { res ->
                    val installed = state.installedResources[res.id]
                    val dlProgress = state.downloadProgress[res.id]
                    val resDone = state.progress.completed.contains(res.id)
                    val icon = when (res.type) {
                        "video" -> Icons.Rounded.PlayCircleOutline
                        "pdf" -> Icons.Rounded.PictureAsPdf
                        "ppt" -> Icons.Rounded.Slideshow
                        else -> Icons.Rounded.Link
                    }

                    SanzarCard(
                        onClick = {
                            onStudyActivity()
                            onOpenResourceReader(book.id, chapter.id, res.id)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(SanzarSpace.S3.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(icon, contentDescription = null, tint = palette.primary)
                                Spacer(Modifier.width(SanzarSpace.S3.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = res.title.ifBlank { res.type.uppercase() },
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = when {
                                            dlProgress != null -> s("downloading")
                                            installed != null -> "${s("downloaded")} · ${(installed.sizeBytes / 1024).coerceAtLeast(1)} KB"
                                            else -> res.type.uppercase()
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (installed != null) SanzarColors.Success else palette.muted
                                    )
                                }
                                if (resDone) {
                                    Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = SanzarColors.Success)
                                    Spacer(Modifier.width(4.dp))
                                }
                                if (res.url != null && dlProgress == null) {
                                    IconButton(
                                        onClick = {
                                            if (installed != null) onRemoveDownload(res.id)
                                            else onDownloadResource(res)
                                        }
                                    ) {
                                        Icon(
                                            imageVector = if (installed != null) Icons.Rounded.CloudDone else Icons.Rounded.Download,
                                            contentDescription = s(if (installed != null) "removeDownload" else "downloadOffline"),
                                            tint = if (installed != null) SanzarColors.Success else palette.primary
                                        )
                                    }
                                }
                            }
                            if (dlProgress != null) {
                                Spacer(Modifier.height(6.dp))
                                SanzarProgressBar(progress = dlProgress, height = 6.dp)
                            }
                        }
                    }
                }

                if (quiz != null) {
                    item {
                        SanzarCard(
                            onClick = { onOpenQuiz(quiz.id) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Rounded.Quiz, contentDescription = null, tint = SanzarColors.BrandJade)
                                Spacer(Modifier.width(SanzarSpace.S3.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(s("chapterQuiz"), fontWeight = FontWeight.Bold)
                                    Text(
                                        text = "${s("questions", mapOf("n" to quiz.questionCount))} · ${s("minutes", mapOf("n" to ((quiz.durationSec + 59) / 60)))}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.muted
                                    )
                                }
                                Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.muted)
                            }
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = s("notes"),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.weight(1f)
                    )
                    if (notes.isNotEmpty()) {
                        TextButton(onClick = { onOpenResourceReader(book.id, chapter.id, null) }) {
                            Text(s("seeAll"))
                        }
                    }
                }
            }

            if (notes.isEmpty()) {
                item {
                    SanzarCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = s("noNotes"),
                            modifier = Modifier.padding(SanzarSpace.S4.dp),
                            color = palette.muted
                        )
                    }
                }
            } else {
                items(notes) { note ->
                    SanzarCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = note.heading,
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.titleMedium,
                                    modifier = Modifier.weight(1f)
                                )
                                if (note.page != null) {
                                    SanzarPill(text = s("page", mapOf("n" to note.page)))
                                }
                            }
                            Spacer(Modifier.height(SanzarSpace.S2.dp))
                            Text(
                                text = note.text,
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                    }
                }

                item {
                    if (done) {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            SanzarPill(
                                text = s("done"),
                                icon = Icons.Rounded.CheckCircle,
                                containerColor = SanzarColors.Success.copy(alpha = 0.14f),
                                contentColor = SanzarColors.Success
                            )
                        }
                    } else {
                        Button(
                            onClick = {
                                onStudyActivity()
                                onMarkDone("notes:$chapterId")
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(SanzarRadius.MD.dp)
                        ) {
                            Icon(Icons.Rounded.Check, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text(s("markDone"))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResourceReaderScreen(
    bookId: String,
    chapterId: String,
    resourceId: String?,
    state: SanzarUiState,
    onBack: () -> Unit,
    onDownloadResource: (ResourceItem) -> Unit,
    onMarkDone: (String) -> Unit,
    onStartStudy: (String, String, String?) -> Unit,
    onStopStudy: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val context = LocalContext.current
    val book = state.catalog?.book(bookId)
    val chapter = book?.chapters?.firstOrNull { it.id == chapterId }
    val resource = resourceId?.let { id -> chapter?.resources?.firstOrNull { it.id == id } }
    val notes = state.catalog?.notes?.get(chapterId).orEmpty()
    val targetCompletionId = resource?.id ?: "notes:$chapterId"
    val isDone = state.progress.completed.contains(targetCompletionId)
    val installed = resource?.let { state.installedResources[it.id] }
    val dlProgress = resource?.let { state.downloadProgress[it.id] }

    DisposableEffect(chapterId, resourceId) {
        onStartStudy(resource?.type ?: "notes", chapterId, resourceId)
        onDispose { onStopStudy() }
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = resource?.title?.ifBlank { resource.type.uppercase() } ?: chapter?.title ?: s("notes"),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    SanzarPill(
                        text = SanzarStrings.formatMmSs(state.activeStudySeconds),
                        icon = Icons.Rounded.Timer,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    if (isDone) {
                        Icon(
                            Icons.Rounded.CheckCircle,
                            contentDescription = s("done"),
                            tint = SanzarColors.Success,
                            modifier = Modifier.padding(end = 12.dp)
                        )
                    } else {
                        TextButton(onClick = { onMarkDone(targetCompletionId) }) {
                            Text(s("markDone"))
                        }
                    }
                },
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
            if (resource != null) {
                item {
                    GradientHeroCard {
                        Text(
                            text = resource.title.ifBlank { resource.type.uppercase() },
                            color = androidx.compose.ui.graphics.Color.White,
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "${resource.type.uppercase()} · v${resource.version}" +
                                if (resource.pages > 0) " · ${resource.pages} pages" else "",
                            color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.8f),
                            style = MaterialTheme.typography.bodySmall
                        )
                        Spacer(Modifier.height(SanzarSpace.S3.dp))
                        if (dlProgress != null) {
                            SanzarProgressBar(progress = dlProgress)
                            Spacer(Modifier.height(4.dp))
                            Text(s("downloading"), color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.bodySmall)
                        } else if (installed != null) {
                            SanzarPill(
                                text = "${s("downloaded")} (SHA-256 verified)",
                                icon = Icons.Rounded.CloudDone,
                                containerColor = SanzarColors.Success.copy(alpha = 0.25f),
                                contentColor = androidx.compose.ui.graphics.Color.White
                            )
                        }
                        Spacer(Modifier.height(SanzarSpace.S3.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (resource.url != null && installed == null && dlProgress == null) {
                                Button(onClick = { onDownloadResource(resource) }) {
                                    Icon(Icons.Rounded.Download, contentDescription = null)
                                    Spacer(Modifier.width(6.dp))
                                    Text(s("downloadOffline"))
                                }
                            }
                            if (resource.url != null) {
                                OutlinedButton(
                                    onClick = {
                                        runCatching {
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(resource.url)))
                                        }
                                    },
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = androidx.compose.ui.graphics.Color.White)
                                ) {
                                    Icon(Icons.Rounded.OpenInNew, contentDescription = null)
                                    Spacer(Modifier.width(6.dp))
                                    Text(s("openExternal"))
                                }
                            }
                        }
                    }
                }
            }

            if (notes.isNotEmpty()) {
                item {
                    Text(
                        text = s("notes"),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                }
                items(notes) { sec ->
                    SanzarCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = sec.heading,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f)
                                )
                                if (sec.page != null) {
                                    SanzarPill(text = s("page", mapOf("n" to sec.page)))
                                }
                            }
                            Spacer(Modifier.height(SanzarSpace.S2.dp))
                            Text(text = sec.text, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }

            item {
                if (!isDone) {
                    Button(
                        onClick = { onMarkDone(targetCompletionId) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(SanzarRadius.MD.dp)
                    ) {
                        Icon(Icons.Rounded.Check, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(s("markDone"))
                    }
                }
            }
        }
    }
}
