import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/app_scope.dart';
import '../../core/data/learning.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';

class _Msg {
  final bool fromMe;
  final String text;
  final TutorAnswer? answer;
  const _Msg(this.fromMe, this.text, [this.answer]);
}

/// Notes-only tutor: every answer comes from published notes with a citation.
class TutorScreen extends StatefulWidget {
  const TutorScreen({super.key});
  @override
  State<TutorScreen> createState() => _TutorScreenState();
}

class _TutorScreenState extends State<TutorScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _msgs = <_Msg>[];
  bool _busy = false;

  TutorReference? get _lastRef => _msgs.reversed.map((m) => m.answer?.reference).whereType<TutorReference>().firstOrNull;

  Future<void> _ask(String q) async {
    q = q.trim();
    if (q.isEmpty || _busy) return;
    final scope = AppScope.of(context);
    setState(() {
      _msgs.add(_Msg(true, q));
      _busy = true;
      _input.clear();
    });
    _toEnd();
    try {
      final a = await scope.learning.ask(q, prev: _lastRef);
      setState(() => _msgs.add(_Msg(false, a.text, a)));
    } catch (_) {
      if (mounted) setState(() => _msgs.add(_Msg(false, S.of(context)('err.generic'))));
    } finally {
      if (mounted) setState(() => _busy = false);
      _toEnd();
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Row(children: [const BrandMark(size: 30), const SizedBox(width: SanzarSpace.s2), Text(s('tutor'))])),
      body: Column(children: [
        Expanded(
          child: ListView(controller: _scroll, padding: const EdgeInsets.all(SanzarSpace.s4), children: [
            Card(child: Padding(padding: const EdgeInsets.all(SanzarSpace.s4), child: Text(s('tutorIntro')))),
            const SizedBox(height: SanzarSpace.s3),
            for (final m in _msgs)
              Align(
                alignment: m.fromMe ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: SanzarSpace.s3),
                  constraints: const BoxConstraints(maxWidth: 520),
                  padding: const EdgeInsets.all(SanzarSpace.s3),
                  decoration: BoxDecoration(
                    gradient: m.fromMe ? SanzarColors.brandGradient : null,
                    color: m.fromMe ? null : cs.surface,
                    border: m.fromMe ? null : Border.all(color: cs.outline),
                    borderRadius: BorderRadius.circular(SanzarRadius.md),
                  ),
                  child: m.fromMe ? Text(m.text, style: const TextStyle(color: Colors.white)) : _AnswerView(msg: m, onMore: () => _ask(s('tutorMore'))),
                ),
              ),
            if (_busy) const Align(alignment: Alignment.centerLeft, child: Padding(padding: EdgeInsets.all(SanzarSpace.s3), child: SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.4)))),
          ]),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(SanzarSpace.s3, SanzarSpace.s2, SanzarSpace.s3, SanzarSpace.s3),
            child: Row(children: [
              Expanded(child: TextField(key: const Key('tutorInput'), controller: _input, minLines: 1, maxLines: 4, maxLength: 500, textInputAction: TextInputAction.send, onSubmitted: _ask, decoration: InputDecoration(hintText: s('tutorHint'), counterText: ''))),
              const SizedBox(width: SanzarSpace.s2),
              IconButton.filled(key: const Key('tutorSend'), onPressed: _busy ? null : () => _ask(_input.text), icon: const Icon(Icons.send_rounded)),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _AnswerView extends StatelessWidget {
  final _Msg msg;
  final VoidCallback onMore;
  const _AnswerView({required this.msg, required this.onMore});
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final a = msg.answer;
    final ref = a?.reference;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (a?.heading != null) Text(a!.heading!, style: const TextStyle(fontWeight: FontWeight.w700)),
      if (a?.heading != null) const SizedBox(height: SanzarSpace.s1),
      SelectableText(msg.text, style: const TextStyle(height: 1.45)),
      if (ref != null) ...[
        const SizedBox(height: SanzarSpace.s2),
        Text('${s('reference')}: ${ref.bookTitle} – ${s('chapter', {'n': ref.chapterNumber})}: ${ref.chapterTitle}${ref.page != null ? ' (${s('page', {'n': ref.page!})})' : ''}',
            style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        Wrap(spacing: SanzarSpace.s2, children: [
          TextButton(onPressed: () => context.go('/library/book/${ref.bookId}/chapter/${ref.chapterId}'), child: Text(s('openChapter'))),
          TextButton(onPressed: onMore, child: Text(s('tutorMore'))),
        ]),
      ],
    ]);
  }
}
