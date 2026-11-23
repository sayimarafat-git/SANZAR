package com.sanzar.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.sanzar.app.data.model.Comment
import com.sanzar.app.data.model.Post
import com.sanzar.app.data.model.PostAttachment
import com.sanzar.app.data.model.PublicProfile
import com.sanzar.app.ui.SanzarUiState
import com.sanzar.app.ui.components.EmptyStateView
import com.sanzar.app.ui.components.ErrorRetryView
import com.sanzar.app.ui.components.SanzarCard
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityScreen(
    state: SanzarUiState,
    onLoadFeed: (Boolean, String?, String) -> Unit,
    onCreatePost: suspend (String, String, String?, List<String>?, List<PostAttachment>) -> Boolean,
    onToggleLike: (Post) -> Unit,
    onVotePoll: (Post, Int) -> Unit,
    onDeletePost: (String) -> Unit,
    onBlockUser: (String) -> Unit,
    onReportPost: (String, String) -> Unit,
    onOpenPost: (Post) -> Unit,
    onOpenUser: (String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    var showCompose by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf(state.feedQuery) }

    LaunchedEffect(Unit) {
        if (state.feedPosts.isEmpty() && !state.feedLoading) {
            onLoadFeed(true, state.feedCategory, searchQuery)
        }
    }

    LaunchedEffect(searchQuery) {
        if (searchQuery == state.feedQuery) return@LaunchedEffect
        delay(280)
        onLoadFeed(true, state.feedCategory, searchQuery)
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("community")) },
                actions = {
                    TextButton(onClick = { showCompose = true }) {
                        Icon(Icons.Rounded.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(s("post"), fontWeight = FontWeight.Bold)
                    }
                    IconButton(onClick = { onLoadFeed(true, state.feedCategory, searchQuery) }) {
                        Icon(Icons.Rounded.Refresh, contentDescription = s("retry"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.bg)
            )
        }
    ) { padding ->
        val filteredPosts = remember(state.feedPosts, searchQuery) {
            val q = searchQuery.trim().lowercase()
            if (q.isEmpty()) state.feedPosts
            else state.feedPosts.filter {
                it.text.lowercase().contains(q) ||
                    it.authorName.lowercase().contains(q) ||
                    (it.poll?.question?.lowercase()?.contains(q) == true)
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(start = SanzarSpace.S4.dp, end = SanzarSpace.S4.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
        ) {
            item {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text(s("searchCommunity")) },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
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
                        null to s("feed"),
                        "general" to s("general"),
                        "research" to s("research")
                    ).forEach { (cat, label) ->
                        FilterChip(
                            selected = state.feedCategory == cat,
                            onClick = { onLoadFeed(true, cat, searchQuery) },
                            label = { Text(label) }
                        )
                    }
                }
            }

            if (state.feedLoading && filteredPosts.isEmpty()) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(SanzarSpace.S6.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            } else if (state.feedError != null && filteredPosts.isEmpty()) {
                item {
                    ErrorRetryView(
                        message = s("err.network"),
                        onRetry = { onLoadFeed(true, state.feedCategory, searchQuery) }
                    )
                }
            } else if (filteredPosts.isEmpty()) {
                item { EmptyStateView(message = s("noPosts"), icon = Icons.Rounded.Forum) }
            } else {
                items(filteredPosts, key = { it.id }) { post ->
                    PostCard(
                        post = post,
                        onToggleLike = { onToggleLike(post) },
                        onVotePoll = { idx -> onVotePoll(post, idx) },
                        onDelete = { onDeletePost(post.id) },
                        onBlock = { onBlockUser(post.authorUid) },
                        onReport = { reason -> onReportPost(post.id, reason) },
                        onOpenComments = { onOpenPost(post) },
                        onOpenAuthor = { if (!post.mine) onOpenUser(post.authorUid) }
                    )
                }
                if (state.feedNextCursor != null && !state.feedLoading) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            TextButton(onClick = { onLoadFeed(false, state.feedCategory, searchQuery) }) {
                                Text(s("loadMore"))
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCompose) {
        ComposePostSheet(
            onDismiss = { showCompose = false },
            onPublish = onCreatePost
        )
    }
}

@Composable
fun PostCard(
    post: Post,
    showCommentsButton: Boolean = true,
    onToggleLike: () -> Unit,
    onVotePoll: (Int) -> Unit,
    onDelete: () -> Unit,
    onBlock: () -> Unit,
    onReport: (String) -> Unit,
    onOpenComments: () -> Unit,
    onOpenAuthor: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val context = LocalContext.current
    var menuOpen by remember { mutableStateOf(false) }
    var reportDialogOpen by remember { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("") }

    SanzarCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(SanzarSpace.S4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(palette.primarySoft)
                        .clickable(enabled = !post.mine, onClick = onOpenAuthor),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = post.authorName.firstOrNull()?.uppercase() ?: "?",
                        fontWeight = FontWeight.Bold,
                        color = palette.primary
                    )
                }
                Spacer(Modifier.width(SanzarSpace.S2.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(post.authorName, fontWeight = FontWeight.Bold)
                    val meta = buildList {
                        add(s.timeAgo(post.createdAt))
                        if (post.category == "research") add(s("research"))
                    }.joinToString(" · ")
                    Text(meta, style = MaterialTheme.typography.bodySmall, color = palette.muted)
                }
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Rounded.MoreVert, contentDescription = null)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (post.mine) {
                            DropdownMenuItem(
                                text = { Text(s("deletePost")) },
                                onClick = {
                                    menuOpen = false
                                    onDelete()
                                }
                            )
                        } else {
                            DropdownMenuItem(
                                text = { Text(s("report")) },
                                onClick = {
                                    menuOpen = false
                                    reportDialogOpen = true
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(s("block")) },
                                onClick = {
                                    menuOpen = false
                                    onBlock()
                                }
                            )
                        }
                    }
                }
            }

            if (post.text.isNotEmpty()) {
                Spacer(Modifier.height(SanzarSpace.S3.dp))
                Text(post.text, style = MaterialTheme.typography.bodyLarge)
            }

            post.attachments.forEach { att ->
                val url = att.url ?: return@forEach
                Spacer(Modifier.height(SanzarSpace.S2.dp))
                SanzarCard(
                    onClick = {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    },
                    containerColor = palette.surface2,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(SanzarSpace.S3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Rounded.Link, contentDescription = null, tint = palette.primary)
                        Spacer(Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(att.name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
                            Text(att.mime, style = MaterialTheme.typography.labelSmall, color = palette.muted)
                        }
                        Icon(Icons.Rounded.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                }
            }

            if (post.poll != null) {
                Spacer(Modifier.height(SanzarSpace.S3.dp))
                Text(post.poll.question, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(SanzarSpace.S2.dp))
                val total = post.poll.total
                post.poll.options.forEachIndexed { idx, opt ->
                    val pct = if (total == 0) 0 else (100 * opt.votes / total)
                    val chosen = post.poll.myVote == idx
                    Surface(
                        onClick = { onVotePoll(idx) },
                        shape = RoundedCornerShape(SanzarRadius.SM.dp),
                        border = BorderStroke(1.dp, if (chosen) palette.primary else palette.border),
                        color = if (chosen) palette.primarySoft else palette.surface,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 6.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(opt.text, modifier = Modifier.weight(1f))
                            if (total > 0) Text("$pct%", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            Spacer(Modifier.height(SanzarSpace.S2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onToggleLike) {
                    Icon(
                        imageVector = if (post.likedByMe) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        contentDescription = null,
                        tint = if (post.likedByMe) SanzarColors.Danger else palette.muted
                    )
                    Spacer(Modifier.width(4.dp))
                    Text("${post.likeCount}")
                }
                TextButton(onClick = onOpenComments, enabled = showCommentsButton) {
                    Icon(Icons.Rounded.ChatBubbleOutline, contentDescription = null, tint = palette.muted)
                    Spacer(Modifier.width(4.dp))
                    Text("${post.commentCount}")
                }
            }
        }
    }

    if (reportDialogOpen) {
        AlertDialog(
            onDismissRequest = { reportDialogOpen = false },
            title = { Text(s("report")) },
            text = {
                OutlinedTextField(
                    value = reportReason,
                    onValueChange = { reportReason = it },
                    placeholder = { Text(s("reportReason")) },
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        val r = reportReason.trim()
                        if (r.length >= 3) {
                            reportDialogOpen = false
                            onReport(r)
                        }
                    }
                ) { Text(s("report")) }
            },
            dismissButton = {
                TextButton(onClick = { reportDialogOpen = false }) { Text(s("cancel")) }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposePostSheet(
    onDismiss: () -> Unit,
    onPublish: suspend (String, String, String?, List<String>?, List<PostAttachment>) -> Boolean
) {
    val s = LocalStrings.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var addPoll by remember { mutableStateOf(false) }
    var isResearch by remember { mutableStateOf(false) }
    var pollQuestion by remember { mutableStateOf("") }
    val pollOptions = remember { mutableStateListOf("", "") }
    var linkInput by remember { mutableStateOf("") }
    val attachments = remember { mutableStateListOf<PostAttachment>() }
    var busy by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SanzarSpace.S4.dp)
                .padding(bottom = SanzarSpace.S6.dp),
            verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = { Text(s("whatsOnMind")) },
                minLines = 3,
                maxLines = 6,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = addPoll, onClick = { addPoll = !addPoll }, label = { Text(s("addPoll")) })
                FilterChip(selected = isResearch, onClick = { isResearch = !isResearch }, label = { Text(s("research")) })
            }
            OutlinedTextField(
                value = linkInput,
                onValueChange = { linkInput = it },
                label = { Text(s("attachmentLink")) },
                singleLine = true,
                trailingIcon = {
                    IconButton(onClick = {
                        val trimmed = linkInput.trim()
                        val uri = runCatching { Uri.parse(trimmed) }.getOrNull()
                        if (uri != null && uri.scheme == "https" && !uri.host.isNullOrBlank()) {
                            attachments.add(PostAttachment(url = trimmed, name = uri.host ?: "Link", mime = "text/uri-list"))
                            linkInput = ""
                        }
                    }) {
                        Icon(Icons.Rounded.Add, contentDescription = s("attachLink"))
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )
            if (attachments.isNotEmpty()) {
                attachments.forEachIndexed { idx, att ->
                    InputChip(
                        selected = false,
                        onClick = {},
                        label = { Text(att.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        trailingIcon = {
                            Icon(
                                Icons.Rounded.Close,
                                contentDescription = s("removeAttachment"),
                                modifier = Modifier.clickable { attachments.removeAt(idx) }
                            )
                        }
                    )
                }
            }
            if (addPoll) {
                OutlinedTextField(
                    value = pollQuestion,
                    onValueChange = { pollQuestion = it },
                    label = { Text(s("pollQuestion")) },
                    modifier = Modifier.fillMaxWidth()
                )
                pollOptions.forEachIndexed { idx, value ->
                    OutlinedTextField(
                        value = value,
                        onValueChange = { pollOptions[idx] = it },
                        label = { Text(s("option", mapOf("n" to (idx + 1)))) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                if (pollOptions.size < 6) {
                    TextButton(onClick = { pollOptions.add("") }) {
                        Icon(Icons.Rounded.Add, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text(s("option", mapOf("n" to (pollOptions.size + 1))))
                    }
                }
            }
            Button(
                onClick = {
                    val opts = pollOptions.map { it.trim() }.filter { it.isNotEmpty() }
                    if (text.isBlank() && !addPoll && attachments.isEmpty()) return@Button
                    if (addPoll && (pollQuestion.isBlank() || opts.size < 2)) return@Button
                    busy = true
                    scope.launch {
                        val ok = onPublish(
                            text.trim(),
                            if (isResearch) "research" else "general",
                            if (addPoll) pollQuestion.trim() else null,
                            if (addPoll) opts else null,
                            attachments.toList()
                        )
                        busy = false
                        if (ok) onDismiss()
                    }
                },
                enabled = !busy,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(SanzarRadius.MD.dp)
            ) {
                Text(s("post"))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostDetailScreen(
    post: Post,
    onBack: () -> Unit,
    onFetchComments: suspend (String) -> Result<List<Comment>>,
    onAddComment: suspend (String, String) -> Result<Comment>,
    onDeleteComment: suspend (String) -> Boolean,
    onToggleLike: (Post) -> Unit,
    onVotePoll: (Post, Int) -> Unit,
    onDeletePost: (String) -> Unit,
    onReport: (String, String, String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()
    var comments by remember { mutableStateOf<List<Comment>?>(null) }
    var commentText by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(post.id) {
        onFetchComments(post.id).onSuccess { comments = it }
    }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text(s("comments")) },
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
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(SanzarSpace.S4.dp),
                verticalArrangement = Arrangement.spacedBy(SanzarSpace.S2.dp)
            ) {
                item {
                    PostCard(
                        post = post,
                        showCommentsButton = false,
                        onToggleLike = { onToggleLike(post) },
                        onVotePoll = { onVotePoll(post, it) },
                        onDelete = {
                            onDeletePost(post.id)
                            onBack()
                        },
                        onBlock = {},
                        onReport = { reason -> onReport("post", post.id, reason) },
                        onOpenComments = {},
                        onOpenAuthor = {}
                    )
                }
                if (comments == null) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(SanzarSpace.S4.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                } else {
                    items(comments!!, key = { it.id }) { c ->
                        SanzarCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(SanzarSpace.S3.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(palette.primarySoft),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(c.authorName.firstOrNull()?.uppercase() ?: "?", fontWeight = FontWeight.Bold)
                                }
                                Spacer(Modifier.width(SanzarSpace.S2.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(c.authorName, fontWeight = FontWeight.SemiBold)
                                    Text(c.text, style = MaterialTheme.typography.bodyMedium)
                                    Text(s.timeAgo(c.createdAt), style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                }
                                if (c.mine) {
                                    IconButton(onClick = {
                                        scope.launch {
                                            if (onDeleteComment(c.id)) {
                                                comments = comments?.filterNot { it.id == c.id }
                                            }
                                        }
                                    }) {
                                        Icon(Icons.Rounded.Delete, contentDescription = null)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(SanzarSpace.S3.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = commentText,
                    onValueChange = { commentText = it },
                    placeholder = { Text(s("writeComment")) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(SanzarRadius.SM.dp)
                )
                Spacer(Modifier.width(8.dp))
                FilledIconButton(
                    onClick = {
                        val t = commentText.trim()
                        if (t.isEmpty() || busy) return@FilledIconButton
                        busy = true
                        scope.launch {
                            onAddComment(post.id, t).onSuccess { created ->
                                comments = comments.orEmpty() + created
                                commentText = ""
                            }
                            busy = false
                        }
                    },
                    enabled = !busy
                ) {
                    Icon(Icons.Rounded.Send, contentDescription = null)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PublicUserScreen(
    uid: String,
    onBack: () -> Unit,
    onFetchProfile: suspend (String) -> Result<PublicProfile>,
    onToggleFollow: suspend (String, Boolean) -> Boolean,
    onBlock: (String) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<PublicProfile?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun load() {
        error = null
        scope.launch {
            onFetchProfile(uid).fold(
                onSuccess = { profile = it },
                onFailure = { error = s("err.generic") }
            )
        }
    }

    LaunchedEffect(uid) { load() }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            TopAppBar(
                title = { Text("") },
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
            ErrorRetryView(message = error!!, onRetry = { load() }, modifier = Modifier.padding(padding))
            return@Scaffold
        }
        val p = profile
        if (p == null) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(SanzarSpace.S4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(palette.primarySoft),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = p.name.firstOrNull()?.uppercase() ?: "?",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = palette.primary
                )
            }
            Spacer(Modifier.height(SanzarSpace.S3.dp))
            Text(p.name, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
            Text("${s("followers", mapOf("n" to p.followers))} · ${s("followingN", mapOf("n" to p.following))}")
            if (p.limited) {
                Spacer(Modifier.height(SanzarSpace.S3.dp))
                Text(s("privateProfile"), color = palette.muted)
            } else {
                p.xp?.let { Text(s("xpTotal", mapOf("n" to it))) }
                if (!p.institution.isNullOrBlank()) Text(p.institution)
            }
            Spacer(Modifier.height(SanzarSpace.S4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(SanzarSpace.S3.dp)
            ) {
                Button(
                    onClick = {
                        scope.launch {
                            if (onToggleFollow(p.uid, !p.isFollowing)) load()
                        }
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(s(if (p.isFollowing) "unfollow" else "follow"))
                }
                OutlinedButton(
                    onClick = {
                        onBlock(p.uid)
                        onBack()
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(s("block"))
                }
            }
        }
    }
}
