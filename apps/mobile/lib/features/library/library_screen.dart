import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/app_scope.dart';
import '../../core/data/models.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';

class LibraryScreen extends StatefulWidget {
  final String? subject;
  const LibraryScreen({super.key, this.subject});
  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  String _query = '';
  String? _subject;
  bool _allClasses = false;

  @override
  void initState() {
    super.initState();
    _subject = widget.subject;
  }

  @override
  void didUpdateWidget(LibraryScreen old) {
    super.didUpdateWidget(old);
    if (widget.subject != old.subject) _subject = widget.subject;
  }

  /// Search by title or author; Bangla and English are matched case-insensitively.
  static List<Book> filter(List<Book> books, {String query = '', String? subject}) {
    final q = query.trim().toLowerCase();
    return books.where((b) => (subject == null || b.subjectId == subject) && (q.isEmpty || b.title.toLowerCase().contains(q) || b.author.toLowerCase().contains(q))).toList();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('library'))),
      body: ListenableBuilder(
        listenable: Listenable.merge([scope.catalog, scope.auth]),
        builder: (context, _) {
          final cat = scope.catalog.catalog;
          if (cat == null) {
            return scope.catalog.error != null ? ErrorRetry(message: s(scope.catalog.offline ? 'err.network' : 'err.generic'), onRetry: scope.catalog.refresh) : const Center(child: CircularProgressIndicator());
          }
          final level = _allClasses ? null : scope.auth.profile?.levelId;
          final base = cat.booksFor(level);
          final books = filter(base, query: _query, subject: _subject);
          final subjects = cat.subjects.where((x) => base.any((b) => b.subjectId == x.id)).toList();
          return RefreshIndicator(
            onRefresh: scope.catalog.refresh,
            child: ListView(padding: const EdgeInsets.only(bottom: SanzarSpace.s8), children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(SanzarSpace.s4, 0, SanzarSpace.s4, SanzarSpace.s2),
                child: TextField(onChanged: (v) => setState(() => _query = v), decoration: InputDecoration(hintText: s('search'), prefixIcon: const Icon(Icons.search_rounded))),
              ),
              SizedBox(
                height: 44,
                child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s4), children: [
                  if (scope.auth.profile?.levelId != null)
                    Padding(padding: const EdgeInsets.only(right: SanzarSpace.s2), child: FilterChip(label: Text(s('allClasses')), selected: _allClasses, onSelected: (v) => setState(() => _allClasses = v))),
                  for (final sub in subjects)
                    Padding(
                      padding: const EdgeInsets.only(right: SanzarSpace.s2),
                      child: ChoiceChip(label: Text(sub.name(s.lang)), selected: _subject == sub.id, onSelected: (v) => setState(() => _subject = v ? sub.id : null)),
                    ),
                ]),
              ),
              if (books.isEmpty) Padding(padding: const EdgeInsets.all(SanzarSpace.s8), child: Text(s('noBooks'), textAlign: TextAlign.center)),
              for (final b in books)
                Padding(
                  padding: const EdgeInsets.fromLTRB(SanzarSpace.s4, SanzarSpace.s2, SanzarSpace.s4, 0),
                  child: Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => context.go('/library/book/${b.id}'),
                      child: Padding(
                        padding: const EdgeInsets.all(SanzarSpace.s3),
                        child: Row(children: [
                          BookCover(colors: b.cover, title: b.title, width: 60),
                          const SizedBox(width: SanzarSpace.s3),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(b.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                            if (b.author.isNotEmpty) Text(b.author, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
                            const SizedBox(height: SanzarSpace.s1),
                            Row(children: [
                              Container(width: 8, height: 8, decoration: BoxDecoration(color: SanzarColors.forSubject(b.subjectId), shape: BoxShape.circle)),
                              const SizedBox(width: 6),
                              Flexible(child: Text('${cat.subject(b.subjectId)?.name(s.lang) ?? ''} · ${s('chapters', {'n': b.chapters.length})}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12))),
                            ]),
                          ])),
                          const Icon(Icons.chevron_right_rounded),
                        ]),
                      ),
                    ),
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }
}

class BookScreen extends StatelessWidget {
  final String bookId;
  const BookScreen({super.key, required this.bookId});
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    return ListenableBuilder(
      listenable: scope.catalog,
      builder: (context, _) {
        final b = scope.catalog.catalog?.book(bookId);
        if (b == null) return Scaffold(appBar: AppBar(), body: Center(child: Text(s('noBooks'))));
        return Scaffold(
          appBar: AppBar(title: Text(b.title, maxLines: 1, overflow: TextOverflow.ellipsis)),
          body: ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              BookCover(colors: b.cover, title: b.title, width: 100),
              const SizedBox(width: SanzarSpace.s4),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(b.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                if (b.author.isNotEmpty) Text(b.author),
                if (b.edition.isNotEmpty) Text(b.edition, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                const SizedBox(height: SanzarSpace.s2),
                Text(s('chapters', {'n': b.chapters.length})),
              ])),
            ]),
            const SizedBox(height: SanzarSpace.s4),
            for (final c in b.chapters)
              Padding(
                padding: const EdgeInsets.only(bottom: SanzarSpace.s2),
                child: Card(
                  child: ListTile(
                    leading: CircleAvatar(backgroundColor: SanzarColors.forSubject(b.subjectId).withValues(alpha: .15), child: Text('${c.number}', style: TextStyle(color: SanzarColors.forSubject(b.subjectId), fontWeight: FontWeight.w700))),
                    title: Text(c.title),
                    subtitle: Text([if (c.hasNotes) s('notes'), if (c.questionCount > 0) s('questions', {'n': c.questionCount})].join(' · ')),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.go('/library/book/${b.id}/chapter/${c.id}'),
                  ),
                ),
              ),
          ]),
        );
      },
    );
  }
}
