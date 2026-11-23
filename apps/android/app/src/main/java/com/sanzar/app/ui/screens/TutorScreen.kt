package com.sanzar.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.TutorChatMessage
import com.sanzar.app.ui.components.BrandMark
import com.sanzar.app.ui.components.SanzarCard
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TutorScreen(
    state: SanzarUiState,
    onBack: (() -> Unit)? = null,
    onAsk: (String) -> Unit,
    onOpenChapter: (String, String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(state.tutorMessages.size) {
        if (state.tutorMessages.isNotEmpty()) {
            listState.animateScrollToItem(state.tutorMessages.size)
        }
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BrandMark(size = 30.dp)
                        Spacer(Modifier.width(SanzarSpace.S2.dp))
                        Text(s("tutor"))
                    }
                },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                        }
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
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(SanzarSpace.S4.dp),
                verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
            ) {
                item {
                    SanzarCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = s("tutorIntro"),
                            modifier = Modifier.padding(SanzarSpace.S4.dp),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                items(state.tutorMessages, key = { it.id }) { msg ->
                    TutorBubble(
                        msg = msg,
                        onMore = { onAsk(s("tutorMore")) },
                        onOpenChapter = onOpenChapter
                    )
                }

                if (state.tutorBusy) {
                    item {
                        Box(modifier = Modifier.padding(SanzarSpace.S2.dp)) {
                            CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.4.dp)
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = SanzarSpace.S3.dp, vertical = SanzarSpace.S2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text(s("tutorHint")) },
                    maxLines = 4,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = {
                        if (input.isNotBlank() && !state.tutorBusy) {
                            onAsk(input)
                            input = ""
                        }
                    }),
                    shape = RoundedCornerShape(SanzarRadius.SM.dp),
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(SanzarSpace.S2.dp))
                FilledIconButton(
                    onClick = {
                        if (input.isNotBlank() && !state.tutorBusy) {
                            onAsk(input)
                            input = ""
                        }
                    },
                    enabled = !state.tutorBusy
                ) {
                    Icon(Icons.Rounded.Send, contentDescription = null)
                }
            }
        }
    }
}

@Composable
private fun TutorBubble(
    msg: TutorChatMessage,
    onMore: () -> Unit,
    onOpenChapter: (String, String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val shape = RoundedCornerShape(SanzarRadius.MD.dp)

    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = if (msg.fromMe) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        if (msg.fromMe) {
            Box(
                modifier = Modifier
                    .widthIn(max = 320.dp)
                    .clip(shape)
                    .background(SanzarColors.BrandGradient)
                    .padding(SanzarSpace.S3.dp)
            ) {
                Text(text = msg.text, color = Color.White)
            }
        } else {
            Surface(
                modifier = Modifier.widthIn(max = 340.dp),
                shape = shape,
                color = palette.surface,
                border = BorderStroke(1.dp, palette.border)
            ) {
                Column(modifier = Modifier.padding(SanzarSpace.S3.dp)) {
                    val ans = msg.answer
                    if (!ans?.heading.isNullOrBlank()) {
                        Text(ans!!.heading!!, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                    }
                    Text(msg.text, style = MaterialTheme.typography.bodyMedium)
                    val ref = ans?.reference
                    if (ref != null) {
                        Spacer(Modifier.height(SanzarSpace.S2.dp))
                        val chapText = s("chapter", mapOf("n" to ref.chapterNumber))
                        val pageText = ref.page?.let { " (${s("page", mapOf("n" to it))})" } ?: ""
                        Text(
                            text = "${s("reference")}: ${ref.bookTitle} – $chapText: ${ref.chapterTitle}$pageText",
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.muted
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { onOpenChapter(ref.bookId, ref.chapterId) }) {
                                Text(s("openChapter"))
                            }
                            TextButton(onClick = onMore) {
                                Text(s("tutorMore"))
                            }
                        }
                    }
                }
            }
        }
    }
}
