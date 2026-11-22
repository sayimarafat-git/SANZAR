/// Plain models parsed from the API's JSON. Unknown fields are ignored so older
/// apps keep working when the API adds data.
String _s(Object? v, [String d = '']) => v == null ? d : '$v';
int _i(Object? v, [int d = 0]) => v is num ? v.toInt() : int.tryParse('$v') ?? d;

class Profile {
  final String uid, email, displayName, role, locale, visibility;
  final String? photoUrl, levelId, group, institution;
  final bool blocked;
  const Profile({required this.uid, required this.email, required this.displayName, required this.role, required this.locale, required this.visibility, this.photoUrl, this.levelId, this.group, this.institution, this.blocked = false});
  factory Profile.fromJson(Map<String, dynamic> j) => Profile(
        uid: _s(j['uid']), email: _s(j['email']), displayName: _s(j['display_name']), role: _s(j['role'], 'student'),
        locale: _s(j['locale'], 'bn'), visibility: _s(j['profile_visibility'], 'public'), photoUrl: j['photo_url'] as String?,
        levelId: j['level_id'] as String?, group: j['grp'] as String?, institution: j['institution'] as String?, blocked: _i(j['blocked']) == 1 || j['blocked'] == true,
      );
  bool get isStaff => role != 'student';
}

class Named {
  final String id, en, bn, zh;
  const Named(this.id, this.en, this.bn, this.zh);
  String name(String lang) => (lang == 'bn' ? bn : lang == 'zh' ? zh : en).isNotEmpty ? (lang == 'bn' ? bn : lang == 'zh' ? zh : en) : en;
}

class Level extends Named {
  const Level(super.id, super.en, super.bn, super.zh);
  factory Level.fromJson(Map<String, dynamic> j) => Level(_s(j['id']), _s(j['name_en']), _s(j['name_bn']), _s(j['name_zh']));
}

class Subject extends Named {
  final String icon, color;
  const Subject(super.id, super.en, super.bn, super.zh, this.icon, this.color);
  factory Subject.fromJson(Map<String, dynamic> j) => Subject(_s(j['id']), _s(j['name_en']), _s(j['name_bn']), _s(j['name_zh']), _s(j['icon']), _s(j['color']));
}

class Resource {
  final String id, type, title;
  final String? url;
  final int pages, version;
  const Resource(this.id, this.type, this.title, this.url, this.pages, [this.version = 1]);
  factory Resource.fromJson(Map<String, dynamic> j) => Resource(_s(j['id']), _s(j['type']), _s(j['title']), j['url'] as String?, _i(j['pages']), _i(j['version'], 1));
}

class Chapter {
  final String id, title;
  final int number, questionCount;
  final bool hasNotes;
  final List<Resource> resources;
  const Chapter(this.id, this.number, this.title, this.hasNotes, this.questionCount, this.resources);
  factory Chapter.fromJson(Map<String, dynamic> j) => Chapter(_s(j['id']), _i(j['number'], 1), _s(j['title']), j['hasNotes'] == true, _i(j['questionCount']),
      [for (final r in (j['resources'] as List? ?? const [])) Resource.fromJson(Map<String, dynamic>.from(r as Map))]);
}

class Book {
  final String id, title, subjectId, edition, author;
  final List<String> cover, levels;
  final int? featuredRank;
  final List<Chapter> chapters;
  const Book({required this.id, required this.title, required this.subjectId, required this.edition, required this.author, required this.cover, required this.levels, required this.chapters, this.featuredRank});
  factory Book.fromJson(Map<String, dynamic> j) => Book(
        id: _s(j['id']), title: _s(j['title']), subjectId: _s(j['subjectId'], 'others'), edition: _s(j['edition']), author: _s(j['author']),
        cover: [for (final c in (j['cover'] as List? ?? const [])) _s(c)], levels: [for (final l in (j['levels'] as List? ?? const [])) _s(l)],
        featuredRank: j['featuredRank'] == null ? null : _i(j['featuredRank']),
        chapters: [for (final c in (j['chapters'] as List? ?? const [])) Chapter.fromJson(Map<String, dynamic>.from(c as Map))],
      );
}

