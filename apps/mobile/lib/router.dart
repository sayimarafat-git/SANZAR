import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_controller.dart';
import 'core/settings/settings_controller.dart';
import 'features/auth/choose_class_screen.dart';
import 'features/auth/sign_in_screen.dart';
import 'features/auth/verify_email_screen.dart';
import 'features/home/home_screen.dart';
import 'core/data/learning.dart';
import 'features/community/community_screen.dart';
import 'features/exams/exams_screen.dart';
import 'features/learn/chapter_screen.dart';
import 'features/learn/resource_screen.dart';
import 'features/library/library_screen.dart';
import 'features/progress/progress_screen.dart';
import 'features/tutor/tutor_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/shell/app_shell.dart';

/// Where the user must be, given auth and onboarding state. Null = stay.
/// Kept pure so it is unit-tested (test/router_test.dart).
String? redirectFor({required String location, required bool onboarded, required AuthStatus status, required bool needsVerification, required bool needsClass}) {
  const gate = {'/onboarding', '/sign-in', '/register', '/verify', '/choose-class', '/splash'};
  if (status == AuthStatus.unknown) return location == '/splash' ? null : '/splash';
  if (!onboarded) return location == '/onboarding' ? null : '/onboarding';
  if (status == AuthStatus.signedOut) return (location == '/sign-in' || location == '/register') ? null : '/sign-in';
  if (needsVerification) return location == '/verify' ? null : '/verify';
  if (needsClass) return location == '/choose-class' ? null : '/choose-class';
  return gate.contains(location) ? '/' : null;
}

GoRouter buildRouter(AuthController auth, SettingsController settings) => GoRouter(
      initialLocation: '/splash',
      refreshListenable: Listenable.merge([auth, settings]),
      redirect: (context, state) => redirectFor(
        location: state.matchedLocation,
        onboarded: settings.onboarded,
        status: auth.status,
        needsVerification: auth.needsVerification,
        needsClass: auth.needsClass,
      ),
      routes: [
        GoRoute(path: '/splash', builder: (_, _) => const Scaffold(body: Center(child: CircularProgressIndicator()))),
        GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
        GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
        GoRoute(path: '/register', builder: (_, _) => const SignInScreen()),
        GoRoute(path: '/verify', builder: (_, _) => const VerifyEmailScreen()),
        GoRoute(path: '/choose-class', builder: (_, _) => const ChooseClassScreen()),
        GoRoute(path: '/exams', builder: (_, _) => const ExamsScreen()),
        GoRoute(path: '/exam/:id', builder: (_, st) => ExamScreen(examId: st.pathParameters['id']!)),
        GoRoute(path: '/result/:id', builder: (_, st) => ResultScreen(attemptId: st.pathParameters['id']!, initial: st.extra is AttemptResult ? st.extra as AttemptResult : null)),
        GoRoute(path: '/progress', builder: (_, _) => const ProgressScreen()),
        GoRoute(path: '/leaderboard', builder: (_, _) => const LeaderboardScreen()),
        GoRoute(path: '/post/:id', builder: (_, st) => PostScreen(postId: st.pathParameters['id']!, post: st.extra is Post ? st.extra as Post : null)),
        GoRoute(path: '/user/:uid', builder: (_, st) => UserScreen(uid: st.pathParameters['uid']!)),
        StatefulShellRoute.indexedStack(
          builder: (_, _, shell) => AppShell(shell: shell),
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/library',
                builder: (_, st) => LibraryScreen(subject: st.uri.queryParameters['subject']),
                routes: [
                  GoRoute(
                    path: 'book/:bookId',
                    builder: (_, st) => BookScreen(bookId: st.pathParameters['bookId']!),
                    routes: [
                      GoRoute(
                        path: 'chapter/:chapterId',
                        builder: (_, st) => ChapterScreen(bookId: st.pathParameters['bookId']!, chapterId: st.pathParameters['chapterId']!),
                        routes: [
                          GoRoute(path: 'resource/:resourceId', builder: (_, st) => ResourceScreen(bookId: st.pathParameters['bookId']!, chapterId: st.pathParameters['chapterId']!, resourceId: st.pathParameters['resourceId']!)),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ]),
            StatefulShellBranch(routes: [GoRoute(path: '/tutor', builder: (_, _) => const TutorScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/community', builder: (_, _) => const CommunityScreen())]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen(), routes: [GoRoute(path: 'edit', builder: (_, _) => const EditProfileScreen())]),
            ]),
          ],
        ),
      ],
    );
