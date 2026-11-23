package com.sanzar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.components.BookCover
import com.sanzar.app.ui.components.EmptyStateView
import com.sanzar.app.ui.components.ErrorRetryView
import com.sanzar.app.ui.components.SanzarCard
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    state: SanzarUiState,
    initialSubject: String?,
    onRefresh: () -> Unit,
    onOpenBook: (String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    var query by remember { mutableStateOf("") }
    var selectedSubject by remember(initialSubject) { mutableStateOf(initialSubject) }
    var allClasses by remember { mutableStateOf(false) }

    val userLevel = state.profile?.levelId ?: state.selectedLevelId
    val cat = state.catalog

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("library")) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        if (cat == null) {
            Box(modifier = Modifier.fillMaxSize().padding(padding)) {
                if (state.catalogError != null) {
                    ErrorRetryView(
                        message = s(if (state.catalogOffline) "err.network" else "err.generic"),
                        onRetry = onRefresh
                    )
                } else {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
            }
            return@Scaffold
        }

        val activeLevel = if (allClasses) null else userLevel
        val baseBooks = cat.booksFor(activeLevel)
        val filtered = remember(baseBooks, query, selectedSubject) {
            val q = query.trim().lowercase()
            baseBooks.filter { book ->
                (selectedSubject == null || book.subjectId == selectedSubject) &&
                    (q.isEmpty() || book.title.lowercase().contains(q) || book.author.lowercase().contains(q))
            }
        }
        val subjects = cat.subjects.filter { sub -> baseBooks.any { it.subjectId == sub.id } }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = SanzarSpace.S8.dp)
        ) {
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(s("search")) },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                    singleLine = true,
                    shape = RoundedCornerShape(SanzarRadius.SM.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S2.dp)
                )
            }

            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S1.dp),
                    horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                ) {
                    if (userLevel != null) {
                        item {
                            FilterChip(
                                selected = allClasses,
                                onClick = { allClasses = !allClasses },
                                label = { Text(s("allClasses")) }
                            )
                        }
                    }
                    items(subjects, key = { it.id }) { sub ->
                        FilterChip(
                            selected = selectedSubject == sub.id,
                            onClick = {
                                selectedSubject = if (selectedSubject == sub.id) null else sub.id
                            },
                            label = { Text(sub.name(s.lang)) }
                        )
                    }
                }
            }

            if (filtered.isEmpty()) {
                item {
                    EmptyStateView(message = s("noBooks"))
                }
            } else {
                items(filtered, key = { it.id }) { book ->
                    SanzarCard(
                        onClick = { onOpenBook(book.id) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = SanzarSpace.S4.dp, vertical = 4.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(SanzarSpace.S3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            BookCover(colors = book.cover, title = book.title, width = 60.dp)
                            Spacer(Modifier.width(SanzarSpace.S3.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = book.title,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (book.author.isNotEmpty()) {
                                    Text(
                                        text = book.author,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.muted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Spacer(Modifier.height(4.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(SanzarColors.forSubject(book.subjectId))
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    val subName = cat.subject(book.subjectId)?.name(s.lang).orEmpty()
                                    val chapLabel = s("chapters", mapOf("n" to book.chapters.size))
                                    Text(
                                        text = if (subName.isNotEmpty()) "$subName · $chapLabel" else chapLabel,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.text2,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                            Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.muted)
                        }
                    }
                }
            }
        }
    }
}
