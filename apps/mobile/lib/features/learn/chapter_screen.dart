import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/app_scope.dart';
import '../../core/data/models.dart';
import '../../core/data/study_tracker.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';

class ChapterScreen extends StatefulWidget {
  final String bookId, chapterId;
  const ChapterScreen({super.key, required this.bookId, required this.chapterId});
  @override
  State<ChapterScreen> createState() => _ChapterScreenState();
}

class _ChapterScreenState extends State<ChapterScreen> {
  bool _busy = false;

  Future<void> _markDone() async {
    final scope = AppScope.of(context);
    final s = S.of(context);
    setState(() => _busy = true);
    try {
      final r = await scope.learning.complete('notes:${widget.chapterId}');
      await scope.progress.refresh();
      if (mounted) {
        final xp = (r['xpAwarded'] as num?)?.toInt() ?? 0;
        showSnack(context, xp > 0 ? '${s('done')} · ${s('xpEarned', {'n': xp})}' : s('done'));
      }
    } catch (_) {
      if (mounted) showSnack(context, s('err.generic'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    final cat = scope.catalog.catalog;
    final b = cat?.book(widget.bookId);
    final c = b?.chapters.where((x) => x.id == widget.chapterId).firstOrNull;
    final notes = cat?.notes[widget.chapterId] ?? const <NoteSection>[];
    final quiz = cat?.quizFor(widget.chapterId);
    if (c == null || b == null) return Scaffold(appBar: AppBar(), body: Center(child: Text(s('noNotes'))));
    return TrackedStudy(
      tracker: scope.tracker,
      type: 'notes',
      chapterId: c.id,
      child: Scaffold(
        appBar: AppBar(title: Text(s('chapter', {'n': c.number}))),
        body: ListenableBuilder(
          listenable: scope.progress,
          builder: (context, _) {
            final done = scope.progress.progress?.completed.contains('notes:${c.id}') ?? false;
            return ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
              Text(c.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
              Text(b.title, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              const SizedBox(height: SanzarSpace.s3),
              if (c.resources.isNotEmpty || quiz != null) ...[
                Text(s('resources'), style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: SanzarSpace.s2),
                for (final r in c.resources) _ResourceTile(bookId: b.id, chapterId: c.id, resource: r, done: scope.progress.progress?.completed.contains(r.id) ?? false),
                if (quiz != null)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.quiz_outlined, color: SanzarColors.brandJade),
                      title: Text(s('chapterQuiz')),
                      subtitle: Text('${s('questions', {'n': quiz.questionCount})} · ${s('minutes', {'n': (quiz.durationSec / 60).ceil()})}'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.push('/exam/${quiz.id}'),
                    ),
                  ),
                const SizedBox(height: SanzarSpace.s4),
              ],
              Text(s('notes'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: SanzarSpace.s2),
              if (notes.isEmpty) Card(child: Padding(padding: const EdgeInsets.all(SanzarSpace.s4), child: Text(s('noNotes')))),
              for (final n in notes)
                Padding(
                  padding: const EdgeInsets.only(bottom: SanzarSpace.s3),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(SanzarSpace.s4),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(n.heading, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                          if (n.page != null) Text(s('page', {'n': n.page!}), style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                        ]),
                        const SizedBox(height: SanzarSpace.s2),
                        SelectableText(n.text, style: const TextStyle(height: 1.5)),
                      ]),
                    ),
                  ),
                ),
              if (notes.isNotEmpty)
                done
                    ? Center(child: Chip(avatar: const Icon(Icons.check_circle, color: SanzarColors.success), label: Text(s('done'))))
                    : FilledButton.icon(onPressed: _busy ? null : _markDone, icon: const Icon(Icons.check_rounded), label: Text(s('markDone'))),
              const SizedBox(height: SanzarSpace.s6),
            ]);
          },
        ),
      ),
    );
  }
}

class _ResourceTile extends StatelessWidget {
  final String bookId, chapterId;
  final Resource resource;
  final bool done;
  const _ResourceTile({required this.bookId, required this.chapterId, required this.resource, required this.done});
  @override
  Widget build(BuildContext context) {
    final icon = switch (resource.type) { 'video' => Icons.play_circle_outline, 'pdf' => Icons.picture_as_pdf_outlined, 'ppt' => Icons.slideshow_outlined, _ => Icons.link };
    return Padding(
      padding: const EdgeInsets.only(bottom: SanzarSpace.s2),
      child: Card(
        child: ListTile(
          leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
          title: Text(resource.title.isEmpty ? resource.type.toUpperCase() : resource.title),
          trailing: done ? const Icon(Icons.check_circle, color: SanzarColors.success) : const Icon(Icons.chevron_right_rounded),
          enabled: resource.url != null,
          onTap: () => context.push('/library/book/$bookId/chapter/$chapterId/resource/${resource.id}'),
        ),
      ),
    );
  }
}
