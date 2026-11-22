import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sanzar/app.dart';
import 'package:sanzar/core/api/api_client.dart';
import 'package:sanzar/core/auth/auth_controller.dart';
import 'package:sanzar/core/data/catalog_repository.dart';
import 'package:sanzar/core/data/learning.dart';
import 'package:sanzar/core/data/study_tracker.dart';
import 'package:sanzar/core/settings/settings_controller.dart';

import 'support/fakes.dart';

class Harness {
  final FakeAuthGateway gw;
  final FakeApi api;
  final AuthController auth;
  final CatalogRepository catalog;
  final SettingsController settings;
  final StudyTracker tracker;
  Harness._(
    this.gw,
    this.api,
    this.auth,
    this.catalog,
    this.settings,
    this.tracker,
  );

  static Future<Harness> create(
    WidgetTester t, {
    Map<String, Object> prefs = const {'onboarded': true, 'lang': 'en'},
  }) async {
    SharedPreferences.setMockInitialValues(prefs);
    final p = await SharedPreferences.getInstance();
    final gw = FakeAuthGateway();
    final api = FakeApi();
    final client = ApiClient(
      base: 'https://api.test',
      tokenProvider: ({bool forceRefresh = false}) =>
          gw.idToken(forceRefresh: forceRefresh),
      client: api.client,
    );
    final auth = AuthController(
      gw,
      apiBase: 'https://api.test',
      apiClient: client,
    );
    final learning = LearningApi(client);
    final progress = ProgressStore(learning);
    final tracker = StudyTracker(learning, p, observeLifecycle: false);
    final h = Harness._(
      gw,
      api,
      auth,
      CatalogRepository(client, p),
      SettingsController(p),
      tracker,
    );
    t.view.physicalSize = const Size(1080, 2340);
    t.view.devicePixelRatio = 2.6;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      SanzarApp(
        auth: auth,
        catalog: h.catalog,
        settings: h.settings,
        learning: learning,
        progress: progress,
        tracker: tracker,
      ),
    );
    await t.pumpAndSettle();
    return h;
  }
}

