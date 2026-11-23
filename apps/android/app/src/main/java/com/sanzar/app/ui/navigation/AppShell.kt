package com.sanzar.app.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.data.model.AttemptResult
import com.sanzar.app.data.model.Post
import com.sanzar.app.ui.SanzarViewModel
import com.sanzar.app.ui.screens.*
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors

enum class MainTab {
    Home, Library, Tutor, Community, Profile
}

sealed interface SanzarRoute {
    data class Main(val tab: MainTab = MainTab.Home, val librarySubject: String? = null) : SanzarRoute
    data class BookDetail(val bookId: String) : SanzarRoute
    data class ChapterDetail(val bookId: String, val chapterId: String) : SanzarRoute
    data class ResourceReader(val bookId: String, val chapterId: String, val resourceId: String? = null) : SanzarRoute
    data object Exams : SanzarRoute
    data class ExamRunner(val examId: String) : SanzarRoute
    data class ExamResult(val attemptId: String, val initialResult: AttemptResult? = null) : SanzarRoute
    data object Progress : SanzarRoute
    data object Leaderboard : SanzarRoute
    data class PostDetail(val post: Post) : SanzarRoute
    data class PublicUser(val uid: String) : SanzarRoute
    data object EditProfile : SanzarRoute
}

@Composable
fun AppShell(
    viewModel: SanzarViewModel,
    onGoogleSignInClick: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val s = LocalStrings.current
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.snackbarMessage) {
        val msg = state.snackbarMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        viewModel.consumeSnackbar()
    }

    val backStack = remember { mutableStateListOf<SanzarRoute>(SanzarRoute.Main(MainTab.Home)) }
    val currentRoute = backStack.lastOrNull() ?: SanzarRoute.Main(MainTab.Home)

    fun pushRoute(route: SanzarRoute) {
        backStack.add(route)
    }

    fun replaceTopRoute(route: SanzarRoute) {
        if (backStack.isNotEmpty()) backStack[backStack.lastIndex] = route
        else backStack.add(route)
    }

    fun popRoute() {
        if (backStack.size > 1) backStack.removeAt(backStack.lastIndex)
    }

    fun switchTab(tab: MainTab, librarySubject: String? = null) {
        backStack.clear()
        backStack.add(SanzarRoute.Main(tab = tab, librarySubject = librarySubject))
    }

    // Auth & setup gates
    when {
        !state.onboarded -> {
            OnboardingScreen(
                onSelectLanguage = viewModel::setLanguage,
                onComplete = viewModel::completeOnboarding
            )
            return
        }
        state.firebaseUser == null && !state.guestMode -> {
            SignInScreen(
                onSignIn = viewModel::signInWithEmail,
                onRegister = viewModel::registerWithEmail,
                onForgotPassword = viewModel::sendPasswordReset,
                onGoogleSignInClick = onGoogleSignInClick,
                onContinueGuest = viewModel::continueAsGuest
            )
            return
        }
        state.firebaseUser != null && !state.isEmailVerified -> {
            VerifyEmailScreen(
                email = state.firebaseUser?.email.orEmpty(),
                onCheckVerified = viewModel::checkEmailVerified,
                onResend = viewModel::sendEmailVerification,
                onSignOut = viewModel::signOut
            )
            return
        }
        (state.profile?.levelId ?: state.selectedLevelId) == null -> {
            ChooseClassScreen(
                levels = state.catalog?.levels.orEmpty(),
                initialLevelId = state.selectedLevelId,
                loading = state.catalogLoading,
                error = state.catalogError,
                onRetry = viewModel::refreshCatalog,
                onConfirm = viewModel::chooseClass
            )
            return
        }
    }

    BackHandler(enabled = backStack.size > 1) {
        popRoute()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            if (currentRoute is SanzarRoute.Main) {
                SanzarBottomBar(
                    selectedTab = currentRoute.tab,
                    onSelectTab = { switchTab(it) }
                )
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = if (currentRoute is SanzarRoute.Main) innerPadding.calculateBottomPadding() else 0.dp)
        ) {
            when (val route = currentRoute) {
                is SanzarRoute.Main -> when (route.tab) {
                    MainTab.Home -> HomeScreen(
                        state = state,
                        onRefresh = {
                            viewModel.refreshCatalog()
                            viewModel.refreshProgress()
                        },
                        onMarkNotificationsRead = viewModel::markNotificationsRead,
                        onToggleTheme = {
                            val next = if (state.themeMode == "dark") "light" else "dark"
                            viewModel.setThemeMode(next)
                        },
                        onSelectLanguage = viewModel::setLanguage,
                        onOpenExams = { pushRoute(SanzarRoute.Exams) },
                        onOpenProgress = { pushRoute(SanzarRoute.Progress) },
                        onOpenLeaderboard = { pushRoute(SanzarRoute.Leaderboard) },
                        onOpenTutor = { switchTab(MainTab.Tutor) },
                        onOpenSubjectLibrary = { subId -> switchTab(MainTab.Library, librarySubject = subId) },
                        onOpenAllLibrary = { switchTab(MainTab.Library) },
                        onOpenBook = { bookId -> pushRoute(SanzarRoute.BookDetail(bookId)) },
                        onSignInClick = viewModel::exitGuestToSignIn
                    )

                    MainTab.Library -> LibraryScreen(
                        state = state,
                        initialSubject = route.librarySubject,
                        onRefresh = viewModel::refreshCatalog,
                        onOpenBook = { bookId -> pushRoute(SanzarRoute.BookDetail(bookId)) }
                    )

                    MainTab.Tutor -> TutorScreen(
                        state = state,
                        onAsk = viewModel::askTutor,
                        onOpenChapter = { bookId, chapterId ->
                            pushRoute(SanzarRoute.ChapterDetail(bookId, chapterId))
                        }
                    )

                    MainTab.Community -> CommunityScreen(
                        state = state,
                        onLoadFeed = viewModel::loadFeed,
                        onCreatePost = viewModel::createPost,
                        onToggleLike = viewModel::toggleLike,
                        onVotePoll = viewModel::votePoll,
                        onDeletePost = viewModel::deletePost,
                        onBlockUser = viewModel::blockUser,
                        onReportPost = { id, reason -> viewModel.reportTarget("post", id, reason) },
                        onOpenPost = { post -> pushRoute(SanzarRoute.PostDetail(post)) },
                        onOpenUser = { uid -> pushRoute(SanzarRoute.PublicUser(uid)) }
                    )

                    MainTab.Profile -> ProfileScreen(
                        state = state,
                        onEditProfile = { pushRoute(SanzarRoute.EditProfile) },
                        onOpenProgress = { pushRoute(SanzarRoute.Progress) },
                        onOpenExams = { pushRoute(SanzarRoute.Exams) },
                        onOpenLeaderboard = { pushRoute(SanzarRoute.Leaderboard) },
                        onChangeVisibility = viewModel::updateVisibility,
                        onChangeLanguage = viewModel::setLanguage,
                        onChangeTheme = viewModel::setThemeMode,
                        onRemoveDownload = viewModel::removeDownloadedResource,
                        onTriggerSync = viewModel::triggerManualSync,
                        onSignInClick = viewModel::exitGuestToSignIn,
                        onSignOut = viewModel::signOut,
                        onDeleteAccount = viewModel::deleteAccount
                    )
                }

                is SanzarRoute.BookDetail -> BookDetailScreen(
                    bookId = route.bookId,
                    state = state,
                    onBack = ::popRoute,
                    onOpenChapter = { bId, cId -> pushRoute(SanzarRoute.ChapterDetail(bId, cId)) }
                )

                is SanzarRoute.ChapterDetail -> ChapterScreen(
                    bookId = route.bookId,
                    chapterId = route.chapterId,
                    state = state,
                    onBack = ::popRoute,
                    onOpenQuiz = { examId -> pushRoute(SanzarRoute.ExamRunner(examId)) },
                    onOpenResourceReader = { bId, cId, rId ->
                        pushRoute(SanzarRoute.ResourceReader(bId, cId, rId))
                    },
                    onDownloadResource = viewModel::downloadResource,
                    onRemoveDownload = viewModel::removeDownloadedResource,
                    onMarkDone = viewModel::markItemCompleted,
                    onStartStudy = { type, chapId -> viewModel.startStudySession(type, chapterId = chapId) },
                    onStopStudy = viewModel::stopStudySession,
                    onStudyActivity = viewModel::recordStudyActivity
                )

                is SanzarRoute.ResourceReader -> ResourceReaderScreen(
                    bookId = route.bookId,
                    chapterId = route.chapterId,
                    resourceId = route.resourceId,
                    state = state,
                    onBack = ::popRoute,
                    onDownloadResource = viewModel::downloadResource,
                    onMarkDone = viewModel::markItemCompleted,
                    onStartStudy = { type, chapId, resId ->
                        viewModel.startStudySession(type, chapterId = chapId, resourceId = resId)
                    },
                    onStopStudy = viewModel::stopStudySession
                )

                is SanzarRoute.Exams -> ExamsScreen(
                    state = state,
                    onBack = ::popRoute,
                    onLoadHistory = viewModel::loadAttemptHistory,
                    onStartExam = { examId -> pushRoute(SanzarRoute.ExamRunner(examId)) },
                    onOpenResult = { attemptId -> pushRoute(SanzarRoute.ExamResult(attemptId)) }
                )

                is SanzarRoute.ExamRunner -> ExamRunnerScreen(
                    examId = route.examId,
                    onStartExam = viewModel::startExam,
                    onSubmitExam = viewModel::submitExam,
                    onStartStudy = { viewModel.startStudySession("exam") },
                    onStopStudy = viewModel::stopStudySession,
                    onFinished = { res ->
                        replaceTopRoute(SanzarRoute.ExamResult(res.attempt.id, res))
                    },
                    onBack = ::popRoute
                )

                is SanzarRoute.ExamResult -> ExamResultScreen(
                    attemptId = route.attemptId,
                    initialResult = route.initialResult,
                    onFetchResult = viewModel::fetchAttemptResult,
                    onBack = ::popRoute
                )

                is SanzarRoute.Progress -> ProgressScreen(
                    state = state,
                    onBack = ::popRoute,
                    onRefresh = viewModel::refreshProgress,
                    onStartFocus = { viewModel.startStudySession("focus") },
                    onStopFocus = viewModel::stopStudySession
                )

                is SanzarRoute.Leaderboard -> LeaderboardScreen(
                    onBack = ::popRoute,
                    onFetchLeaderboard = viewModel::fetchLeaderboard
                )

                is SanzarRoute.PostDetail -> {
                    val livePost = state.feedPosts.firstOrNull { it.id == route.post.id } ?: route.post
                    PostDetailScreen(
                        post = livePost,
                        onBack = ::popRoute,
                        onFetchComments = viewModel::fetchComments,
                        onAddComment = viewModel::addComment,
                        onDeleteComment = viewModel::deleteComment,
                        onToggleLike = viewModel::toggleLike,
                        onVotePoll = viewModel::votePoll,
                        onDeletePost = viewModel::deletePost,
                        onReport = viewModel::reportTarget
                    )
                }

                is SanzarRoute.PublicUser -> PublicUserScreen(
                    uid = route.uid,
                    onBack = ::popRoute,
                    onFetchProfile = viewModel::fetchPublicProfile,
                    onToggleFollow = viewModel::toggleFollow,
                    onBlock = viewModel::blockUser
                )

                is SanzarRoute.EditProfile -> EditProfileScreen(
                    state = state,
                    levels = state.catalog?.levels.orEmpty(),
                    onBack = ::popRoute,
                    onSave = viewModel::updateProfile
                )
            }
        }
    }
}

