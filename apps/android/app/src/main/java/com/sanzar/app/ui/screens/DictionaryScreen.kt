package com.sanzar.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.speech.tts.TextToSpeech
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

private fun langFullLabel(code: String): String = when (code) {
    "zh", "zh-Hans" -> "简体中文"
    "bn" -> "বাংলা"
    else -> "English"
}

private fun detectClientScript(text: String): String? {
    val s = text.trim()
    if (s.isEmpty()) return null
    var bn = 0
    var zh = 0
    var latin = 0
    for (ch in s) {
        val cp = ch.code
        when {
            cp in 0x0980..0x09FF -> bn++
            cp in 0x4E00..0x9FFF || cp in 0x3400..0x4DBF -> zh++
            cp in 0x0041..0x005A || cp in 0x0061..0x007A -> latin++
        }
    }
    if (bn == 0 && zh == 0 && latin == 0) return null
    return when {
        bn >= zh && bn >= latin && bn > 0 -> "bn"
        zh >= bn && zh >= latin && zh > 0 -> "zh-Hans"
        else -> "en"
    }
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

    // Saved search & Flashcard review mode
    var savedSearch by remember { mutableStateOf("") }
    var flashcardMode by remember { mutableStateOf(false) }
    var cardIndex by remember { mutableStateOf(0) }
    var cardFlipped by remember { mutableStateOf(false) }

    val detectedLang = remember(query) { detectClientScript(query) }
    LaunchedEffect(detectedLang) {
        if (detectedLang != null && detectedLang == targetLang) {
            targetLang = if (detectedLang == "en") "bn" else "en"
        }
    }

    var tts by remember { mutableStateOf<TextToSpeech?>(null) }
    DisposableEffect(context) {
        val engine = TextToSpeech(context) { }
        tts = engine
        onDispose {
            engine.stop()
            engine.shutdown()
        }
    }

    fun speak(text: String, langCode: String, rate: Float = 1.0f) {
        if (text.isBlank()) return
        val locale = when (langCode) {
            "zh", "zh-Hans" -> Locale.SIMPLIFIED_CHINESE
            "bn" -> Locale("bn", "BD")
            else -> Locale.US
        }
        tts?.language = locale
        tts?.setSpeechRate(rate)
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "sanzar_tts")
    }

    fun copyToClipboard(text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        cm?.setPrimaryClip(ClipData.newPlainText("sanzar", text))
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

    val filteredSaved = remember(state.savedVocabulary, savedSearch) {
        val q = savedSearch.trim().lowercase()
        if (q.isEmpty()) state.savedVocabulary
        else state.savedVocabulary.filter { item ->
            listOfNotNull(item["word"], item["phonetic"], item["meaning"], item["hsk_level"])
                .any { it.lowercase().contains(q) }
        }
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("dictionary"), fontWeight = FontWeight.ExtraBold) },
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
            // Compact 3-Tab Switcher (outside hero, clean native surface)
            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                ) {
                    listOf(
                        "dictionary" to "Search",
                        "saved" to "Saved (${state.savedVocabulary.size})",
                        "history" to "History (${state.translationHistory.size})"
                    ).forEach { (key, label) ->
                        FilterChip(
                            selected = activeTab == key,
                            onClick = {
                                activeTab = key
                                flashcardMode = false
                            },
                            label = { Text(label, fontWeight = FontWeight.SemiBold) }
                        )
                    }
                }
            }

            // Standalone Spotlight Search Card (outside header)
            if (activeTab == "dictionary") {
                item {
                    SanzarCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(SanzarSpace.S4.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            OutlinedTextField(
                                value = query,
                                onValueChange = { query = it },
                                placeholder = { Text("Word, Pinyin (nihao), or sentence…") },
                                leadingIcon = {
                                    Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.primary)
                                },
                                trailingIcon = {
                                    if (query.isNotEmpty()) {
                                        IconButton(onClick = { query = "" }) {
                                            Icon(Icons.Rounded.Clear, contentDescription = s("clearSearch"))
                                        }
                                    }
                                },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth()
                            )

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
                                    listOf("bn" to "→ বাংলা", "en" to "→ EN", "zh-Hans" to "→ 中文")
                                        .forEach { (code, label) ->
                                            FilterChip(
                                                selected = targetLang == code,
                                                onClick = {
                                                    targetLang = code
                                                    if (query.isNotBlank()) {
                                                        val src = if (langFilter == "all") "auto" else langFilter
                                                        onTranslate(query, src, code)
                                                    }
                                                },
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
                                    enabled = !state.translating && query.isNotBlank(),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    if (state.translating) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                                        Spacer(Modifier.width(6.dp))
                                    }
                                    Text("Translate", fontWeight = FontWeight.Bold)
                                }
                            }

                            if (detectedLang != null) {
                                Text(
                                    text = "Detected: ${langFullLabel(detectedLang)} → ${langFullLabel(targetLang)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.primary
                                )
                            } else {
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("Try:", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                    listOf("你好" to "bn", "ধন্যবাদ" to "en", "Knowledge" to "zh-Hans").forEach { (w, tgt) ->
                                        AssistChip(
                                            onClick = {
                                                query = w
                                                targetLang = tgt
                                                if (state.firebaseUser != null) onTranslate(w, "auto", tgt)
                                            },
                                            label = { Text(w) }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ==================== UNIFIED DICTIONARY + INLINE TRANSLATION ====================
            if (activeTab == "dictionary") {
                if (!state.translationError.isNullOrBlank()) {
                    item {
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                text = state.translationError,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(SanzarSpace.S3.dp)
                            )
                        }
                    }
                }

                // Inline Translation Spotlight Card
                if (query.isNotBlank() && state.translationOutput.isNotBlank()) {
                    item {
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Column(
                                modifier = Modifier.padding(SanzarSpace.S4.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        SanzarPill(
                                            text = "${langShortLabel(state.translationDetectedLang.ifBlank { "en" })} → ${langShortLabel(targetLang)}"
                                        )
                                        if (state.translationProvider.isNotBlank()) {
                                            SanzarPill(text = state.translationProvider)
                                        }
                                    }
                                    Row {
                                        IconButton(onClick = { speak(state.translationOutput, targetLang, 1.0f) }) {
                                            Icon(Icons.Rounded.VolumeUp, contentDescription = "Listen", tint = palette.primary)
                                        }
                                        IconButton(onClick = { speak(state.translationOutput, targetLang, 0.5f) }) {
                                            Icon(Icons.Rounded.SlowMotionVideo, contentDescription = "Listen slowly 0.5x", tint = palette.text2)
                                        }
                                        IconButton(onClick = { copyToClipboard(state.translationOutput) }) {
                                            Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy", tint = palette.text2)
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
                                Text(
                                    text = state.translationOutput,
                                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold)
                                )
                                Text(
                                    text = query.trim(),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = palette.muted
                                )
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
                        listOf("" to "All HSK", "HSK 1" to "HSK 1", "HSK 2" to "HSK 2", "HSK 3" to "HSK 3", "HSK 4" to "HSK 4", "HSK 5" to "HSK 5", "HSK 6" to "HSK 6")
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
                            Column(
                                modifier = Modifier.padding(SanzarSpace.S4.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row(verticalAlignment = Alignment.Top) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = entry.word,
                                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black)
                                        )
                                        if (entry.phonetic.isNotEmpty()) {
                                            Text(
                                                entry.phonetic,
                                                style = MaterialTheme.typography.bodySmall,
                                                fontWeight = FontWeight.SemiBold,
                                                color = palette.primary
                                            )
                                        }
                                        Spacer(Modifier.height(6.dp))
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            SanzarPill(text = langShortLabel(entry.language))
                                            if (entry.partOfSpeech.isNotEmpty()) SanzarPill(text = entry.partOfSpeech)
                                            if (entry.hskLevel.isNotEmpty()) SanzarPill(text = entry.hskLevel)
                                        }
                                    }
                                    IconButton(onClick = { speak(entry.word, entry.language, 1.0f) }) {
                                        Icon(Icons.Rounded.VolumeUp, contentDescription = "Pronounce", tint = palette.primary)
                                    }
                                    IconButton(onClick = { copyToClipboard(entry.word) }) {
                                        Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy", tint = palette.muted)
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
                                    Text("EN   ${entry.meaningEn}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                }
                                if (entry.meaningBn.isNotEmpty()) {
                                    Text("BN   ${entry.meaningBn}", style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                                if (entry.meaningZh.isNotEmpty()) {
                                    Text("中文  ${entry.meaningZh}", style = MaterialTheme.typography.bodySmall, color = palette.text2)
                                }
                                if (entry.example.isNotEmpty()) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(palette.primary.copy(alpha = 0.08f))
                                            .padding(10.dp)
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(entry.example, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                                            if (entry.exampleTranslation.isNotEmpty()) {
                                                Text(entry.exampleTranslation, style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (state.dictionaryHasMore) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                OutlinedButton(onClick = { onSearch(query, langFilter, hskFilter, posFilter, true) }) {
                                    Text("Load more vocabulary")
                                }
                            }
                        }
                    }
                }
            }

            // ==================== SAVED TAB + FLASHCARD PRACTICE ====================
            if (activeTab == "saved") {
                if (state.savedVocabulary.isEmpty()) {
                    item { EmptyStateView(message = "No saved vocabulary yet.", icon = Icons.Rounded.BookmarkBorder) }
                } else {
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = savedSearch,
                                onValueChange = {
                                    savedSearch = it
                                    cardIndex = 0
                                    cardFlipped = false
                                },
                                placeholder = { Text("Filter saved…") },
                                singleLine = true,
                                shape = RoundedCornerShape(SanzarRadius.SM.dp),
                                modifier = Modifier.weight(1f)
                            )
                            FilledTonalButton(
                                onClick = {
                                    flashcardMode = !flashcardMode
                                    cardIndex = 0
                                    cardFlipped = false
                                }
                            ) {
                                Text(if (flashcardMode) "List" else "Flashcards")
                            }
                        }
                    }

                    if (flashcardMode && filteredSaved.isNotEmpty()) {
                        val safeIdx = cardIndex.coerceIn(0, filteredSaved.lastIndex)
                        val card = filteredSaved[safeIdx]
                        item {
                            SanzarCard(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 210.dp)
                                    .clickable { cardFlipped = !cardFlipped }
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    SanzarPill(text = if (cardFlipped) "Meaning" else langFullLabel(card["source_language"] ?: "en"))
                                    Text(
                                        text = if (cardFlipped) card["meaning"].orEmpty() else card["word"].orEmpty(),
                                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black),
                                        textAlign = TextAlign.Center
                                    )
                                    if (!cardFlipped && !card["phonetic"].isNullOrBlank()) {
                                        Text(card["phonetic"].orEmpty(), color = palette.primary, fontWeight = FontWeight.SemiBold)
                                    }
                                    Text("Tap card to flip", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                }
                            }
                        }
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                OutlinedButton(
                                    enabled = safeIdx > 0,
                                    onClick = { cardIndex = (safeIdx - 1).coerceAtLeast(0); cardFlipped = false }
                                ) { Text("Previous") }
                                Text("${safeIdx + 1} / ${filteredSaved.size}", fontWeight = FontWeight.Bold)
                                Button(
                                    enabled = safeIdx < filteredSaved.lastIndex,
                                    onClick = { cardIndex = (safeIdx + 1).coerceAtMost(filteredSaved.lastIndex); cardFlipped = false }
                                ) { Text("Next") }
                            }
                        }
                    } else {
                        items(filteredSaved, key = { it["id"] ?: it.hashCode().toString() }) { item ->
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
            }

            // ==================== HISTORY TAB ====================
            if (activeTab == "history") {
                if (state.translationHistory.isEmpty()) {
                    item { EmptyStateView(message = "No translation history yet.", icon = Icons.Rounded.History) }
                } else {
                    items(state.translationHistory, key = { it["id"] ?: it.hashCode().toString() }) { item ->
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier
                                    .clickable {
                                        query = item["source_text"].orEmpty()
                                        targetLang = item["target_language"] ?: "bn"
                                        activeTab = "dictionary"
                                    }
                                    .padding(SanzarSpace.S4.dp),
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
