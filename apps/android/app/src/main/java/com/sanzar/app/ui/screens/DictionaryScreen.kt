package com.sanzar.app.ui.screens

import android.speech.tts.TextToSpeech
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.data.model.DictionaryEntry
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.components.EmptyStateView
import com.sanzar.app.ui.components.SanzarCard
import com.sanzar.app.ui.components.SanzarPill
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace
import kotlinx.coroutines.delay
import java.util.Locale

private fun langShortLabel(code: String): String = when (code) {
    "zh", "zh-Hans" -> "中文"
    "bn" -> "BN"
    else -> "EN"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DictionaryScreen(
    state: SanzarUiState,
    onSearch: (query: String, lang: String, hskLevel: String, partOfSpeech: String, loadMore: Boolean) -> Unit,
    onTranslate: (text: String, sourceLang: String, targetLang: String) -> Unit,
    onLoadPersonal: () -> Unit,
    onToggleSave: (DictionaryEntry) -> Unit,
    onSaveTranslation: (word: String, meaning: String, sourceLang: String, targetLang: String) -> Unit,
    onDeleteSaved: (String) -> Unit,
    onDeleteHistory: (String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val context = LocalContext.current

    var activeTab by remember { mutableStateOf("dictionary") }

    // Unified search + inline translation state
    var query by remember { mutableStateOf("") }
    var targetLang by remember { mutableStateOf("bn") }
    var langFilter by remember { mutableStateOf("all") }
    var hskFilter by remember { mutableStateOf("") }
    var posFilter by remember { mutableStateOf("") }

    var tts by remember { mutableStateOf<TextToSpeech?>(null) }
    DisposableEffect(context) {
        val engine = TextToSpeech(context) { }
        tts = engine
        onDispose {
            engine.stop()
            engine.shutdown()
        }
    }

    fun speak(text: String, langCode: String) {
        if (text.isBlank()) return
        val locale = when (langCode) {
            "zh", "zh-Hans" -> Locale.SIMPLIFIED_CHINESE
            "bn" -> Locale("bn", "BD")
            else -> Locale.US
        }
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "sanzar_tts")
    }

    LaunchedEffect(state.firebaseUser?.uid) {
        if (state.firebaseUser != null) {
            onLoadPersonal()
        }
    }

    LaunchedEffect(activeTab, query, langFilter, hskFilter, posFilter) {
        if (activeTab == "dictionary") {
            delay(250)
            onSearch(query, langFilter, hskFilter, posFilter, false)
        }
    }

    val savedEntryIds = remember(state.savedVocabulary) {
        state.savedVocabulary.flatMap { listOfNotNull(it["dictionary_entry_id"], it["id"]) }.toSet()
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("dictionary")) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(start = SanzarSpace.S4.dp, end = SanzarSpace.S4.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
        ) {
            // 3 Clean Tabs: Dictionary, Saved, History
            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                ) {
                    listOf(
                        "dictionary" to "Dictionary",
                        "saved" to "Saved (${state.savedVocabulary.size})",
                        "history" to "History (${state.translationHistory.size})"
                    ).forEach { (key, label) ->
                        FilterChip(
                            selected = activeTab == key,
                            onClick = { activeTab = key },
                            label = { Text(label) }
                        )
                    }
                }
            }

            // ==================== UNIFIED DICTIONARY + INLINE TRANSLATION ====================
            if (activeTab == "dictionary") {
                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Search word, Pinyin, or sentence to translate…") },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = "" }) {
                                    Icon(Icons.Rounded.Clear, contentDescription = s("clearSearch"))
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(SanzarRadius.SM.dp),
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                // Inline Target Language + Translate button
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            listOf("bn" to "→ বাংলা", "en" to "→ English", "zh-Hans" to "→ 简体中文")
                                .forEach { (code, label) ->
                                    FilterChip(
                                        selected = targetLang == code,
                                        onClick = { targetLang = code },
                                        label = { Text(label) }
                                    )
                                }
                        }
                        Spacer(Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val src = if (langFilter == "all") "auto" else langFilter
                                onTranslate(query, src, targetLang)
                            },
                            enabled = !state.translating && query.isNotBlank()
                        ) {
                            if (state.translating) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                Spacer(Modifier.width(6.dp))
                            }
                            Text("Translate")
                        }
                    }
                }

                // Inline Translation Error
                if (!state.translationError.isNullOrBlank()) {
                    item {
                        Text(
                            text = state.translationError,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                // Inline Translation Result Card (top of search results)
                if (query.isNotBlank() && state.translationOutput.isNotBlank()) {
                    item {
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S4.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        SanzarPill(
                                            text = "${langShortLabel(state.translationDetectedLang.ifBlank { "en" })} → ${langShortLabel(targetLang)}"
                                        )
                                        if (state.translationProvider.isNotBlank()) {
                                            SanzarPill(text = state.translationProvider)
                                        }
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        text = state.translationOutput,
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold)
                                    )
                                }
                                IconButton(onClick = { speak(state.translationOutput, targetLang) }) {
                                    Icon(Icons.Rounded.VolumeUp, contentDescription = "Listen", tint = palette.primary)
                                }
                                if (state.firebaseUser != null) {
                                    IconButton(
                                        onClick = {
                                            onSaveTranslation(
                                                query.trim(),
                                                state.translationOutput,
                                                state.translationDetectedLang.ifBlank { "en" },
                                                targetLang
                                            )
                                        }
                                    ) {
                                        Icon(Icons.Rounded.BookmarkAdd, contentDescription = "Save", tint = palette.primary)
                                    }
                                }
                            }
                        }
                    }
                }

                // Language & HSK filters
                item {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                    ) {
                        listOf("all" to s("allWords"), "zh-Hans" to "简体中文", "en" to "English", "bn" to "বাংলা")
                            .forEach { (key, label) ->
                                FilterChip(
                                    selected = langFilter == key,
                                    onClick = { langFilter = key },
                                    label = { Text(label) }
                                )
                            }
                    }
                }

                item {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                    ) {
                        listOf("" to "All HSK", "HSK 1" to "HSK 1", "HSK 2" to "HSK 2", "HSK 3" to "HSK 3", "HSK 4" to "HSK 4")
                            .forEach { (key, label) ->
                                FilterChip(
                                    selected = hskFilter == key,
                                    onClick = { hskFilter = key },
                                    label = { Text(label) }
                                )
                            }
                    }
                }

                if (state.dictionaryLoading && state.dictionaryEntries.isEmpty()) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                } else if (state.dictionaryEntries.isEmpty() && state.translationOutput.isBlank()) {
                    item { EmptyStateView(message = s("noWordsFound"), icon = Icons.Rounded.MenuBook) }
                } else {
                    items(state.dictionaryEntries, key = { it.id }) { entry ->
                        val saved = savedEntryIds.contains(entry.id) || savedEntryIds.contains("sv_${entry.id}")
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = entry.word,
                                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold)
                                        )
                                        if (entry.phonetic.isNotEmpty()) {
                                            Text(entry.phonetic, style = MaterialTheme.typography.bodySmall, color = palette.primary)
                                        }
                                        Spacer(Modifier.height(4.dp))
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            SanzarPill(text = langShortLabel(entry.language))
                                            if (entry.partOfSpeech.isNotEmpty()) SanzarPill(text = entry.partOfSpeech)
                                            if (entry.hskLevel.isNotEmpty()) SanzarPill(text = entry.hskLevel)
                                        }
                                    }
                                    IconButton(onClick = { speak(entry.word, entry.language) }) {
                                        Icon(Icons.Rounded.VolumeUp, contentDescription = "Pronounce", tint = palette.primary)
                                    }
                                    if (state.firebaseUser != null) {
                                        IconButton(onClick = { onToggleSave(entry) }) {
                                            Icon(
                                                imageVector = if (saved) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                                                contentDescription = s("savedWords"),
                                                tint = if (saved) palette.primary else palette.muted
                                            )
                                        }
                                    }
                                }
                                if (entry.meaningEn.isNotEmpty()) {
                                    Spacer(Modifier.height(6.dp))
                                    Text("EN: ${entry.meaningEn}", style = MaterialTheme.typography.bodyMedium)
                                }
                                if (entry.meaningBn.isNotEmpty()) {
                                    Text("BN: ${entry.meaningBn}", style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                                if (entry.meaningZh.isNotEmpty()) {
                                    Text("中文: ${entry.meaningZh}", style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                                if (entry.example.isNotEmpty()) {
                                    Spacer(Modifier.height(6.dp))
                                    Text(entry.example, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                    if (entry.exampleTranslation.isNotEmpty()) {
                                        Text(entry.exampleTranslation, style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                    }
                                }
                            }
                        }
                    }

                    if (state.dictionaryHasMore) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                OutlinedButton(onClick = { onSearch(query, langFilter, hskFilter, posFilter, true) }) {
                                    Text("Load more words")
                                }
                            }
                        }
                    }
                }
            }

            // ==================== SAVED TAB ====================
            if (activeTab == "saved") {
                if (state.savedVocabulary.isEmpty()) {
                    item { EmptyStateView(message = "No saved vocabulary yet.", icon = Icons.Rounded.BookmarkBorder) }
                } else {
                    items(state.savedVocabulary, key = { it["id"] ?: it.hashCode().toString() }) { item ->
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = item["word"].orEmpty(),
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                                    )
                                    if (!item["phonetic"].isNullOrBlank()) {
                                        Text(item["phonetic"].orEmpty(), style = MaterialTheme.typography.bodySmall, color = palette.primary)
                                    }
                                    if (!item["meaning"].isNullOrBlank()) {
                                        Text(item["meaning"].orEmpty(), style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                    }
                                }
                                IconButton(onClick = { speak(item["word"].orEmpty(), item["source_language"] ?: "en") }) {
                                    Icon(Icons.Rounded.VolumeUp, contentDescription = "Pronounce", tint = palette.primary)
                                }
                                IconButton(onClick = { item["id"]?.let(onDeleteSaved) }) {
                                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }

            // ==================== HISTORY TAB ====================
            if (activeTab == "history") {
                if (state.translationHistory.isEmpty()) {
                    item { EmptyStateView(message = "No translation history yet.", icon = Icons.Rounded.History) }
                } else {
                    items(state.translationHistory, key = { it["id"] ?: it.hashCode().toString() }) { item ->
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    SanzarPill(
                                        text = "${langShortLabel(item["source_language"] ?: "en")} → ${langShortLabel(item["target_language"] ?: "bn")}"
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(item["source_text"].orEmpty(), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                    Text(item["translated_text"].orEmpty(), style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                                IconButton(onClick = { item["id"]?.let(onDeleteHistory) }) {
                                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
