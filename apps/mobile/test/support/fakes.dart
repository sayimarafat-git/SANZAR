import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sanzar/core/auth/auth_gateway.dart';

String fixture(String name) => File('test/fixtures/$name').readAsStringSync();

/// In-memory stand-in for the selected authentication gateway.
class FakeAuthGateway implements AuthGateway {
  final _ctrl = StreamController<AuthAccount?>.broadcast(sync: true);
  AuthAccount? _current;
  final Map<String, String> passwords = {
    'student@example.com': 'correct-horse',
  };
  bool verifiedOnReload = true;
  bool googleIsNew = false;
  final List<String> calls = [];
  String token = 'token-1';

  void emit(AuthAccount? a) {
    _current = a;
    _ctrl.add(a);
  }

  @override
  Stream<AuthAccount?> changes() async* {
    yield _current;
    yield* _ctrl.stream;
  }

  @override
  AuthAccount? get current => _current;
  @override
  Future<String?> idToken({bool forceRefresh = false}) async {
    if (forceRefresh) calls.add('refresh');
    return _current == null ? null : token;
  }

  @override
  Future<void> signInWithEmail(String email, String password) async {
    calls.add('signIn:$email');
    if (passwords[email] != password)
      throw const AuthFailure('wrongCredentials');
    emit(
      AuthAccount(
        uid: 'student-1',
        email: email,
        emailVerified: true,
        isPassword: true,
      ),
    );
  }

  @override
  Future<void> registerWithEmail(String email, String password) async {
    calls.add('register:$email');
    if (passwords.containsKey(email)) throw const AuthFailure('emailInUse');
    passwords[email] = password;
    emit(AuthAccount(uid: 'new-1', email: email, isPassword: true));
  }

  @override
  Future<bool> signInWithGoogle() async {
    calls.add('google');
    emit(
      const AuthAccount(
        uid: 'student-1',
        email: 'student@example.com',
        emailVerified: true,
      ),
    );
    return googleIsNew;
  }

  @override
  Future<void> sendPasswordReset(String email) async =>
      calls.add('reset:$email');
  @override
  Future<void> sendEmailVerification() async => calls.add('verify');
  @override
  Future<void> reload() async {
    final c = _current;
    if (c != null && verifiedOnReload)
      _current = AuthAccount(
        uid: c.uid,
        email: c.email,
        displayName: c.displayName,
        emailVerified: true,
        isPassword: c.isPassword,
      );
  }

  @override
  Future<void> signOut() async {
    calls.add('signOut');
    emit(null);
  }

  @override
  Future<void> deleteAccount() async {
    calls.add('delete');
    emit(null);
  }
}

/// Fake Sanzar API backed by the contract fixtures.
class FakeApi {
  final requests = <http.Request>[];
  Map<String, dynamic> me =
      (jsonDecode(fixture('me.json')) as Map<String, dynamic>)['user']
          as Map<String, dynamic>;
  String catalogBody = fixture('catalog.json');
  String etag = '"v1"';
  bool offline = false;
  final completed = <String>{};
  final studyEvents = <Map<String, dynamic>>[];
  int xp = 0;
  final posts = <Map<String, dynamic>>[];
  final comments = <String, List<Map<String, dynamic>>>{};
  final attempts = <String, Map<String, dynamic>>{};
  static const examKey = {'q1': 1, 'q2': 0};

  Map<String, dynamic> progress() => {
    'xp': xp,
    'level': 1,
    'levelXp': 2000,
    'intoLevel': xp,
    'weekXp': xp,
    'todaySec': studyEvents.fold<int>(0, (a, e) => a + (e['sec'] as int)),
    'goalSec': 3600,
    'totalSec': 0,
    'streak': 2,
    'series': [
      for (var i = 1; i <= 7; i++) {'day': '2026-11-0$i', 'sec': i * 60},
    ],
    'bySubject': [
      {'subjectId': 'physics', 'sec': 1200},
    ],
    'completions': [
      for (final c in completed) {'itemId': c},
    ],
    'achievements': [
      {
        'id': 'first-step',
        'title': 'First Step',
        'desc': 'Complete your first chapter item',
        'unlockedAt': completed.isEmpty ? null : 1,
      },
    ],
    'attempts': [],
  };

