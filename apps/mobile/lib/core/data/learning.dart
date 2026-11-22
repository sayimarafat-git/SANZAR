import 'package:flutter/foundation.dart';
import '../api/api_client.dart';

String _s(Object? v, [String d = '']) => v == null ? d : '$v';
int _i(Object? v, [int d = 0]) => v is num ? v.toInt() : int.tryParse('$v') ?? d;
Map<String, dynamic> _m(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Map<String, dynamic>> _l(Object? v) => [for (final x in (v as List? ?? const [])) _m(x)];

class Achievement {
  final String id, title, desc;
  final int? unlockedAt;
  const Achievement(this.id, this.title, this.desc, this.unlockedAt);
}

class AttemptSummary {
  final String id, examId, title, type, status;
  final int? score, total;
  final int startedAt;
  const AttemptSummary(this.id, this.examId, this.title, this.type, this.status, this.score, this.total, this.startedAt);
  factory AttemptSummary.fromJson(Map<String, dynamic> j) => AttemptSummary(_s(j['id']), _s(j['examId']), _s(j['title']), _s(j['type']), _s(j['status']),
      j['score'] == null ? null : _i(j['score']), j['total'] == null ? null : _i(j['total']), _i(j['startedAt']));
}

class Progress {
  final int xp, level, levelXp, intoLevel, weekXp, todaySec, goalSec, totalSec, streak;
  final List<(String, int)> series;
  final List<(String, int)> bySubject;
  final Set<String> completed;
  final List<Achievement> achievements;
  final List<AttemptSummary> attempts;
  const Progress({required this.xp, required this.level, required this.levelXp, required this.intoLevel, required this.weekXp, required this.todaySec, required this.goalSec,
      required this.totalSec, required this.streak, required this.series, required this.bySubject, required this.completed, required this.achievements, required this.attempts});
  factory Progress.fromJson(Map<String, dynamic> j) => Progress(
        xp: _i(j['xp']), level: _i(j['level'], 1), levelXp: _i(j['levelXp'], 2000), intoLevel: _i(j['intoLevel']), weekXp: _i(j['weekXp']),
        todaySec: _i(j['todaySec']), goalSec: _i(j['goalSec'], 3600), totalSec: _i(j['totalSec']), streak: _i(j['streak']),
        series: [for (final d in _l(j['series'])) (_s(d['day']), _i(d['sec']))],
        bySubject: [for (final d in _l(j['bySubject'])) (_s(d['subjectId']), _i(d['sec']))],
        completed: {for (final c in _l(j['completions'])) _s(c['itemId'])},
        achievements: [for (final a in _l(j['achievements'])) Achievement(_s(a['id']), _s(a['title']), _s(a['desc']), a['unlockedAt'] == null ? null : _i(a['unlockedAt']))],
        attempts: [for (final a in _l(j['attempts'])) AttemptSummary.fromJson(a)],
      );
}

class TutorReference {
  final String bookId, bookTitle, subjectId, chapterId, chapterTitle;
  final int chapterNumber, section;
  final int? page;
  const TutorReference(this.bookId, this.bookTitle, this.subjectId, this.chapterId, this.chapterTitle, this.chapterNumber, this.section, this.page);
  factory TutorReference.fromJson(Map<String, dynamic> j) => TutorReference(_s(j['bookId']), _s(j['bookTitle']), _s(j['subjectId']), _s(j['chapterId']), _s(j['chapterTitle']),
      _i(j['chapterNumber']), _i(j['section']), j['page'] == null ? null : _i(j['page']));
}

class TutorAnswer {
  final bool found;
  final String? heading;
  final String text;
  final TutorReference? reference;
  const TutorAnswer(this.found, this.heading, this.text, this.reference);
  factory TutorAnswer.fromJson(Map<String, dynamic> j) => TutorAnswer(j['found'] == true, j['heading'] as String?, _s(j['text']), j['reference'] == null ? null : TutorReference.fromJson(_m(j['reference'])));
}

class ExamQuestion {
  final String id, text;
  final List<String> options;
  final int? answer, chosen;
  final String explanation;
  const ExamQuestion(this.id, this.text, this.options, {this.answer, this.chosen, this.explanation = ''});
  factory ExamQuestion.fromJson(Map<String, dynamic> j) => ExamQuestion(_s(j['id']), _s(j['text']), [for (final o in (j['options'] as List? ?? const [])) _s(o)],
      answer: j['answer'] == null ? null : _i(j['answer']), chosen: j['chosen'] == null ? null : _i(j['chosen']), explanation: _s(j['explanation']));
}

class ExamSession {
  final String attemptId, examId, title;
  final int endsAt, serverTime;
  final List<ExamQuestion> questions;
  const ExamSession(this.attemptId, this.examId, this.title, this.endsAt, this.serverTime, this.questions);
  factory ExamSession.fromJson(Map<String, dynamic> j) {
    final a = _m(j['attempt']);
    return ExamSession(_s(a['id']), _s(a['examId']), _s(a['title']), _i(a['endsAt']), _i(a['serverTime']), [for (final q in _l(j['questions'])) ExamQuestion.fromJson(q)]);
  }
}

class AttemptResult {
  final AttemptSummary attempt;
  final bool passed;
  final int passPct, xpAwarded;
  final List<ExamQuestion> review;
  final List<String> unlocked;
  const AttemptResult(this.attempt, this.passed, this.passPct, this.review, this.xpAwarded, this.unlocked);
  factory AttemptResult.fromJson(Map<String, dynamic> j) {
    final a = _m(j['attempt']);
    return AttemptResult(AttemptSummary.fromJson(a), a['passed'] == true, _i(a['passPct'], 60), [for (final q in _l(j['review'])) ExamQuestion.fromJson(q)], _i(j['xpAwarded']),
        [for (final u in (j['unlocked'] as List? ?? const [])) _s(u)]);
  }
}

class LeaderEntry {
  final int rank, xp;
  final String? uid;
  final String name;
  final bool me;
  const LeaderEntry(this.rank, this.uid, this.name, this.xp, this.me);
  factory LeaderEntry.fromJson(Map<String, dynamic> j) => LeaderEntry(_i(j['rank']), j['uid'] as String?, _s(j['name']), _i(j['xp']), j['me'] == true);
}

class PollOption {
  final String text;
  final int votes;
  const PollOption(this.text, this.votes);
}

class Poll {
  final String question;
  final List<PollOption> options;
  final int? myVote;
  const Poll(this.question, this.options, this.myVote);
  factory Poll.fromJson(Map<String, dynamic> j) => Poll(_s(j['question']), [for (final o in _l(j['options'])) PollOption(_s(o['text']), _i(o['votes']))], j['myVote'] == null ? null : _i(j['myVote']));
  int get total => options.fold(0, (a, o) => a + o.votes);
}

class PostAttachment {
  final String? key;
  final String? url;
  final String name, mime;

  const PostAttachment({
    this.key,
    this.url,
    required this.name,
    required this.mime,
  });

  factory PostAttachment.fromJson(Map<String, dynamic> json) =>
      PostAttachment(
        key: json['key'] as String?,
        url: json['url'] as String?,
        name: _s(json['name'], 'Attachment'),
        mime: _s(json['mime'], 'application/octet-stream'),
      );

  Map<String, dynamic> toJson() => {
        if (key != null) 'key': key,
        if (url != null) 'url': url,
        'name': name,
        'mime': mime,
      };
}

class Post {
  final String id, authorUid, authorName, text, category;
  final int likeCount, commentCount, createdAt;
  final bool likedByMe, mine;
  final Poll? poll;
  final List<PostAttachment> attachments;
  const Post({required this.id, required this.authorUid, required this.authorName, required this.text, required this.category, required this.likeCount,
      required this.commentCount, required this.createdAt, required this.likedByMe, required this.mine, this.poll, this.attachments = const []});
  factory Post.fromJson(Map<String, dynamic> j) => Post(
        id: _s(j['id']), authorUid: _s(j['authorUid']), authorName: _s(j['authorName']), text: _s(j['text']), category: _s(j['category'], 'general'),
        likeCount: _i(j['likeCount']), commentCount: _i(j['commentCount']), createdAt: _i(j['createdAt']), likedByMe: j['likedByMe'] == true, mine: j['mine'] == true,
        poll: j['poll'] == null ? null : Poll.fromJson(_m(j['poll'])),
        attachments: [for (final a in _l(j['attachments'])) PostAttachment.fromJson(a)],
      );
  Post copyWith({int? likeCount, bool? likedByMe, int? commentCount, Poll? poll}) => Post(
        id: id, authorUid: authorUid, authorName: authorName, text: text, category: category, createdAt: createdAt, mine: mine,
        likeCount: likeCount ?? this.likeCount, likedByMe: likedByMe ?? this.likedByMe, commentCount: commentCount ?? this.commentCount, poll: poll ?? this.poll, attachments: attachments);
}

class Comment {
  final String id, authorUid, authorName, text;
  final int createdAt;
  final bool mine;
  const Comment(this.id, this.authorUid, this.authorName, this.text, this.createdAt, this.mine);
  factory Comment.fromJson(Map<String, dynamic> j) => Comment(_s(j['id']), _s(j['authorUid']), _s(j['authorName']), _s(j['text']), _i(j['createdAt']), j['mine'] == true);
}

class AppNotification {
  final String id, title, body;
  final bool read;
  final int createdAt;
  const AppNotification(this.id, this.title, this.body, this.read, this.createdAt);
  AppNotification copyWith({bool? read}) =>
      AppNotification(id, title, body, read ?? this.read, createdAt);
}

class PublicProfile {
  final String uid, name, visibility;
  final String? levelId, institution;
  final int? xp;
  final int followers, following;
  final bool isFollowing, limited;
  const PublicProfile(this.uid, this.name, this.visibility, this.levelId, this.institution, this.xp, this.followers, this.following, this.isFollowing, this.limited);
}

/// Typed calls for Phases 4–9. All scoring happens on the server.
class LearningApi {
  final ApiClient api;
  const LearningApi(this.api);

  Future<Progress> progress() async => Progress.fromJson(await api.get('/v1/progress'));
  Future<Map<String, dynamic>> studyEvents(List<Map<String, Object?>> events) => api.post('/v1/study/events', {'events': events});
  Future<Map<String, dynamic>> complete(String itemId) => api.post('/v1/completions', {'itemId': itemId});
  Future<TutorAnswer> ask(String q, {TutorReference? prev}) async =>
      TutorAnswer.fromJson(await api.post('/v1/tutor/ask', {'q': q, if (prev != null) 'prev': {'chapterId': prev.chapterId, 'section': prev.section}}));
  Future<ExamSession> startExam(String examId) async => ExamSession.fromJson(await api.post('/v1/exams/$examId/start', const {}));
  Future<AttemptResult> submit(String attemptId, Map<String, int> answers) async => AttemptResult.fromJson(await api.post('/v1/attempts/$attemptId/submit', {'answers': answers}));
  Future<AttemptResult> attempt(String attemptId) async => AttemptResult.fromJson(await api.get('/v1/attempts/$attemptId'));
  Future<List<AttemptSummary>> attempts() async => [for (final a in _l((await api.get('/v1/attempts'))['attempts'])) AttemptSummary.fromJson(a)];
  Future<(List<LeaderEntry>, LeaderEntry?)> leaderboard(String period, {String? level}) async {
    final j = await api.get('/v1/leaderboard?period=$period${level != null ? '&level=$level' : ''}');
    return ([for (final e in _l(j['entries'])) LeaderEntry.fromJson(e)], j['me'] == null ? null : LeaderEntry.fromJson(_m(j['me'])));
  }

  Future<(List<Post>, int?)> feed({int? before, String? category, String? author}) async {
    final q = [if (before != null) 'before=$before', if (category != null) 'category=$category', if (author != null) 'author=$author'].join('&');
    final j = await api.get('/v1/feed${q.isEmpty ? '' : '?$q'}');
    return ([for (final p in _l(j['posts'])) Post.fromJson(p)], j['next'] == null ? null : _i(j['next']));
  }

  Future<PostAttachment> uploadAttachment(
    List<int> bytes, {
    required String name,
    required String mime,
  }) async {
    final uploaded = await api.postBytes(
      '/v1/uploads?name=${Uri.encodeQueryComponent(name)}',
      bytes,
      contentType: mime,
    );
    return PostAttachment.fromJson(uploaded);
  }

  Future<Map<String, dynamic>> createPost({
    required String text,
    String category = 'general',
    String? pollQuestion,
    List<String>? pollOptions,
    List<PostAttachment> attachments = const [],
  }) =>
      api.post('/v1/posts', {
        'text': text,
        'category': category,
        'attachments': [for (final attachment in attachments) attachment.toJson()],
        if (pollQuestion != null && pollOptions != null)
          'poll': {'question': pollQuestion, 'options': pollOptions},
      });
  Future<void> deletePost(String id) => api.delete('/v1/posts/$id');
  Future<(bool, int)> like(String id) async {
    final j = await api.post('/v1/posts/$id/like', const {});
    return (j['liked'] == true, _i(j['likeCount']));
  }

  Future<Poll> vote(String id, int option) async => Poll.fromJson(_m((await api.post('/v1/posts/$id/vote', {'option': option}))['poll']));
  Future<List<Comment>> comments(String id) async => [for (final c in _l((await api.get('/v1/posts/$id/comments'))['comments'])) Comment.fromJson(c)];
  Future<Comment> addComment(String id, String text) async => Comment.fromJson(_m((await api.post('/v1/posts/$id/comments', {'text': text}))['comment']));
  Future<void> deleteComment(String id) => api.delete('/v1/comments/$id');
  Future<void> report(String type, String id, String reason) => api.post('/v1/reports', {'targetType': type, 'targetId': id, 'reason': reason});
  Future<void> setFollow(String uid, bool on) => on ? api.post('/v1/users/$uid/follow', const {}) : api.delete('/v1/users/$uid/follow');
  Future<void> setBlock(String uid, bool on) => on ? api.post('/v1/users/$uid/block', const {}) : api.delete('/v1/users/$uid/block');
  Future<PublicProfile> user(String uid) async {
    final j = await api.get('/v1/users/$uid');
    final u = _m(j['user']);
    return PublicProfile(_s(u['uid']), _s(u['name']), _s(u['visibility']), u['levelId'] as String?, u['institution'] as String?, u['xp'] == null ? null : _i(u['xp']),
        _i(j['followers']), _i(j['following']), j['isFollowing'] == true, j['limited'] == true);
  }

  Future<(List<AppNotification>, int)> notifications() async {
    final j = await api.get('/v1/notifications');
    return ([for (final n in _l(j['notifications'])) AppNotification(_s(n['id']), _s(n['title']), _s(n['body']), n['read'] == true, _i(n['createdAt']))], _i(j['unread']));
  }

  Future<void> markNotificationsRead() => api.post('/v1/notifications/read', const {});
}

/// Holds the latest progress so Home, Profile and Chapter screens agree.
class ProgressStore extends ChangeNotifier {
  final LearningApi api;
  ProgressStore(this.api);
  Progress? progress;
  List<AppNotification> notifications = const [];
  int unread = 0;
  ApiException? error;
  bool _loading = false;

  Future<void> refresh() async {
    if (_loading) return;
    _loading = true;
    try {
      progress = await api.progress();
      final result = await api.notifications();
      notifications = result.$1;
      unread = result.$2;
      error = null;
    } on ApiException catch (e) {
      error = e;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> markNotificationsRead() async {
    await api.markNotificationsRead();
    notifications = [for (final n in notifications) n.copyWith(read: true)];
    unread = 0;
    notifyListeners();
  }

  void clear() {
    progress = null;
    notifications = const [];
    unread = 0;
    notifyListeners();
  }
}
