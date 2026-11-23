package com.sanzar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.core.SanzarStrings
import com.sanzar.app.data.model.AttemptResult
import com.sanzar.app.data.model.ExamSession
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
fun ExamsScreen(
    state: SanzarUiState,
    onBack: (() -> Unit)? = null,
    onLoadHistory: () -> Unit,
    onStartExam: (String) -> Unit,
    onOpenResult: (String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    var tabIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) { onLoadHistory() }

    val levelId = state.profile?.levelId ?: state.selectedLevelId
    val models = state.catalog?.modelTestsFor(levelId).orEmpty()

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            Column {
                TopAppBar(
                    title = { Text(s("exams")) },
                    navigationIcon = {
                        if (onBack != null) {
                            IconButton(onClick = onBack) {
                                Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
                )
                TabRow(selectedTabIndex = tabIndex, containerColor = palette.bg) {
                    Tab(selected = tabIndex == 0, onClick = { tabIndex = 0 }, text = { Text(s("modelTests")) })
                    Tab(selected = tabIndex == 1, onClick = { tabIndex = 1 }, text = { Text(s("history")) })
                }
            }
        }
    ) { padding ->
        if (tabIndex == 0) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(SanzarSpace.S4.dp),
                verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
            ) {
                if (models.isEmpty()) {
                    item { EmptyStateView(message = s("noBooks")) }
                } else {
                    items(models, key = { it.id }) { exam ->
                        val subjectId = state.catalog?.book(exam.bookId.orEmpty())?.subjectId ?: "others"
                        val subColor = SanzarColors.forSubject(subjectId)
                        SanzarCard(
                            onClick = { onStartExam(exam.id) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(CircleShape)
                                        .background(subColor.copy(alpha = 0.15f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Rounded.Assignment, contentDescription = null, tint = subColor)
                                }
                                Spacer(Modifier.width(SanzarSpace.S3.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(exam.title, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = "${s("questions", mapOf("n" to exam.questionCount))} · ${s("minutes", mapOf("n" to ((exam.durationSec + 59) / 60)))}",
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
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(SanzarSpace.S4.dp),
                verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
            ) {
                if (state.historyLoading && state.attemptHistory.isEmpty()) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(SanzarSpace.S6.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                } else if (state.attemptHistory.isEmpty()) {
                    item { EmptyStateView(message = s("noAttempts"), icon = Icons.Rounded.Assignment) }
                } else {
                    items(state.attemptHistory, key = { it.id }) { attempt ->
                        SanzarCard(
                            onClick = if (attempt.status == "legacy") null else { { onOpenResult(attempt.id) } },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(attempt.title.ifBlank { attempt.examId }, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        text = s.timeAgo(attempt.startedAt),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.muted
                                    )
                                }
                                Text(
                                    text = if (attempt.total == null) "—" else s("score", mapOf("s" to (attempt.score ?: 0), "n" to attempt.total)),
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamRunnerScreen(
    examId: String,
    onStartExam: suspend (String) -> Result<ExamSession>,
    onSubmitExam: suspend (String, Map<String, Int>) -> Result<AttemptResult>,
    onStartStudy: () -> Unit,
    onStopStudy: () -> Unit,
    onFinished: (AttemptResult) -> Unit,
    onBack: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()

    var session by remember { mutableStateOf<ExamSession?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var index by remember { mutableIntStateOf(0) }
    var secondsLeft by remember { mutableIntStateOf(0) }
    var submitting by remember { mutableStateOf(false) }
    var confirmDialog by remember { mutableStateOf(false) }
    val answers = remember { mutableStateMapOf<String, Int>() }

    DisposableEffect(examId) {
        onStartStudy()
        onDispose { onStopStudy() }
    }

    fun loadSession() {
        error = null
        scope.launch {
            onStartExam(examId).fold(
                onSuccess = { sess ->
                    session = sess
                    val skew = sess.serverTime - System.currentTimeMillis()
                    val left = ((sess.endsAt - (System.currentTimeMillis() + skew)) / 1000L).toInt().coerceAtLeast(0)
                    secondsLeft = left
                },
                onFailure = { e ->
                    error = e.message ?: s("err.generic")
                }
            )
        }
    }

    LaunchedEffect(examId) { loadSession() }

    fun submitNow() {
        val sess = session ?: return
        if (submitting) return
        submitting = true
        scope.launch {
            onSubmitExam(sess.attemptId, answers.toMap()).fold(
                onSuccess = { res -> onFinished(res) },
                onFailure = {
                    submitting = false
                    error = s("err.generic")
                }
            )
        }
    }

    LaunchedEffect(session?.attemptId) {
        val sess = session ?: return@LaunchedEffect
        val skew = sess.serverTime - System.currentTimeMillis()
        while (true) {
            delay(1000L)
            val left = ((sess.endsAt - (System.currentTimeMillis() + skew)) / 1000L).toInt().coerceAtLeast(0)
            secondsLeft = left
            if (left <= 0 && !submitting) {
                submitNow()
                break
            }
        }
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(session?.title ?: s("exams")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    if (session != null) {
                        SanzarPill(
                            text = SanzarStrings.formatMmSs(secondsLeft),
                            icon = Icons.Rounded.Timer,
                            modifier = Modifier.padding(end = 12.dp)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        if (error != null) {
            ErrorRetryView(message = error!!, onRetry = { loadSession() }, modifier = Modifier.padding(padding))
            return@Scaffold
        }
        val sess = session
        if (sess == null) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        if (sess.questions.isEmpty()) {
            EmptyStateView(message = s("noAttempts"), modifier = Modifier.padding(padding))
            return@Scaffold
        }

        val q = sess.questions[index]

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            LinearProgressIndicator(
                progress = { (index + 1).toFloat() / sess.questions.size.toFloat() },
                modifier = Modifier.fillMaxWidth()
            )
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(SanzarSpace.S4.dp),
                verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
            ) {
                item {
                    Text(
                        text = "${index + 1} / ${sess.questions.size}",
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.muted
                    )
                    Spacer(Modifier.height(SanzarSpace.S2.dp))
                    Text(
                        text = q.text,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                    )
                    Spacer(Modifier.height(SanzarSpace.S3.dp))
                }

                itemsIndexed(q.options) { optIdx, optText ->
                    val selected = answers[q.id] == optIdx
                    SanzarCard(
                        onClick = { answers[q.id] = optIdx },
                        containerColor = if (selected) palette.primarySoft else palette.surface,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { answers[q.id] = optIdx }
                                .padding(horizontal = SanzarSpace.S3.dp, vertical = SanzarSpace.S3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = selected, onClick = { answers[q.id] = optIdx })
                            Spacer(Modifier.width(SanzarSpace.S2.dp))
                            Text(optText, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(SanzarSpace.S4.dp),
                horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
            ) {
                if (index > 0) {
                    OutlinedButton(
                        onClick = { index-- },
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(SanzarRadius.MD.dp)
                    ) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                }
                Button(
                    onClick = {
                        if (index < sess.questions.lastIndex) index++
                        else confirmDialog = true
                    },
                    enabled = !submitting,
                    modifier = Modifier
                        .weight(2f)
                        .height(50.dp),
                    shape = RoundedCornerShape(SanzarRadius.MD.dp)
                ) {
                    Text(s(if (index < sess.questions.lastIndex) "next" else "submit"))
                }
            }
        }
    }

    if (confirmDialog && session != null) {
        AlertDialog(
            onDismissRequest = { confirmDialog = false },
            text = {
                Text(
                    s(
                        "submitConfirm",
                        mapOf("a" to answers.size, "n" to session!!.questions.size)
                    )
                )
            },
            confirmButton = {
                Button(onClick = {
                    confirmDialog = false
                    submitNow()
                }) {
                    Text(s("submit"))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDialog = false }) {
                    Text(s("cancel"))
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamResultScreen(
    attemptId: String,
    initialResult: AttemptResult?,
    onFetchResult: suspend (String) -> Result<AttemptResult>,
    onBack: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    var result by remember(attemptId) { mutableStateOf(initialResult) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(attemptId) {
        if (result == null) {
            onFetchResult(attemptId).fold(
                onSuccess = { result = it },
                onFailure = { error = s("err.generic") }
            )
        }
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("result")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        if (error != null) {
            ErrorRetryView(message = error!!, onRetry = { error = null }, modifier = Modifier.padding(padding))
            return@Scaffold
        }
        val r = result
        if (r == null) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        val a = r.attempt
        val good = r.passed && a.status == "graded"

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(SanzarSpace.S4.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
        ) {
            item {
                GradientHeroCard {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(a.title, color = Color.White.copy(alpha = 0.78f), textAlign = TextAlign.Center)
                        Spacer(Modifier.height(SanzarSpace.S2.dp))
                        Text(
                            text = s("score", mapOf("s" to (a.score ?: 0), "n" to (a.total ?: 0))),
                            color = Color.White,
                            style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.ExtraBold)
                        )
                        Text(
                            text = if (a.status == "expired") s("expired") else s(if (good) "passed" else "notPassed"),
                            color = if (good) Color(0xFF7CF0B5) else Color.White,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (r.xpAwarded > 0) {
                            Spacer(Modifier.height(SanzarSpace.S2.dp))
                            SanzarPill(
                                text = s("xpEarned", mapOf("n" to r.xpAwarded)),
                                containerColor = Color.White.copy(alpha = 0.18f),
                                contentColor = Color.White
                            )
                        }
                    }
                }
            }

            itemsIndexed(r.review) { i, q ->
                val correct = q.chosen != null && q.chosen == q.answer
                SanzarCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
                        Row(verticalAlignment = Alignment.Top) {
                            Icon(
                                imageVector = if (correct) Icons.Rounded.CheckCircle else Icons.Rounded.Cancel,
                                contentDescription = null,
                                tint = if (correct) SanzarColors.Success else SanzarColors.Danger
                            )
                            Spacer(Modifier.width(SanzarSpace.S2.dp))
                            Text("${i + 1}. ${q.text}", fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(Modifier.height(SanzarSpace.S2.dp))
                        val chosenLabel = q.chosen?.let { q.options.getOrNull(it) } ?: s("notAnswered")
                        Text("${s("yourAnswer")}: $chosenLabel", style = MaterialTheme.typography.bodyMedium)
                        if (!correct && q.answer != null) {
                            val ansText = q.options.getOrNull(q.answer).orEmpty()
                            Text(
                                text = "${s("correctAnswer")}: $ansText",
                                color = SanzarColors.Success,
                                fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        if (q.explanation.isNotEmpty()) {
                            Spacer(Modifier.height(6.dp))
                            Text(q.explanation, style = MaterialTheme.typography.bodySmall, color = palette.muted)
                        }
                    }
                }
            }
        }
    }
}
