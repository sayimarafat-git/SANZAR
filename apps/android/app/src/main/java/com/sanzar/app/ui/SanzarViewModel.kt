package com.sanzar.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.UserProfileChangeRequest
import com.sanzar.app.SanzarApplication
import com.sanzar.app.data.local.*
import com.sanzar.app.data.model.*
import com.sanzar.app.data.remote.ApiException
import com.sanzar.app.data.remote.DownloadResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class TutorChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val fromMe: Boolean,
    val text: String,
    val answer: TutorAnswer? = null
)

data class SanzarUiState(
    val onboarded: Boolean = false,
    val themeMode: String = "light",
    val language: String = "bn",
    val guestMode: Boolean = false,
    val selectedLevelId: String? = null,
    val firebaseUser: FirebaseUser? = null,
    val isEmailVerified: Boolean = false,
    val profile: Profile? = null,
    val catalog: Catalog? = null,
    val catalogLoading: Boolean = false,
    val catalogOffline: Boolean = false,
    val catalogError: String? = null,
    val progress: ProgressData = ProgressData(),
    val localCompletedIds: Set<String> = emptySet(),
    val notifications: List<AppNotification> = emptyList(),
    val unreadNotifications: Int = 0,
    val installedResources: Map<String, InstalledResourceEntity> = emptyMap(),
    val downloadProgress: Map<String, Float> = emptyMap(),
    val pendingSyncCount: Int = 0,
    val lastSyncAt: Long = 0L,
    val isSyncing: Boolean = false,
    val snackbarMessage: String? = null,
    val tutorMessages: List<TutorChatMessage> = emptyList(),
    val tutorBusy: Boolean = false,
    val feedPosts: List<Post> = emptyList(),
    val feedNextCursor: Long? = null,
    val feedLoading: Boolean = false,
    val feedError: String? = null,
    val feedCategory: String? = null,
    val feedQuery: String = "",
    val dictionaryEntries: List<DictionaryEntry> = emptyList(),
    val dictionaryLoading: Boolean = false,
    val attemptHistory: List<AttemptSummary> = emptyList(),
    val historyLoading: Boolean = false,
    val activeStudySeconds: Int = 0
)

class SanzarViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as SanzarApplication
    private val prefs = app.preferences
    private val db = app.database
    private val api = app.apiClient
    private val downloader = app.resourceDownloader
    private val auth = FirebaseAuth.getInstance()

    private val _uiState = MutableStateFlow(
        SanzarUiState(
            firebaseUser = auth.currentUser,
            isEmailVerified = auth.currentUser?.isEmailVerified == true
        )
    )
    val uiState: StateFlow<SanzarUiState> = _uiState.asStateFlow()

    private var studyJob: Job? = null
    private var studyType: String? = null
    private var studyChapterId: String? = null
    private var studyResourceId: String? = null
    private var studySeconds: Int = 0
    private var studyLastActivityAt: Long = 0L

    private val authListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
        val user = firebaseAuth.currentUser
        _uiState.update {
            it.copy(
                firebaseUser = user,
                isEmailVerified = user?.isEmailVerified == true
            )
        }
        if (user != null) {
            viewModelScope.launch {
                prefs.setGuestMode(false)
                refreshProfileAndProgress()
                triggerManualSync()
            }
        }
    }

    init {
        auth.addAuthStateListener(authListener)

        viewModelScope.launch {
            prefs.state.collect { p ->
                val cachedCatalog = p.catalogJson?.let { raw ->
                    try {
                        Catalog.fromJson(JSONObject(raw))
                    } catch (_: Exception) {
                        null
                    }
                }
                _uiState.update { cur ->
                    cur.copy(
                        onboarded = p.onboarded,
                        themeMode = p.themeMode,
                        language = p.language,
                        guestMode = p.guestMode,
                        selectedLevelId = p.selectedLevelId,
                        lastSyncAt = p.lastSyncAt,
                        catalog = cur.catalog ?: cachedCatalog ?: Catalog.offlineSeed
                    )
                }
            }
        }

        viewModelScope.launch {
            db.progressDao().observeProgress().collect { list ->
                val completedSet = list.filter { it.isCompleted }.map { it.itemId }.toSet()
                _uiState.update { state ->
                    state.copy(
                        localCompletedIds = completedSet,
                        progress = state.progress.copy(
                            completed = state.progress.completed + completedSet
                        )
                    )
                }
            }
        }

        viewModelScope.launch {
            db.installedResourceDao().observeInstalled().collect { list ->
                _uiState.update { state ->
                    state.copy(installedResources = list.associateBy { it.resourceId })
                }
            }
        }

        viewModelScope.launch {
            db.pendingSyncDao().observePendingCount().collect { count ->
                _uiState.update { it.copy(pendingSyncCount = count) }
            }
        }

        refreshCatalog()
        if (auth.currentUser != null) {
            viewModelScope.launch { refreshProfileAndProgress() }
        }
    }

    override fun onCleared() {
        auth.removeAuthStateListener(authListener)
        stopStudySession()
        super.onCleared()
    }

    fun consumeSnackbar() {
        _uiState.update { it.copy(snackbarMessage = null) }
    }

    private fun showSnack(msg: String) {
        _uiState.update { it.copy(snackbarMessage = msg) }
    }

    // --- Onboarding & Settings ---

    fun completeOnboarding() {
        viewModelScope.launch { prefs.setOnboarded(true) }
    }

    fun setThemeMode(mode: String) {
        viewModelScope.launch { prefs.setThemeMode(mode) }
    }

    fun setLanguage(lang: String) {
        viewModelScope.launch {
            prefs.setLanguage(lang)
            if (auth.currentUser != null) {
                try {
                    val updated = api.updateMe(mapOf("locale" to lang))
                    _uiState.update { it.copy(profile = updated) }
                } catch (_: Exception) {
                }
            }
        }
    }

    fun continueAsGuest() {
        viewModelScope.launch {
            prefs.setGuestMode(true)
            if (_uiState.value.catalog == null) {
                _uiState.update { it.copy(catalog = Catalog.offlineSeed) }
            }
        }
    }

    fun exitGuestToSignIn() {
        viewModelScope.launch {
            prefs.setGuestMode(false)
        }
    }

    // --- Firebase Authentication ---

    suspend fun signInWithEmail(email: String, password: String): String? {
        return try {
            auth.signInWithEmailAndPassword(email.trim(), password).await()
            prefs.setGuestMode(false)
            refreshProfileAndProgress()
            null
        } catch (e: Exception) {
            mapAuthError(e)
        }
    }

    suspend fun registerWithEmail(name: String, email: String, password: String): String? {
        return try {
            val res = auth.createUserWithEmailAndPassword(email.trim(), password).await()
            res.user?.updateProfile(
                UserProfileChangeRequest.Builder().setDisplayName(name.trim()).build()
            )?.await()
            res.user?.sendEmailVerification()?.await()
            _uiState.update {
                it.copy(
                    firebaseUser = auth.currentUser,
                    isEmailVerified = auth.currentUser?.isEmailVerified == true
                )
            }
            prefs.setGuestMode(false)
            null
        } catch (e: Exception) {
            mapAuthError(e)
        }
    }

    suspend fun signInWithGoogleIdToken(idToken: String): String? {
        return try {
            val credential = GoogleAuthProvider.getCredential(idToken, null)
            auth.signInWithCredential(credential).await()
            prefs.setGuestMode(false)
            refreshProfileAndProgress()
            null
        } catch (e: Exception) {
            mapAuthError(e)
        }
    }

    suspend fun sendPasswordReset(email: String): String? {
        return try {
            auth.sendPasswordResetEmail(email.trim()).await()
            null
        } catch (e: Exception) {
            mapAuthError(e)
        }
    }

    suspend fun sendEmailVerification(): String? {
        return try {
            auth.currentUser?.sendEmailVerification()?.await()
            null
        } catch (e: Exception) {
            mapAuthError(e)
        }
    }

    suspend fun checkEmailVerified(): Boolean {
        return try {
            auth.currentUser?.reload()?.await()
            val verified = auth.currentUser?.isEmailVerified == true
            _uiState.update {
                it.copy(firebaseUser = auth.currentUser, isEmailVerified = verified)
            }
            if (verified) refreshProfileAndProgress()
            verified
        } catch (_: Exception) {
            false
        }
    }

    fun chooseClass(levelId: String) {
        completePostLoginOnboarding(
            displayName = _uiState.value.profile?.displayName.orEmpty(),
            language = _uiState.value.language,
            levelId = levelId
        )
    }

    fun completePostLoginOnboarding(displayName: String, language: String, levelId: String) {
        viewModelScope.launch {
            prefs.setLanguage(language)
            prefs.setSelectedLevelId(levelId)
            val cleanName = displayName.trim()
            if (auth.currentUser != null) {
                try {
                    val payload = mutableMapOf<String, Any?>(
                        "level_id" to levelId,
                        "locale" to language,
                        "onboarding_completed" to true
                    )
                    if (cleanName.length >= 2) payload["display_name"] = cleanName
                    val updated = api.updateMe(payload)
                    _uiState.update { it.copy(profile = updated, selectedLevelId = levelId, language = language) }
                } catch (_: Exception) {
                    enqueueSync(
                        "update_profile",
                        JSONObject().put("level_id", levelId).put("locale", language).put("onboarding_completed", true)
                    )
                    _uiState.update {
                        it.copy(
                            selectedLevelId = levelId,
                            language = language,
                            profile = it.profile?.copy(
                                levelId = levelId,
                                locale = language,
                                onboardingCompleted = true,
                                displayName = if (cleanName.length >= 2) cleanName else it.profile.displayName
                            )
                        )
                    }
                }
            } else {
                _uiState.update { it.copy(selectedLevelId = levelId, language = language) }
            }
        }
    }

    suspend fun updateProfile(
        displayName: String,
        levelId: String?,
        institution: String,
        group: String
    ): Boolean {
        val changes = mutableMapOf<String, Any?>()
        val cur = _uiState.value.profile
        if (displayName.isNotBlank() && displayName != cur?.displayName) {
            changes["display_name"] = displayName.trim()
        }
        if (institution != (cur?.institution ?: "")) {
            changes["institution"] = institution.trim()
        }
        if (group.isNotBlank() && group != (cur?.group ?: "")) {
            changes["grp"] = group.trim()
        }
        if (!levelId.isNullOrBlank() && levelId != cur?.levelId) {
            changes["level_id"] = levelId
            prefs.setSelectedLevelId(levelId)
        }
        if (changes.isEmpty()) return true
        return try {
            if (auth.currentUser != null) {
                val updated = api.updateMe(changes)
                _uiState.update { it.copy(profile = updated, selectedLevelId = updated.levelId ?: it.selectedLevelId) }
            } else {
                _uiState.update { it.copy(selectedLevelId = levelId ?: it.selectedLevelId) }
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun updateVisibility(visibility: String): Boolean {
        return try {
            val updated = api.updateMe(mapOf("profile_visibility" to visibility))
            _uiState.update { it.copy(profile = updated) }
            true
        } catch (_: Exception) {
            false
        }
    }

    fun signOut() {
        viewModelScope.launch {
            auth.signOut()
            prefs.clearAuthBoundData()
            _uiState.update {
                it.copy(
                    firebaseUser = null,
                    isEmailVerified = false,
                    profile = null,
                    guestMode = false,
                    notifications = emptyList(),
                    unreadNotifications = 0
                )
            }
        }
    }

    suspend fun deleteAccount(): String? {
        return try {
            if (auth.currentUser != null) {
                try {
                    api.deleteMe()
                } catch (_: Exception) {
                }
                auth.currentUser?.delete()?.await()
            }
            prefs.clearAuthBoundData()
            db.progressDao().clearAll()
            _uiState.update {
                it.copy(
                    firebaseUser = null,
                    isEmailVerified = false,
                    profile = null,
                    guestMode = false
                )
            }
            null
        } catch (e: Exception) {
            mapAuthError(e)
        }
    }

    private fun mapAuthError(e: Exception): String {
        val code = (e as? FirebaseAuthException)?.errorCode
        return when (code) {
            "ERROR_INVALID_EMAIL" -> "err.email"
            "ERROR_WRONG_PASSWORD", "ERROR_INVALID_CREDENTIAL", "ERROR_USER_NOT_FOUND" -> "err.wrongCredentials"
            "ERROR_EMAIL_ALREADY_IN_USE" -> "err.emailInUse"
            "ERROR_USER_DISABLED" -> "err.blocked"
            "ERROR_REQUIRES_RECENT_LOGIN" -> "recentLogin"
            else -> e.localizedMessage ?: "err.generic"
        }
    }

    // --- Catalog & Room Persistence ---

    fun refreshCatalog() {
        viewModelScope.launch {
            if (_uiState.value.catalogLoading) return@launch
            _uiState.update { it.copy(catalogLoading = true, catalogError = null) }
            try {
                val etag = prefs.state.first().catalogEtag
                val (fresh, cachedPair) = api.fetchCatalog(etag)
                if (fresh != null && cachedPair != null) {
                    prefs.saveCatalogCache(cachedPair.first, cachedPair.second)
                    persistCatalogToRoom(fresh)
                    _uiState.update {
                        it.copy(
                            catalog = fresh,
                            catalogOffline = false,
                            catalogError = null
                        )
                    }
                } else {
                    _uiState.update { it.copy(catalogOffline = false, catalogError = null) }
                }
            } catch (e: ApiException) {
                _uiState.update {
                    it.copy(
                        catalogOffline = e.isNetwork,
                        catalogError = e.message,
                        catalog = it.catalog ?: Catalog.offlineSeed
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        catalogError = e.message,
                        catalog = it.catalog ?: Catalog.offlineSeed
                    )
                }
            } finally {
                _uiState.update { it.copy(catalogLoading = false) }
            }
        }
    }

    private suspend fun persistCatalogToRoom(catalog: Catalog) {
        val books = mutableListOf<BookEntity>()
        val chapters = mutableListOf<ChapterEntity>()
        val resources = mutableListOf<ResourceEntity>()
        val notes = mutableListOf<NoteEntity>()
        val exams = mutableListOf<ExamEntity>()

        catalog.books.forEachIndexed { idx, b ->
            books += BookEntity(
                id = b.id,
                title = b.title,
                subjectId = b.subjectId,
                edition = b.edition,
                author = b.author,
                coverJson = JSONArray(b.cover).toString(),
                levelsJson = JSONArray(b.levels).toString(),
                featuredRank = b.featuredRank,
                sortOrder = idx,
                coverImage = b.coverImage,
                coverRatio = b.coverRatio
            )
            b.chapters.forEach { ch ->
                chapters += ChapterEntity(
                    id = ch.id,
                    bookId = b.id,
                    number = ch.number,
                    title = ch.title,
                    hasNotes = ch.hasNotes,
                    questionCount = ch.questionCount
                )
                ch.resources.forEach { r ->
                    resources += ResourceEntity(
                        id = r.id,
                        chapterId = ch.id,
                        type = r.type,
                        title = r.title,
                        url = r.url,
                        pages = r.pages,
                        version = r.version,
                        sha256 = r.sha256,
                        sizeBytes = r.sizeBytes
                    )
                }
            }
        }

        catalog.notes.forEach { (chapterId, sections) ->
            sections.forEachIndexed { i, sec ->
                notes += NoteEntity(
                    id = "${chapterId}_$i",
                    chapterId = chapterId,
                    sectionIndex = i,
                    heading = sec.heading,
                    text = sec.text,
                    page = sec.page
                )
            }
        }

        catalog.exams.forEach { ex ->
            exams += ExamEntity(
                id = ex.id,
                title = ex.title,
                type = ex.type,
                bookId = ex.bookId,
                chapterId = ex.chapterId,
                durationSec = ex.durationSec,
                questionCount = ex.questionCount,
                passPct = ex.passPct
            )
        }

        db.catalogDao().replaceCatalog(books, chapters, resources, notes, exams)
    }

    // --- Profile, Progress & Notifications ---

    suspend fun refreshProfileAndProgress() {
        if (auth.currentUser == null) return
        try {
            val profile = api.getMe()
            if (profile.levelId != null) {
                prefs.setSelectedLevelId(profile.levelId)
            }
            _uiState.update {
                it.copy(
                    profile = profile,
                    selectedLevelId = profile.levelId ?: it.selectedLevelId
                )
            }
        } catch (_: Exception) {
        }
        refreshProgressOnly()
    }

    fun refreshProgress() {
        viewModelScope.launch { refreshProgressOnly() }
    }

    private suspend fun refreshProgressOnly() {
        if (auth.currentUser == null) return
        try {
            val p = api.fetchProgress()
            val mergedCompleted = p.completed + _uiState.value.localCompletedIds
            val entities = p.completed.map { ProgressEntity(itemId = it, isCompleted = true) }
            if (entities.isNotEmpty()) db.progressDao().upsertAll(entities)

            val (notifs, unread) = try {
                api.fetchNotifications()
            } catch (_: Exception) {
                _uiState.value.notifications to _uiState.value.unreadNotifications
            }

            _uiState.update {
                it.copy(
                    progress = p.copy(completed = mergedCompleted),
                    notifications = notifs,
                    unreadNotifications = unread
                )
            }
        } catch (_: Exception) {
        }
    }

    fun markNotificationsRead(id: String? = null) {
        val snapshot = _uiState.value.notifications
        val snapshotUnread = _uiState.value.unreadNotifications
        _uiState.update { state ->
            val updated = state.notifications.map { n ->
                if (id == null || n.id == id) n.copy(read = true) else n
            }
            state.copy(
                notifications = updated,
                unreadNotifications = updated.count { !it.read }
            )
        }
        viewModelScope.launch {
            try {
                api.markNotificationsRead(id)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(notifications = snapshot, unreadNotifications = snapshotUnread)
                }
                showSnack(e.message ?: "Error")
            }
        }
    }

    fun markItemCompleted(itemId: String) {
        viewModelScope.launch {
            db.progressDao().upsertProgress(
                ProgressEntity(itemId = itemId, isCompleted = true, updatedAt = System.currentTimeMillis())
            )
            if (auth.currentUser != null) {
                try {
                    val res = api.completeItem(itemId)
                    val xp = res.optInt("xpAwarded", 0)
                    refreshProgressOnly()
                    showSnack(if (xp > 0) "+$xp XP" else "Done")
                    return@launch
                } catch (_: Exception) {
                }
            }
            enqueueSync("completion", JSONObject().put("itemId", itemId))
            showSnack("Saved offline")
        }
    }

    // --- Study Tracking & Focus ---

    fun startStudySession(type: String, chapterId: String? = null, resourceId: String? = null) {
        stopStudySession()
        studyType = type
        studyChapterId = chapterId
        studyResourceId = resourceId
        studySeconds = 0
        studyLastActivityAt = System.currentTimeMillis()
        _uiState.update { it.copy(activeStudySeconds = 0) }
        studyJob = viewModelScope.launch {
            while (true) {
                delay(1000L)
                val idle = System.currentTimeMillis() - studyLastActivityAt > 120_000L
                if (!idle || type == "focus") {
                    studySeconds++
                    _uiState.update { it.copy(activeStudySeconds = studySeconds) }
                    if (studySeconds >= 600) {
                        flushCurrentStudyCut()
                    }
                }
            }
        }
    }

    fun recordStudyActivity() {
        studyLastActivityAt = System.currentTimeMillis()
    }

    fun stopStudySession() {
        studyJob?.cancel()
        studyJob = null
        if (studyType != null && studySeconds > 0) {
            viewModelScope.launch { flushCurrentStudyCut() }
        }
        studyType = null
        studyChapterId = null
        studyResourceId = null
        studySeconds = 0
        _uiState.update { it.copy(activeStudySeconds = 0) }
    }

    private suspend fun flushCurrentStudyCut() {
        val sec = studySeconds
        val type = studyType ?: return
        if (sec <= 0) return
        val chap = studyChapterId
        val resId = studyResourceId
        studySeconds = 0
        _uiState.update { it.copy(activeStudySeconds = 0) }

        val event = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("type", type)
            if (chap != null) put("chapterId", chap)
            if (resId != null) put("resourceId", resId)
            put("sec", sec)
            put("startedAt", System.currentTimeMillis() - sec * 1000L)
        }

        if (auth.currentUser != null) {
            try {
                api.sendStudyEvents(listOf(event))
                refreshProgressOnly()
                return
            } catch (_: Exception) {
            }
        }
        enqueueSync("study_event", event)
    }

    // --- Offline SHA-256 Downloads ---

    fun downloadResource(resource: ResourceItem) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(downloadProgress = it.downloadProgress + (resource.id to 0.05f))
            }
            val manifestSha = try {
                if (resource.sha256.isNullOrBlank()) {
                    api.fetchResourceManifest().firstOrNull { it.resourceId == resource.id }?.sha256
                } else {
                    resource.sha256
                }
            } catch (_: Exception) {
                resource.sha256
            }

            val result = downloader.downloadResource(resource, expectedSha256 = manifestSha) { p ->
                _uiState.update {
                    it.copy(downloadProgress = it.downloadProgress + (resource.id to p))
                }
            }
            _uiState.update {
                it.copy(downloadProgress = it.downloadProgress - resource.id)
            }
            when (result) {
                is DownloadResult.Success -> showSnack(
                    if (result.alreadyCached) "Already saved offline" else "Saved for offline"
                )
                is DownloadResult.Failure -> showSnack(result.reason)
            }
        }
    }

    fun removeDownloadedResource(resourceId: String) {
        viewModelScope.launch {
            downloader.removeResource(resourceId)
            showSnack("Removed download")
        }
    }

    // --- Pending Sync Queue ---

    private suspend fun enqueueSync(type: String, payload: JSONObject) {
        db.pendingSyncDao().enqueue(
            PendingSyncEntity(
                operationId = UUID.randomUUID().toString(),
                type = type,
                payloadJson = payload.toString(),
                createdAt = System.currentTimeMillis(),
                synced = false
            )
        )
        app.triggerImmediateSync()
    }

    fun triggerManualSync() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true) }
            try {
                val pending = db.pendingSyncDao().getPending()
                if (pending.isNotEmpty() && auth.currentUser != null) {
                    val ops = JSONArray()
                    pending.forEach { op ->
                        val payload = try {
                            JSONObject(op.payloadJson)
                        } catch (_: Exception) {
                            JSONObject()
                        }
                        ops.put(
                            JSONObject().apply {
                                put("operationId", op.operationId)
                                put("type", op.type)
                                put("payload", payload)
                                put("createdAt", op.createdAt)
                            }
                        )
                    }
                    api.syncBatch(ops)
                    db.pendingSyncDao().markSynced(pending.map { it.operationId })
                    db.pendingSyncDao().pruneSynced()
                }
                refreshCatalog()
                refreshProgressOnly()
                prefs.setLastSyncAt(System.currentTimeMillis())
                showSnack("Sync complete")
            } catch (e: Exception) {
                app.triggerImmediateSync()
                showSnack(e.message ?: "Queued for sync")
            } finally {
                _uiState.update { it.copy(isSyncing = false) }
            }
        }
    }

    // --- Exams ---

    fun loadAttemptHistory() {
        if (auth.currentUser == null) return
        viewModelScope.launch {
            _uiState.update { it.copy(historyLoading = true) }
            try {
                val list = api.fetchAttempts()
                _uiState.update { it.copy(attemptHistory = list) }
            } catch (_: Exception) {
            } finally {
                _uiState.update { it.copy(historyLoading = false) }
            }
        }
    }

    suspend fun startExam(examId: String): Result<ExamSession> = try {
        Result.success(api.startExam(examId))
    } catch (e: Exception) {
        Result.failure(e)
    }

    suspend fun submitExam(attemptId: String, answers: Map<String, Int>): Result<AttemptResult> = try {
        val res = api.submitExam(attemptId, answers)
        refreshProgressOnly()
        Result.success(res)
    } catch (e: Exception) {
        Result.failure(e)
    }

    suspend fun fetchAttemptResult(attemptId: String): Result<AttemptResult> = try {
        Result.success(api.fetchAttempt(attemptId))
    } catch (e: Exception) {
        Result.failure(e)
    }

    // --- Leaderboard ---

    suspend fun fetchLeaderboard(period: String, myClassOnly: Boolean): Result<Pair<List<LeaderEntry>, LeaderEntry?>> = try {
        val level = if (myClassOnly) _uiState.value.profile?.levelId ?: _uiState.value.selectedLevelId else null
        Result.success(api.fetchLeaderboard(period, level))
    } catch (e: Exception) {
        Result.failure(e)
    }

    // --- AI Tutor ---

    fun askTutor(question: String) {
        val q = question.trim()
        if (q.isEmpty() || _uiState.value.tutorBusy) return
        val lastRef = _uiState.value.tutorMessages
            .asReversed()
            .firstOrNull { it.answer?.reference != null }
            ?.answer?.reference

        _uiState.update {
            it.copy(
                tutorMessages = it.tutorMessages + TutorChatMessage(fromMe = true, text = q),
                tutorBusy = true
            )
        }
        viewModelScope.launch {
            try {
                val answer = api.askTutor(q, prev = lastRef)
                _uiState.update {
                    it.copy(
                        tutorMessages = it.tutorMessages + TutorChatMessage(
                            fromMe = false,
                            text = answer.text,
                            answer = answer
                        ),
                        tutorBusy = false
                    )
                }
            } catch (e: Exception) {
                val fallback = findLocalNoteTutorAnswer(q)
                _uiState.update {
                    it.copy(
                        tutorMessages = it.tutorMessages + TutorChatMessage(
                            fromMe = false,
                            text = fallback?.text ?: (e.message ?: "Unable to reach AI Tutor."),
                            answer = fallback
                        ),
                        tutorBusy = false
                    )
                }
            }
        }
    }

    private fun findLocalNoteTutorAnswer(query: String): TutorAnswer? {
        val cat = _uiState.value.catalog ?: return null
        val terms = query.lowercase().split(Regex("\\s+")).filter { it.length > 2 }
        for (book in cat.books) {
            for (ch in book.chapters) {
                val notes = cat.notes[ch.id].orEmpty()
                notes.forEachIndexed { idx, sec ->
                    val hay = "${sec.heading} ${sec.text} ${ch.title}".lowercase()
                    if (terms.any { hay.contains(it) }) {
                        return TutorAnswer(
                            found = true,
                            heading = sec.heading,
                            text = sec.text,
                            reference = TutorReference(
                                bookId = book.id,
                                bookTitle = book.title,
                                subjectId = book.subjectId,
                                chapterId = ch.id,
                                chapterTitle = ch.title,
                                chapterNumber = ch.number,
                                section = idx,
                                page = sec.page
                            )
                        )
                    }
                }
            }
        }
        return null
    }

    // --- Dictionary ---

    fun searchDictionary(query: String = "", lang: String = "all") {
        viewModelScope.launch {
            _uiState.update { it.copy(dictionaryLoading = true) }
            try {
                val entries = api.fetchDictionary(query = query, lang = lang)
                _uiState.update { it.copy(dictionaryEntries = entries, dictionaryLoading = false) }
            } catch (_: Exception) {
                _uiState.update { it.copy(dictionaryLoading = false) }
            }
        }
    }

    // --- Community ---

    fun loadFeed(
        reset: Boolean = false,
        category: String? = _uiState.value.feedCategory,
        query: String = _uiState.value.feedQuery
    ) {
        viewModelScope.launch {
            if (_uiState.value.feedLoading) return@launch
            _uiState.update { it.copy(feedLoading = true, feedError = null, feedCategory = category, feedQuery = query) }
            try {
                val before = if (reset) null else _uiState.value.feedNextCursor
                val (posts, next) = api.fetchFeed(before = before, category = category, query = query)
                _uiState.update { state ->
                    state.copy(
                        feedPosts = if (reset) posts else state.feedPosts + posts,
                        feedNextCursor = next,
                        feedLoading = false,
                        feedError = null
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(feedLoading = false, feedError = e.message ?: "Error") }
            }
        }
    }

    suspend fun createPost(
        text: String,
        category: String,
        pollQuestion: String?,
        pollOptions: List<String>?,
        attachments: List<PostAttachment>
    ): Boolean {
        return try {
            val res = api.createPost(text, category, pollQuestion, pollOptions, attachments)
            val xp = res.optInt("xpAwarded", 0)
            if (xp > 0) showSnack("+$xp XP")
            loadFeed(reset = true)
            true
        } catch (e: Exception) {
            showSnack(e.message ?: "Error")
            false
        }
    }

    fun toggleLike(post: Post) {
        viewModelScope.launch {
            try {
                val (liked, count) = api.toggleLike(post.id)
                _uiState.update { state ->
                    state.copy(
                        feedPosts = state.feedPosts.map {
                            if (it.id == post.id) it.copy(likedByMe = liked, likeCount = count) else it
                        }
                    )
                }
            } catch (e: Exception) {
                showSnack(e.message ?: "Error")
            }
        }
    }

    fun votePoll(post: Post, optionIndex: Int) {
        viewModelScope.launch {
            try {
                val poll = api.votePoll(post.id, optionIndex)
                _uiState.update { state ->
                    state.copy(
                        feedPosts = state.feedPosts.map {
                            if (it.id == post.id) it.copy(poll = poll) else it
                        }
                    )
                }
            } catch (e: Exception) {
                showSnack(e.message ?: "Error")
            }
        }
    }

    fun deletePost(postId: String) {
        viewModelScope.launch {
            try {
                api.deletePost(postId)
                _uiState.update { state ->
                    state.copy(feedPosts = state.feedPosts.filterNot { it.id == postId })
                }
            } catch (e: Exception) {
                showSnack(e.message ?: "Error")
            }
        }
    }

    fun blockUser(uid: String) {
        viewModelScope.launch {
            try {
                api.setBlock(uid, true)
                _uiState.update { state ->
                    state.copy(feedPosts = state.feedPosts.filterNot { it.authorUid == uid })
                }
                showSnack("User blocked")
            } catch (e: Exception) {
                showSnack(e.message ?: "Error")
            }
        }
    }

    fun reportTarget(targetType: String, targetId: String, reason: String) {
        viewModelScope.launch {
            try {
                api.reportTarget(targetType, targetId, reason)
                showSnack("Reported")
            } catch (e: Exception) {
                showSnack(e.message ?: "Error")
            }
        }
    }

    suspend fun fetchComments(postId: String): Result<List<Comment>> = try {
        Result.success(api.fetchComments(postId))
    } catch (e: Exception) {
        Result.failure(e)
    }

    suspend fun addComment(postId: String, text: String): Result<Comment> = try {
        val c = api.addComment(postId, text)
        _uiState.update { state ->
            state.copy(
                feedPosts = state.feedPosts.map {
                    if (it.id == postId) it.copy(commentCount = it.commentCount + 1) else it
                }
            )
        }
        Result.success(c)
    } catch (e: Exception) {
        Result.failure(e)
    }

    suspend fun deleteComment(commentId: String): Boolean = try {
        api.deleteComment(commentId)
        true
    } catch (_: Exception) {
        false
    }

    suspend fun fetchPublicProfile(uid: String): Result<PublicProfile> = try {
        Result.success(api.fetchPublicProfile(uid))
    } catch (e: Exception) {
        Result.failure(e)
    }

    suspend fun toggleFollow(uid: String, follow: Boolean): Boolean = try {
        api.setFollow(uid, follow)
        true
    } catch (_: Exception) {
        false
    }
}