  late final client = MockClient((req) async {
    requests.add(req);
    if (offline) throw http.ClientException('offline');
    if (req.headers['authorization'] == null)
      return http.Response(
        '{"error":{"code":"unauthenticated","message":"Sign in"}}',
        401,
      );
    switch ((req.method, req.url.path)) {
      case ('GET', '/v1/me'):
        return _json({'user': me});
      case ('PATCH', '/v1/me'):
        me = {...me, ...(jsonDecode(req.body) as Map<String, dynamic>)};
        return _json({'user': me});
      case ('DELETE', '/v1/me'):
        return _json({'deleted': true});
      case ('GET', '/v1/progress'):
        return _json(progress());
      case ('GET', '/v1/notifications'):
        return _json({
          'notifications': [
            {
              'id': 'n1',
              'title': 'Achievement unlocked: First Step',
              'body': '',
              'read': false,
              'created_at': 1,
            },
          ],
          'unread': 1,
        });
      case ('POST', '/v1/notifications/read'):
        return _json({'ok': true});
      case ('POST', '/v1/study/events'):
        final evs = ((jsonDecode(req.body) as Map)['events'] as List)
            .cast<Map<String, dynamic>>();
        studyEvents.addAll(evs);
        return _json({
          'results': [
            for (final e in evs) {'id': e['id'], 'acceptedSec': e['sec']},
          ],
          'xpAwarded': 0,
          'unlocked': [],
        });
      case ('POST', '/v1/completions'):
        final id = (jsonDecode(req.body) as Map)['itemId'] as String;
        final first = completed.add(id);
        if (first) xp += 10;
        return _json({
          'itemId': id,
          'completed': true,
          'xpAwarded': first ? 10 : 0,
          'unlocked': [],
        });
      case ('POST', '/v1/tutor/ask'):
        final q = (jsonDecode(req.body) as Map)['q'] as String;
        if (q.contains('football'))
          return _json({
            'found': false,
            'text': "I couldn't find this in Sanzar's notes yet.",
          });
        return _json({
          'found': true,
          'heading': 'SI units',
          'text':
              'The International System of Units (SI) has seven base units.',
          'reference': {
            'bookId': 'phy-910',
            'bookTitle': 'Physics',
            'subjectId': 'physics',
            'chapterId': 'phy-910-01',
            'chapterNumber': 1,
            'chapterTitle': 'Physical Quantities and Measurement',
            'page': 4,
            'section': 1,
          },
        });
      case ('GET', '/v1/attempts'):
        return _json({
          'attempts': [for (final a in attempts.values) a['attempt']],
        });
      case ('GET', '/v1/leaderboard'):
        return _json({
          'period': 'weekly',
          'entries': [
            {'rank': 1, 'uid': 'x', 'name': 'Nadia', 'xp': 90, 'me': false},
            {
              'rank': 2,
              'uid': 'student-1',
              'name': 'Rahim Uddin',
              'xp': xp,
              'me': true,
            },
          ],
          'me': {
            'rank': 2,
            'uid': 'student-1',
            'name': 'Rahim Uddin',
            'xp': xp,
            'me': true,
          },
        });
      case ('GET', '/v1/feed'):
        return _json({'posts': posts.reversed.toList(), 'next': null});
      case ('POST', '/v1/posts'):
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        final post = {
          'id': 'po${posts.length}',
          'authorUid': 'student-1',
          'authorName': 'Rahim Uddin',
          'text': b['text'],
          'category': b['category'],
          'likeCount': 0,
          'commentCount': 0,
          'likedByMe': false,
          'createdAt': DateTime.now().millisecondsSinceEpoch,
          'mine': true,
          'poll': null,
          'attachments': b['attachments'] ?? [],
        };
        posts.add(post);
        return _json({'post': post, 'xpAwarded': 5, 'unlocked': []});
      case ('GET', '/v1/groups/mine'):
        return _json({'groupIds': []});
      case ('GET', '/v1/catalog'):
        if (req.headers['if-none-match'] == etag)
          return http.Response('', 304, headers: {'etag': etag});
        return http.Response.bytes(
          utf8.encode(catalogBody),
          200,
          headers: {
            'etag': etag,
            'content-type': 'application/json; charset=utf-8',
          },
        );
    }
    final path = req.url.path;
    final like = RegExp(r'^/v1/posts/(\w+)/like$').firstMatch(path);
    if (like != null && req.method == 'POST') {
      final p = posts.firstWhere((x) => x['id'] == like[1]);
      p['likedByMe'] = !(p['likedByMe'] as bool);
      p['likeCount'] =
          (p['likeCount'] as int) + (p['likedByMe'] as bool ? 1 : -1);
      return _json({'liked': p['likedByMe'], 'likeCount': p['likeCount']});
    }
    final cm = RegExp(r'^/v1/posts/(\w+)/comments$').firstMatch(path);
    if (cm != null) {
      final list = comments.putIfAbsent(cm[1]!, () => []);
      if (req.method == 'GET') return _json({'comments': list});
      final c = {
        'id': 'c${list.length}',
        'authorUid': 'student-1',
        'authorName': 'Rahim Uddin',
        'text': (jsonDecode(req.body) as Map)['text'],
        'createdAt': DateTime.now().millisecondsSinceEpoch,
        'mine': true,
      };
      list.add(c);
      posts.firstWhere((x) => x['id'] == cm[1])['commentCount'] = list.length;
      return _json({'comment': c});
    }
    final start = RegExp(r'^/v1/exams/([\w-]+)/start$').firstMatch(path);
    if (start != null) {
      final id = 'at${attempts.length}';
      attempts[id] = {'examId': start[1]};
      return _json({
        'attempt': {
          'id': id,
          'examId': start[1],
          'title': 'Chapter quiz',
          'startedAt': 0,
          'endsAt': DateTime.now().millisecondsSinceEpoch + 180000,
          'serverTime': DateTime.now().millisecondsSinceEpoch,
        },
        'questions': [
          {
            'id': 'q1',
            'text': 'Which is a fundamental quantity?',
            'options': ['Velocity', 'Electric current'],
          },
          {
            'id': 'q2',
            'text': 'SI unit of temperature?',
            'options': ['Kelvin', 'Celsius'],
          },
        ],
      });
    }
    final submit = RegExp(r'^/v1/attempts/(\w+)/submit$').firstMatch(path);
    if (submit != null) {
      final answers = ((jsonDecode(req.body) as Map)['answers'] as Map)
          .cast<String, int>();
      final score = examKey.entries
          .where((e) => answers[e.key] == e.value)
          .length;
      final first = attempts.values.where((a) => a['attempt'] != null).isEmpty;
      final res = {
        'attempt': {
          'id': submit[1],
          'examId': 'cq-phy-910-01',
          'title': 'Chapter quiz',
          'type': 'chapter_quiz',
          'status': 'graded',
          'score': score,
          'total': 2,
          'startedAt': 0,
          'passPct': 60,
          'passed': score * 100 >= 120,
        },
        'review': [
          {
            'id': 'q1',
            'text': 'Which is a fundamental quantity?',
            'options': ['Velocity', 'Electric current'],
            'answer': 1,
            'explanation': 'Current is an SI base quantity.',
            'chosen': answers['q1'],
          },
          {
            'id': 'q2',
            'text': 'SI unit of temperature?',
            'options': ['Kelvin', 'Celsius'],
            'answer': 0,
            'explanation': '',
            'chosen': answers['q2'],
          },
        ],
        'xpAwarded': first ? score * 5 : 0,
        'unlocked': [],
      };
      attempts[submit[1]!] = res;
      return _json(res);
    }
    final att = RegExp(r'^/v1/attempts/(\w+)$').firstMatch(path);
    if (att != null && attempts[att[1]]?['attempt'] != null)
      return _json(attempts[att[1]]!);
    return http.Response(
      '{"error":{"code":"not-found","message":"Not found"}}',
      404,
    );
  });

  http.Response _json(Object o) => http.Response.bytes(
    utf8.encode(jsonEncode(o)),
    200,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}