class NoteSection {
  final String heading, text;
  final int? page;
  const NoteSection(this.heading, this.text, this.page);
  factory NoteSection.fromJson(Map<String, dynamic> j) => NoteSection(_s(j['heading']), _s(j['text']), j['page'] == null ? null : _i(j['page']));
}

class Announcement {
  final String id, title, body;
  final int createdAt;
  const Announcement(this.id, this.title, this.body, this.createdAt);
  factory Announcement.fromJson(Map<String, dynamic> j) => Announcement(_s(j['id']), _s(j['title']), _s(j['body']), _i(j['created_at']));
}

class ExamInfo {
  final String id, title, type;
  final String? bookId, chapterId;
  final int durationSec, questionCount, passPct;
  const ExamInfo(this.id, this.title, this.type, this.bookId, this.chapterId, this.durationSec, this.questionCount, this.passPct);
  factory ExamInfo.fromJson(Map<String, dynamic> j) => ExamInfo(_s(j['id']), _s(j['title']), _s(j['type']), j['book_id'] as String?, j['chapter_id'] as String?,
      _i(j['duration_sec']), _i(j['question_count']), _i(j['pass_pct'], 60));
}

class Catalog {
  final List<Level> levels;
  final List<Subject> subjects;
  final List<Book> books;
  final Map<String, List<NoteSection>> notes;
  final List<Announcement> announcements;
  final Map<String, dynamic> config;
  final List<ExamInfo> exams;
  const Catalog({required this.levels, required this.subjects, required this.books, required this.notes, required this.announcements, required this.config, this.exams = const []});

  factory Catalog.fromJson(Map<String, dynamic> j) => Catalog(
        levels: [for (final x in (j['levels'] as List? ?? const [])) Level.fromJson(Map<String, dynamic>.from(x as Map))],
        subjects: [for (final x in (j['subjects'] as List? ?? const [])) Subject.fromJson(Map<String, dynamic>.from(x as Map))],
        books: [for (final x in (j['books'] as List? ?? const [])) Book.fromJson(Map<String, dynamic>.from(x as Map))],
        notes: {
          for (final e in ((j['notes'] as Map?) ?? const {}).entries)
            '${e.key}': [for (final s in (e.value as List? ?? const [])) NoteSection.fromJson(Map<String, dynamic>.from(s as Map))]
        },
        announcements: [for (final x in (j['announcements'] as List? ?? const [])) Announcement.fromJson(Map<String, dynamic>.from(x as Map))],
        config: Map<String, dynamic>.from((j['config'] as Map?) ?? const {}),
        exams: [for (final x in (j['exams'] as List? ?? const [])) ExamInfo.fromJson(Map<String, dynamic>.from(x as Map))],
      );

  ExamInfo? quizFor(String chapterId) => exams.where((e) => e.chapterId == chapterId && e.type == 'chapter_quiz').firstOrNull;
  List<ExamInfo> modelTestsFor(String? levelId) {
    final ids = booksFor(levelId).map((b) => b.id).toSet();
    return exams.where((e) => e.type == 'model' && (e.bookId == null || ids.contains(e.bookId))).toList();
  }

  /// Book and chapter for a chapter id.
  (Book, Chapter)? findChapter(String chapterId) {
    for (final b in books) {
      for (final c in b.chapters) {
        if (c.id == chapterId) return (b, c);
      }
    }
    return null;
  }

  Subject? subject(String id) => subjects.where((s) => s.id == id).firstOrNull;
  Book? book(String id) => books.where((b) => b.id == id).firstOrNull;

  /// Books for a class (all books when [levelId] is null), keeping catalog order.
  List<Book> booksFor(String? levelId) => levelId == null ? books : books.where((b) => b.levels.isEmpty || b.levels.contains(levelId)).toList();

  /// Featured books, lowest rank first.
  List<Book> featured(String? levelId) => booksFor(levelId).where((b) => b.featuredRank != null).toList()..sort((a, b) => a.featuredRank!.compareTo(b.featuredRank!));
}