void main() {
  testWidgets(
    'onboarding leads to setup-pending screen while auth is unconfigured',
    (t) async {
      final h = await Harness.create(t, prefs: {'lang': 'en'});
      expect(find.text('Your whole syllabus in one place'), findsOneWidget);
      await t.tap(find.text('Next'));
      await t.pumpAndSettle();
      await t.tap(find.text('Next'));
      await t.pumpAndSettle();
      expect(find.text('Free for every student'), findsOneWidget);
      await t.tap(find.text('Get started'));
      await t.pumpAndSettle();

      expect(find.text('Platform setup pending'), findsOneWidget);
      expect(
        find.textContaining(
          'Authentication and data services are not configured yet',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const Key('submit')), findsNothing);
      expect(h.api.requests, isEmpty);
    },
  );

  testWidgets('new account can continue after choosing a class', (t) async {
    final h = await Harness.create(t);
    h.api.me = {...h.api.me, 'level_id': null};
    await h.gw.signInWithEmail('student@example.com', 'correct-horse');
    await t.pumpAndSettle();
    h.auth.pendingClassChoice = true;
    h.auth.notifyListeners();
    await t.pumpAndSettle();

    expect(find.text('Choose your class'), findsOneWidget);
    await t.tap(find.text('Class 9'));
    await t.pumpAndSettle();
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();

    expect(h.api.me['level_id'], 'c9');
    expect(find.text('Home'), findsWidgets);
  });

  testWidgets(
    'library → book → chapter notes, with search and subject filter',
    (t) async {
      final h = await Harness.create(t);
      await h.gw.signInWithEmail('student@example.com', 'correct-horse');
      await t.pumpAndSettle();
      await t.tap(find.text('Library'));
      await t.pumpAndSettle();
      // Class 10 student sees Class 9-10 books but not HSC ones.
      expect(find.text('Physics'), findsWidgets);
      await t.enterText(find.byType(TextField).first, 'zzz-no-match');
      await t.pumpAndSettle();
      expect(find.text('No books for your class yet.'), findsOneWidget);
      await t.enterText(find.byType(TextField).first, 'Physics');
      await t.pumpAndSettle();
      await t.tap(
        find
            .descendant(of: find.byType(Card), matching: find.text('Physics'))
            .first,
      );
      await t.pumpAndSettle();
      expect(find.text('13 chapters'), findsWidgets);
      await t.tap(find.byType(ListTile).first);
      await t.pumpAndSettle();
      expect(find.text('Chapter 1'), findsOneWidget);
      expect(find.text('Physical quantities'), findsOneWidget);
      expect(find.text('Page 2'), findsOneWidget);
    },
  );

  testWidgets('profile: edit name, switch language to Bangla, sign out', (
    t,
  ) async {
    final h = await Harness.create(t);
    await h.gw.signInWithEmail('student@example.com', 'correct-horse');
    await t.pumpAndSettle();
    await t.tap(find.text('Profile'));
    await t.pumpAndSettle();
    expect(find.text('Rahim Uddin'), findsOneWidget);
    await t.tap(find.text('Edit profile'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextFormField).first, 'Rahim Ahmed');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(h.api.me['display_name'], 'Rahim Ahmed');
    expect(find.text('Rahim Ahmed'), findsOneWidget);

    await t.tap(find.text('English'));
    await t.pumpAndSettle();
    await t.tap(find.text('বাংলা').last);
    await t.pumpAndSettle();
    expect(find.text('প্রোফাইল'), findsWidgets);
    expect(h.api.me['locale'], 'bn');

    await t.scrollUntilVisible(
      find.text('লগ আউট'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await t.tap(find.text('লগ আউট'));
    await t.pumpAndSettle();
    expect(find.text('প্ল্যাটফর্ম সেটআপ বাকি'), findsOneWidget);
    expect(h.gw.calls, contains('signOut'));
  });

  testWidgets('auth actions are not exposed before auth setup', (t) async {
    final h = await Harness.create(t);
    expect(find.text('Platform setup pending'), findsOneWidget);
    expect(find.text('Create account'), findsNothing);
    expect(find.text('Continue with Google'), findsNothing);
    expect(h.gw.calls, isEmpty);
  });

  testWidgets('a new device takes the language saved on the account', (
    t,
  ) async {
    final h = await Harness.create(t, prefs: {'onboarded': true});
    expect(h.settings.langChosen, isFalse);
    await h.gw.signInWithEmail('student@example.com', 'correct-horse');
    await t.pumpAndSettle();
    expect(h.settings.lang, 'bn');
    expect(find.text('হ্যালো, Rahim'), findsOneWidget);
  });

  testWidgets(
    'delete account needs typing DELETE, then calls the API and auth gateway',
    (t) async {
      final h = await Harness.create(t);
      await h.gw.signInWithEmail('student@example.com', 'correct-horse');
      await t.pumpAndSettle();
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.scrollUntilVisible(
        find.text('Delete account'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await t.tap(find.text('Delete account'));
      await t.pumpAndSettle();
      final del = find.widgetWithText(TextButton, 'Delete');
      expect(t.widget<TextButton>(del).onPressed, isNull);
      await t.enterText(find.byType(TextField).last, 'DELETE');
      await t.pumpAndSettle();
      await t.tap(del);
      await t.pumpAndSettle();
      expect(
        h.api.requests.any(
          (r) => r.method == 'DELETE' && r.url.path == '/v1/me',
        ),
        isTrue,
      );
      expect(h.gw.calls, contains('delete'));
      expect(find.text('Platform setup pending'), findsOneWidget);
    },
  );

  testWidgets(
    'bottom nav: five places with the AI Tutor in the centre; tutor cites notes and opens the chapter',
    (t) async {
      final h = await Harness.create(t);
      await h.gw.signInWithEmail('student@example.com', 'correct-horse');
      await t.pumpAndSettle();
      for (final label in [
        'Home',
        'Library',
        'AI Tutor',
        'Community',
        'Profile',
      ]) {
        expect(find.text(label), findsWidgets);
      }
      await t.tap(find.byKey(const Key('tutorTab')));
      await t.pumpAndSettle();
      await t.enterText(
        find.byKey(const Key('tutorInput')),
        'What are SI units?',
      );
      await t.tap(find.byKey(const Key('tutorSend')));
      await t.pumpAndSettle();
      expect(find.text('SI units'), findsOneWidget);
      expect(
        find.textContaining('Reference: Physics – Chapter 1'),
        findsOneWidget,
      );
      expect(find.textContaining('(Page 4)'), findsOneWidget);
      await t.enterText(
        find.byKey(const Key('tutorInput')),
        'Who won the football world cup?',
      );
      await t.tap(find.byKey(const Key('tutorSend')));
      await t.pumpAndSettle();
      expect(find.textContaining("couldn't find"), findsOneWidget);
      await t.tap(find.text('Open chapter').first);
      await t.pumpAndSettle();
      expect(find.text('Physical quantities'), findsOneWidget);
    },
  );

  testWidgets('wide screens use desktop navigation and display controls', (
    t,
  ) async {
    final h = await Harness.create(t);
    await h.gw.signInWithEmail('student@example.com', 'correct-horse');
    await t.pumpAndSettle();
    t.view.physicalSize = const Size(1392, 1350);
    t.view.devicePixelRatio = 1.5;
    await t.pumpAndSettle();

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byKey(const Key('tutorTab')), findsNothing);
    expect(find.byTooltip('Theme'), findsOneWidget);
    expect(find.byTooltip('Language'), findsOneWidget);
  });

  testWidgets(
    'chapter: mark notes done earns XP once; chapter quiz → server-graded result with review',
    (t) async {
      final h = await Harness.create(t);
      await h.gw.signInWithEmail('student@example.com', 'correct-horse');
      await t.pumpAndSettle();
      h.auth.status; // signed in
      final router = GoRouter.of(t.element(find.byType(Scaffold).first));
      router.go('/library/book/phy-910/chapter/phy-910-01');
      await t.pumpAndSettle();
      await t.scrollUntilVisible(
        find.text('Mark as done'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await t.tap(find.text('Mark as done'));
      await t.pumpAndSettle();
      expect(h.api.completed, contains('notes:phy-910-01'));
      expect(find.text('Done'), findsWidgets);
      expect(find.textContaining('+10 XP'), findsOneWidget);
      await t.pump(const Duration(seconds: 5)); // let the message go away
      await t.pumpAndSettle();

      await t.scrollUntilVisible(
        find.text('Chapter quiz'),
        -300,
        scrollable: find.byType(Scrollable).first,
      );
      await t.tap(find.text('Chapter quiz'));
      await t.pumpAndSettle();
      expect(find.text('Which is a fundamental quantity?'), findsOneWidget);
      expect(find.byKey(const Key('timer')), findsOneWidget);
      await t.tap(find.text('Electric current'));
      await t.tap(find.byKey(const Key('next')));
      await t.pumpAndSettle();
      await t.tap(find.text('Celsius'));
      await t.tap(find.byKey(const Key('submitExam')));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(FilledButton, 'Submit').last);
      await t.pumpAndSettle();
      expect(find.byKey(const Key('score')), findsOneWidget);
      expect(find.text('1 / 2'), findsOneWidget);
      expect(find.text('Not passed'), findsOneWidget);
      expect(find.textContaining('Correct answer: Kelvin'), findsOneWidget);
    },
  );

  testWidgets('community: post, like and comment', (t) async {
    final h = await Harness.create(t);
    await h.gw.signInWithEmail('student@example.com', 'correct-horse');
    await t.pumpAndSettle();
    await t.tap(find.text('Community'));
    await t.pumpAndSettle();
    expect(find.text('No posts yet. Start the conversation!'), findsOneWidget);
    await t.tap(find.byKey(const Key('compose')));
    await t.pumpAndSettle();
    await t.enterText(
      find.byKey(const Key('postText')),
      'How do I balance chemical equations?',
    );
    await t.enterText(
      find.byKey(const Key('attachmentLink')),
      'https://example.com/worksheet.pdf',
    );
    await t.tap(find.byIcon(Icons.add_link_rounded));
    await t.pumpAndSettle();
    expect(find.text('example.com'), findsOneWidget);
    await t.tap(find.byKey(const Key('publish')));
    await t.pumpAndSettle();
    expect(find.text('How do I balance chemical equations?'), findsOneWidget);
    expect(find.text('example.com'), findsOneWidget);
    await t.pump(const Duration(seconds: 5));
    await t.pumpAndSettle();
    await t.tap(find.byIcon(Icons.favorite_border_rounded));
    await t.pumpAndSettle();
    expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
    await t.tap(find.byIcon(Icons.chat_bubble_outline_rounded));
    await t.pumpAndSettle();
    await t.enterText(
      find.byKey(const Key('commentInput')),
      'Count atoms on both sides.',
    );
    await t.tap(find.byKey(const Key('sendComment')));
    await t.pumpAndSettle();
    expect(find.textContaining('Count atoms on both sides.'), findsOneWidget);
    expect(h.api.comments['po0'], hasLength(1));
  });

  testWidgets('home shows progress, notifications and leaderboard', (t) async {
    final h = await Harness.create(t);
    await h.gw.signInWithEmail('student@example.com', 'correct-horse');
    await t.pumpAndSettle();
    expect(find.text('2-day streak'), findsOneWidget);
    expect(find.text('0 of 60 min'), findsOneWidget);
    await t.tap(find.byKey(const Key('bell')));
    await t.pumpAndSettle();
    expect(find.text('Achievement unlocked: First Step'), findsOneWidget);
    await t.tap(find.text('Achievement unlocked: First Step'));
    await t.pumpAndSettle();
    expect(h.api.requests.any((r) => r.url.path == '/v1/notifications/read'), isTrue);
    await t.tap(find.text('Leaderboard'));
    await t.pumpAndSettle();
    expect(find.text('Your rank: #2'), findsOneWidget);
    expect(find.text('Nadia'), findsOneWidget);
    expect(h.api.requests.any((r) => r.url.path == '/v1/leaderboard'), isTrue);
  });
}
