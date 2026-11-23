package com.sanzar.app.ui.screens

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.core.SanzarStrings
import com.sanzar.app.data.model.LeaderEntry
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.components.*
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgressScreen(
    state: SanzarUiState,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onStartFocus: () -> Unit,
    onStopFocus: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val p = state.progress

    LaunchedEffect(Unit) { onRefresh() }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("progress")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Rounded.Refresh, contentDescription = s("retry"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        val maxDay = p.series.maxOfOrNull { it.second }?.coerceAtLeast(1) ?: 1
        val maxSub = p.bySubject.maxOfOrNull { it.second }?.coerceAtLeast(1) ?: 1

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(SanzarSpace.S4.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
        ) {
            item { DailyGoalSummaryCard(progress = p) }

            item {
                FocusTimerCard(onStartFocus = onStartFocus, onStopFocus = onStopFocus)
            }

            if (p.series.isNotEmpty()) {
                item {
                    SectionTitle(title = s("last7"), modifier = Modifier.padding(horizontal = 0.dp))
                    SanzarCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(150.dp)
                                .padding(SanzarSpace.S4.dp),
                            verticalAlignment = Alignment.Bottom
                        ) {
                            p.series.forEach { (day, sec) ->
                                val ratio = sec.toFloat() / maxDay.toFloat()
                                Column(
                                    modifier = Modifier.weight(1f),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Bottom
                                ) {
                                    Text("${(sec / 60)}", style = MaterialTheme.typography.labelSmall)
                                    Spacer(Modifier.height(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(0.55f)
                                            .height((80f * ratio + 4f).dp)
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(SanzarColors.BrandGradient)
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = if (day.length >= 10) day.substring(8) else day,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.muted
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (p.bySubject.isNotEmpty()) {
                item {
                    SectionTitle(title = s("bySubject"), modifier = Modifier.padding(horizontal = 0.dp))
                    SanzarCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(SanzarSpace.S4.dp),
                            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                        ) {
                            p.bySubject.forEach { (subId, sec) ->
                                val subName = state.catalog?.subject(subId)?.name(s.lang) ?: subId
                                val subColor = SanzarColors.forSubject(subId)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = subName,
                                        modifier = Modifier.width(105.dp),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    SanzarProgressBar(
                                        progress = sec.toFloat() / maxSub.toFloat(),
                                        color = subColor,
                                        trackColor = subColor.copy(alpha = 0.14f),
                                        modifier = Modifier.weight(1f)
                                    )
                                    Spacer(Modifier.width(SanzarSpace.S2.dp))
                                    Text(
                                        text = s("minutes", mapOf("n" to (sec / 60))),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (p.achievements.isNotEmpty()) {
                item {
                    SectionTitle(title = s("achievements"), modifier = Modifier.padding(horizontal = 0.dp))
                }
                val rows = p.achievements.chunked(2)
                items(rows) { pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                    ) {
                        pair.forEach { ach ->
                            val unlocked = ach.unlockedAt != null
                            SanzarCard(modifier = Modifier.weight(1f)) {
                                Row(
                                    modifier = Modifier.padding(SanzarSpace.S3.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = if (unlocked) Icons.Rounded.EmojiEvents else Icons.Rounded.Lock,
                                        contentDescription = null,
                                        tint = if (unlocked) SanzarColors.Gold else palette.muted
                                    )
                                    Spacer(Modifier.width(SanzarSpace.S2.dp))
                                    Column {
                                        Text(
                                            text = ach.title,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            color = if (unlocked) palette.text else palette.muted
                                        )
                                        Text(
                                            text = ach.desc,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = palette.muted,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
fun FocusTimerCard(
    onStartFocus: () -> Unit,
    onStopFocus: () -> Unit
) {
    val s = LocalStrings.current
    var minutes by remember { mutableIntStateOf(25) }
    var running by remember { mutableStateOf(false) }
    var leftSec by remember { mutableIntStateOf(0) }

    LaunchedEffect(running) {
        if (!running) return@LaunchedEffect
        while (running && leftSec > 0) {
            delay(1000L)
            leftSec--
        }
        if (running && leftSec <= 0) {
            running = false
            onStopFocus()
        }
    }

    SanzarCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(SanzarSpace.S4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Rounded.Timer, contentDescription = null, modifier = Modifier.size(32.dp))
            Spacer(Modifier.width(SanzarSpace.S3.dp))
            if (running) {
                Text(
                    text = SanzarStrings.formatMmSs(leftSec),
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold),
                    modifier = Modifier.weight(1f)
                )
                OutlinedButton(
                    onClick = {
                        running = false
                        leftSec = 0
                        onStopFocus()
                    },
                    shape = RoundedCornerShape(SanzarRadius.MD.dp)
                ) {
                    Text(s("focusStop"))
                }
            } else {
                Column(modifier = Modifier.weight(1f)) {
                    Text(s("focus"), fontWeight = FontWeight.Bold)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf(15, 25, 45).forEach { m ->
                            FilterChip(
                                selected = minutes == m,
                                onClick = { minutes = m },
                                label = { Text("$m") }
                            )
                        }
                    }
                }
                Button(
                    onClick = {
                        leftSec = minutes * 60
                        running = true
                        onStartFocus()
                    },
                    shape = RoundedCornerShape(SanzarRadius.MD.dp)
                ) {
                    Text(s("focusStart", mapOf("n" to minutes)))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaderboardScreen(
    onBack: () -> Unit,
    onFetchLeaderboard: suspend (String, Boolean) -> Result<Pair<List<LeaderEntry>, LeaderEntry?>>
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()

    var period by remember { mutableStateOf("weekly") }
    var myClassOnly by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var entries by remember { mutableStateOf<List<LeaderEntry>>(emptyList()) }
    var me by remember { mutableStateOf<LeaderEntry?>(null) }

    fun load() {
        loading = true
        error = null
        scope.launch {
            onFetchLeaderboard(period, myClassOnly).fold(
                onSuccess = { (list, myEntry) ->
                    entries = list
                    me = myEntry
                    loading = false
                },
                onFailure = {
                    loading = false
                    error = s("err.generic")
                }
            )
        }
    }

    LaunchedEffect(period, myClassOnly) { load() }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("leaderboard")) },
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
        ) {
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = SanzarSpace.S4.dp)
            ) {
                val periods = listOf("weekly" to "weekly", "monthly" to "monthly", "all" to "allTime")
                periods.forEachIndexed { idx, (code, labelKey) ->
                    SegmentedButton(
                        selected = period == code,
                        onClick = { period = code },
                        shape = SegmentedButtonDefaults.itemShape(index = idx, count = periods.size)
                    ) {
                        Text(s(labelKey), maxLines = 1)
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(s("myClassOnly"), modifier = Modifier.weight(1f))
                Switch(checked = myClassOnly, onCheckedChange = { myClassOnly = it })
            }

            when {
                error != null -> ErrorRetryView(message = error!!, onRetry = { load() })
                loading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                entries.isEmpty() -> EmptyStateView(message = s("noRanking"), icon = Icons.Rounded.Leaderboard)
                else -> LazyColumn(
                    contentPadding = PaddingValues(SanzarSpace.S4.dp),
                    verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
                ) {
                    if (me != null) {
                        item {
                            Text(
                                text = s("yourRank", mapOf("n" to me!!.rank)),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(bottom = 4.dp)
                            )
                        }
                    }
                    items(entries, key = { "${it.rank}_${it.name}" }) { entry ->
                        val badgeColor = when (entry.rank) {
                            1 -> SanzarColors.Gold
                            2 -> Color(0xFFB9C2D9)
                            3 -> Color(0xFFE08A4A)
                            else -> palette.surface2
                        }
                        SanzarCard(
                            containerColor = if (entry.me) palette.primarySoft else palette.surface,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(CircleShape)
                                        .background(badgeColor),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("${entry.rank}", fontWeight = FontWeight.ExtraBold)
                                }
                                Spacer(Modifier.width(SanzarSpace.S3.dp))
                                Text(entry.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text(s("xpTotal", mapOf("n" to entry.xp)), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}
