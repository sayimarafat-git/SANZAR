package com.sanzar.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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

private val OFFLINE_STARTER_WORDS = listOf(
    DictionaryEntry("s-zh-1", "zh", "你好", "nǐ hǎo", "greeting", "Hello; Hi", "হ্যালো; নমস্কার", "打招呼用语", "你好，欢迎来到 SANZAR！", "Hello, welcome to SANZAR!", "HSK 1"),
    DictionaryEntry("s-zh-2", "zh", "谢谢", "xiè xie", "verb", "Thank you", "ধন্যবাদ", "表示感谢", "非常谢谢你的帮助！", "Thank you very much for your help!", "HSK 1"),
    DictionaryEntry("s-zh-3", "zh", "学习", "xué xí", "verb / noun", "To study; learn", "পড়াশোনা করা; শেখা", "获取知识或技能", "我每天学习中文。", "I study Chinese every day.", "HSK 1"),
    DictionaryEntry("s-zh-4", "zh", "老师", "lǎo shī", "noun", "Teacher", "শিক্ষক", "教导学生的人", "李老师教我们中文。", "Teacher Li teaches us Chinese.", "HSK 1"),
    DictionaryEntry("s-zh-5", "zh", "考试", "kǎo shì", "noun / verb", "Exam; test", "পরীক্ষা", "测验", "下周一有汉语考试。", "Next Monday there is a Chinese exam.", "HSK 2"),
    DictionaryEntry("s-en-1", "en", "Comprehend", "/ˌkɒm.prɪˈhend/", "verb", "Understand fully", "সম্পূর্ণভাবে বুঝতে পারা", "理解，领悟", "Notes help students comprehend grammar.", "", "Core"),
    DictionaryEntry("s-en-2", "en", "Fluent", "/ˈfluː.ənt/", "adj", "Speak easily & accurately", "সাবলীল", "流利的", "Daily practice makes you fluent.", "", "Core"),
    DictionaryEntry("s-en-3", "en", "Consistent", "/kənˈsɪs.tənt/", "adj", "Steady over time", "ধারাবাহিক", "一贯的", "Consistent study brings results.", "", "Core")
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DictionaryScreen(
    state: SanzarUiState,
    onSearch: (String, String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    var query by remember { mutableStateOf("") }
    var langFilter by remember { mutableStateOf("all") }
    var savedIds by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(query, langFilter) {
        delay(250)
        if (state.firebaseUser != null && langFilter != "saved") {
            onSearch(query, langFilter)
        }
    }

    val merged = remember(state.dictionaryEntries, query, langFilter, savedIds) {
        val byKey = linkedMapOf<String, DictionaryEntry>()
        OFFLINE_STARTER_WORDS.forEach { byKey["${it.language}:${it.word.lowercase()}"] = it }
        state.dictionaryEntries.forEach { byKey["${it.language}:${it.word.lowercase()}"] = it }
        val q = query.trim().lowercase()
        byKey.values.filter { e ->
            (langFilter != "saved" || savedIds.contains(e.id)) &&
                ((langFilter != "zh" && langFilter != "en") || e.language == langFilter) &&
                (q.isEmpty() || listOf(e.word, e.phonetic, e.meaningEn, e.meaningBn, e.meaningZh)
                    .any { it.lowercase().contains(q) })
        }
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
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(s("searchDictionary")) },
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

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)) {
                    listOf(
                        "all" to s("allWords"),
                        "zh" to "中文",
                        "en" to "English",
                        "saved" to s("savedWords")
                    ).forEach { (key, label) ->
                        FilterChip(
                            selected = langFilter == key,
                            onClick = { langFilter = key },
                            label = { Text(label) }
                        )
                    }
                }
            }

            if (merged.isEmpty()) {
                item { EmptyStateView(message = s("noWordsFound"), icon = Icons.Rounded.MenuBook) }
            } else {
                items(merged, key = { it.id }) { entry ->
                    val saved = savedIds.contains(entry.id)
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
                                }
                                if (entry.hskLevel.isNotEmpty()) {
                                    SanzarPill(text = entry.hskLevel)
                                    Spacer(Modifier.width(4.dp))
                                }
                                IconButton(
                                    onClick = {
                                        savedIds = if (saved) savedIds - entry.id else savedIds + entry.id
                                    }
                                ) {
                                    Icon(
                                        imageVector = if (saved) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                                        contentDescription = s("savedWords"),
                                        tint = if (saved) palette.primary else palette.muted
                                    )
                                }
                            }
                            if (entry.meaningEn.isNotEmpty()) {
                                Spacer(Modifier.height(4.dp))
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
            }
        }
    }
}