@Composable
private fun SanzarBottomBar(
    selectedTab: MainTab,
    onSelectTab: (MainTab) -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current

    Surface(
        color = palette.surface,
        border = BorderStroke(1.dp, palette.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .navigationBarsPadding()
                .height(66.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            NavTabItem(
                selected = selectedTab == MainTab.Home,
                icon = Icons.Outlined.Home,
                activeIcon = Icons.Rounded.Home,
                label = s("home"),
                onClick = { onSelectTab(MainTab.Home) },
                modifier = Modifier.weight(1f)
            )
            NavTabItem(
                selected = selectedTab == MainTab.Library,
                icon = Icons.Outlined.LocalLibrary,
                activeIcon = Icons.Rounded.LocalLibrary,
                label = s("library"),
                onClick = { onSelectTab(MainTab.Library) },
                modifier = Modifier.weight(1f)
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelectTab(MainTab.Tutor) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier
                        .offset(y = (-8).dp)
                        .size(50.dp)
                        .shadow(8.dp, CircleShape)
                        .clip(CircleShape)
                        .background(SanzarColors.BrandGradient),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.SmartToy,
                        contentDescription = s("tutor"),
                        tint = Color.White,
                        modifier = Modifier.size(26.dp)
                    )
                }
                Text(
                    text = s("tutor"),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (selectedTab == MainTab.Tutor) palette.primary else palette.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.offset(y = (-6).dp)
                )
            }
            NavTabItem(
                selected = selectedTab == MainTab.Community,
                icon = Icons.Outlined.Forum,
                activeIcon = Icons.Rounded.Forum,
                label = s("community"),
                onClick = { onSelectTab(MainTab.Community) },
                modifier = Modifier.weight(1f)
            )
            NavTabItem(
                selected = selectedTab == MainTab.Profile,
                icon = Icons.Outlined.Person,
                activeIcon = Icons.Rounded.Person,
                label = s("profile"),
                onClick = { onSelectTab(MainTab.Profile) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun NavTabItem(
    selected: Boolean,
    icon: ImageVector,
    activeIcon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalSanzarPalette.current
    val tint = if (selected) palette.primary else palette.muted
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = if (selected) activeIcon else icon,
            contentDescription = label,
            tint = tint
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = tint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}
