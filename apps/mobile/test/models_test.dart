import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanzar/core/data/models.dart';
import 'support/fakes.dart';

void main() {
  final cat = Catalog.fromJson(jsonDecode(fixture('catalog.json')) as Map<String, dynamic>);

  test('catalog sample parses completely', () {
    expect(cat.levels.map((l) => l.id), ['c9', 'c10', 'hsc', 'uni']);
    expect(cat.subjects, hasLength(8));
    expect(cat.books, hasLength(13));
    final phy = cat.book('phy-910')!;
    expect(phy.chapters, hasLength(13));
    expect(phy.chapters.first.hasNotes, isTrue);
    expect(cat.notes['phy-910-01']!.first.page, 2);
    expect(cat.announcements.single.title, 'Welcome to Sanzar');
  });

  test('books are filtered by class and featured books are ordered by rank', () {
    expect(cat.booksFor('hsc').every((b) => b.levels.contains('hsc')), isTrue);
    expect(cat.booksFor('hsc').any((b) => b.id == 'phy-910'), isFalse);
    expect(cat.booksFor(null), hasLength(13));
    final f = cat.featured('c10');
    expect(f, isNotEmpty);
    for (var i = 1; i < f.length; i++) {
      expect(f[i - 1].featuredRank! <= f[i].featuredRank!, isTrue);
    }
  });

  test('names fall back to English when a translation is missing', () {
    const s = Subject('x', 'Math', '', '', 'calc', '#000');
    expect(s.name('bn'), 'Math');
    expect(cat.subject('physics')!.name('bn'), 'পদার্থবিজ্ঞান');
  });

  test('profile parses the /v1/me response', () {
    final p = Profile.fromJson((jsonDecode(fixture('me.json')) as Map)['user'] as Map<String, dynamic>);
    expect(p.displayName, 'Rahim Uddin');
    expect(p.levelId, 'c10');
    expect(p.blocked, isFalse);
    expect(p.isStaff, isFalse);
  });
}
