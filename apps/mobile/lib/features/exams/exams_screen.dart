import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/app_scope.dart';
import '../../core/api/api_client.dart';
import '../../core/data/learning.dart';
import '../../core/data/study_tracker.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/time_ago.dart';

class ExamsScreen extends StatefulWidget {
  const ExamsScreen({super.key});
  @override
  State<ExamsScreen> createState() => _ExamsScreenState();
}

class _ExamsScreenState extends State<ExamsScreen> {
  Future<List<AttemptSummary>>? _history;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _history ??= AppScope.of(context).learning.attempts();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    final cat = scope.catalog.catalog;
    final level = scope.auth.profile?.levelId;
    final models = cat?.modelTestsFor(level) ?? const [];
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: Text(s('exams')), bottom: TabBar(tabs: [Tab(text: s('modelTests')), Tab(text: s('history'))])),
        body: TabBarView(children: [
          ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
            if (models.isEmpty) Padding(padding: const EdgeInsets.all(SanzarSpace.s6), child: Text(s('noBooks'), textAlign: TextAlign.center)),
            for (final e in models)
              Padding(
                padding: const EdgeInsets.only(bottom: SanzarSpace.s2),
                child: Card(
                  child: ListTile(
                    leading: CircleAvatar(backgroundColor: SanzarColors.forSubject(cat?.book(e.bookId ?? '')?.subjectId ?? '').withValues(alpha: .15), child: Icon(Icons.assignment_outlined, color: SanzarColors.forSubject(cat?.book(e.bookId ?? '')?.subjectId ?? ''))),
                    title: Text(e.title),
                    subtitle: Text('${s('questions', {'n': e.questionCount})} · ${s('minutes', {'n': (e.durationSec / 60).ceil()})}'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/exam/${e.id}'),
                  ),
                ),
              ),
          ]),
          RefreshIndicator(
            onRefresh: () async => setState(() => _history = scope.learning.attempts()),
            child: FutureBuilder<List<AttemptSummary>>(
              future: _history,
              builder: (context, snap) {
                if (snap.hasError) return ErrorRetry(message: s('err.generic'), onRetry: () => setState(() => _history = scope.learning.attempts()));
                if (!snap.hasData) return const Center(child: CircularProgressIndicator());
                final list = snap.data!;
                if (list.isEmpty) return ListView(children: [Padding(padding: const EdgeInsets.all(SanzarSpace.s8), child: Text(s('noAttempts'), textAlign: TextAlign.center))]);
                return ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
                  for (final a in list)
                    Card(
                      margin: const EdgeInsets.only(bottom: SanzarSpace.s2),
                      child: ListTile(
                        title: Text(a.title.isEmpty ? a.examId : a.title),
                        subtitle: Text(timeAgo(s, a.startedAt)),
                        trailing: Text(a.total == null ? '—' : s('score', {'s': a.score ?? 0, 'n': a.total!}), style: const TextStyle(fontWeight: FontWeight.w700)),
                        onTap: a.status == 'legacy' ? null : () => context.push('/result/${a.id}'),
                      ),
                    ),
                ]);
              },
            ),
          ),
        ]),
      ),
    );
  }
}

/// One timed exam. Answers stay on the device until submission; the server
/// keeps the clock and grades.
class ExamScreen extends StatefulWidget {
  final String examId;
  const ExamScreen({super.key, required this.examId});
  @override
  State<ExamScreen> createState() => _ExamScreenState();
}

class _ExamScreenState extends State<ExamScreen> {
  ExamSession? _session;
  Object? _error;
  final _answers = <String, int>{};
  int _index = 0;
  int _left = 0;
  Duration _skew = Duration.zero;
  Timer? _timer;
  bool _submitting = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_session == null && _error == null) _start();
  }

  Future<void> _start() async {
    try {
      final sess = await AppScope.of(context).learning.startExam(widget.examId);
      _skew = Duration(milliseconds: sess.serverTime - DateTime.now().millisecondsSinceEpoch);
      setState(() => _session = sess);
      _tick();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    } on ApiException catch (e) {
      setState(() => _error = e);
    } catch (e) {
      setState(() => _error = e);
    }
  }

  void _tick() {
    final sess = _session;
    if (sess == null) return;
    final left = ((sess.endsAt - DateTime.now().add(_skew).millisecondsSinceEpoch) / 1000).ceil();
    setState(() => _left = left.clamp(0, 1 << 30));
    if (left <= 0 && !_submitting) {
      showSnack(context, S.of(context)('timeUp'));
      _submit();
    }
  }

  Future<void> _submit() async {
    if (_submitting || _session == null) return;
    _timer?.cancel();
    setState(() => _submitting = true);
    final scope = AppScope.of(context);
    try {
      final res = await scope.learning.submit(_session!.attemptId, _answers);
      scope.progress.refresh();
      if (mounted) context.pushReplacement('/result/${_session!.attemptId}', extra: res);
    } catch (_) {
      if (mounted) {
        setState(() => _submitting = false);
        showSnack(context, S.of(context)('err.generic'));
      }
    }
  }

  Future<void> _confirmSubmit() async {
    final s = S.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(s('submitConfirm', {'a': _answers.length, 'n': _session!.questions.length})),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s('cancel'))), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s('submit')))],
      ),
    );
    if (ok == true) _submit();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    if (_error != null) {
      final msg = _error is ApiException && (_error as ApiException).status == 409 ? (_error as ApiException).message : s('err.generic');
      return Scaffold(appBar: AppBar(), body: ErrorRetry(message: msg, onRetry: () => setState(() { _error = null; _start(); })));
    }
    final sess = _session;
    if (sess == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final q = sess.questions[_index];
    final scope = AppScope.of(context);
    return TrackedStudy(
      tracker: scope.tracker,
      type: 'exam',
      chapterId: scope.catalog.catalog?.exams.where((e) => e.id == widget.examId).firstOrNull?.chapterId,
      child: Scaffold(
        appBar: AppBar(
          title: Text(sess.title),
          actions: [Padding(padding: const EdgeInsets.only(right: SanzarSpace.s4), child: Center(child: Chip(avatar: const Icon(Icons.timer_outlined, size: 18), label: Text(mmss(_left), key: const Key('timer')))))],
        ),
        body: Column(children: [
          LinearProgressIndicator(value: (_index + 1) / sess.questions.length),
          Expanded(
            child: ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
              Text('${_index + 1} / ${sess.questions.length}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              const SizedBox(height: SanzarSpace.s2),
              Text(q.text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: SanzarSpace.s4),
              RadioGroup<int>(
                groupValue: _answers[q.id],
                onChanged: (v) => setState(() => _answers[q.id] = v!),
                child: Column(children: [
                  for (var i = 0; i < q.options.length; i++)
                    Padding(padding: const EdgeInsets.only(bottom: SanzarSpace.s2), child: Card(child: RadioListTile<int>(value: i, title: Text(q.options[i])))),
                ]),
              ),
            ]),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(SanzarSpace.s4),
              child: Row(children: [
                if (_index > 0) Expanded(child: OutlinedButton(onPressed: () => setState(() => _index--), child: const Icon(Icons.arrow_back_rounded))),
                if (_index > 0) const SizedBox(width: SanzarSpace.s3),
                Expanded(
                  flex: 2,
                  child: _index < sess.questions.length - 1
                      ? FilledButton(key: const Key('next'), onPressed: () => setState(() => _index++), child: Text(s('next')))
                      : FilledButton(key: const Key('submitExam'), onPressed: _submitting ? null : _confirmSubmit, child: Text(s('submit'))),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class ResultScreen extends StatefulWidget {
  final String attemptId;
  final AttemptResult? initial;
  const ResultScreen({super.key, required this.attemptId, this.initial});
  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  Future<AttemptResult>? _f;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _f ??= widget.initial != null ? Future.value(widget.initial) : AppScope.of(context).learning.attempt(widget.attemptId);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('result'))),
      body: FutureBuilder<AttemptResult>(
        future: _f,
        builder: (context, snap) {
          if (snap.hasError) return ErrorRetry(message: s('err.generic'), onRetry: () => setState(() => _f = AppScope.of(context).learning.attempt(widget.attemptId)));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final r = snap.data!;
          final a = r.attempt;
          final good = r.passed && a.status == 'graded';
          return ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
            Container(
              padding: const EdgeInsets.all(SanzarSpace.s5),
              decoration: BoxDecoration(gradient: SanzarColors.heroGradient, borderRadius: BorderRadius.circular(SanzarRadius.lg)),
              child: Column(children: [
                Text(a.title, style: const TextStyle(color: Colors.white70)),
                const SizedBox(height: SanzarSpace.s2),
                Text(s('score', {'s': a.score ?? 0, 'n': a.total ?? 0}), key: const Key('score'), style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800)),
                Text(a.status == 'expired' ? s('expired') : s(good ? 'passed' : 'notPassed'), style: TextStyle(color: good ? const Color(0xFF7CF0B5) : Colors.white)),
                if (r.xpAwarded > 0) Padding(padding: const EdgeInsets.only(top: SanzarSpace.s2), child: Chip(label: Text(s('xpEarned', {'n': r.xpAwarded})))),
              ]),
            ),
            const SizedBox(height: SanzarSpace.s4),
            for (final (i, q) in r.review.indexed)
              Card(
                margin: const EdgeInsets.only(bottom: SanzarSpace.s3),
                child: Padding(
                  padding: const EdgeInsets.all(SanzarSpace.s4),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(q.chosen == q.answer ? Icons.check_circle : Icons.cancel, color: q.chosen == q.answer ? SanzarColors.success : SanzarColors.danger),
                      const SizedBox(width: SanzarSpace.s2),
                      Expanded(child: Text('${i + 1}. ${q.text}', style: const TextStyle(fontWeight: FontWeight.w600))),
                    ]),
                    const SizedBox(height: SanzarSpace.s2),
                    Text('${s('yourAnswer')}: ${q.chosen == null ? s('notAnswered') : q.options[q.chosen!]}'),
                    if (q.chosen != q.answer && q.answer != null) Text('${s('correctAnswer')}: ${q.options[q.answer!]}', style: const TextStyle(color: SanzarColors.success, fontWeight: FontWeight.w600)),
                    if (q.explanation.isNotEmpty) Padding(padding: const EdgeInsets.only(top: SanzarSpace.s2), child: Text(q.explanation, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
                  ]),
                ),
              ),
          ]);
        },
      ),
    );
  }
}
