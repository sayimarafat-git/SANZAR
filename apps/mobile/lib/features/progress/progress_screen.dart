import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/app_scope.dart';
import '../../core/data/learning.dart';
import '../../core/data/study_tracker.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/time_ago.dart';

class ProgressScreen extends StatefulWidget {
  const ProgressScreen({super.key});
  @override
  State<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends State<ProgressScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => AppScope.of(context).progress.refresh());
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('progress'))),
      body: ListenableBuilder(
        listenable: scope.progress,
        builder: (context, _) {
          final p = scope.progress.progress;
          if (p == null) return scope.progress.error != null ? ErrorRetry(message: s('err.generic'), onRetry: scope.progress.refresh) : const Center(child: CircularProgressIndicator());
          final cat = scope.catalog.catalog;
          final maxDay = p.series.fold(1, (a, d) => d.$2 > a ? d.$2 : a);
          final maxSub = p.bySubject.fold(1, (a, d) => d.$2 > a ? d.$2 : a);
          return RefreshIndicator(
            onRefresh: scope.progress.refresh,
            child: ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
              ProgressSummary(progress: p),
              const SizedBox(height: SanzarSpace.s3),
              const FocusTimerCard(),
              SectionTitle(s('last7')),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(SanzarSpace.s4),
                  child: SizedBox(
                    height: 130,
                    child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      for (final d in p.series)
                        Expanded(
                          child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                            Text('${(d.$2 / 60).round()}', style: const TextStyle(fontSize: 11)),
                            const SizedBox(height: 2),
                            Container(height: 80 * d.$2 / maxDay + 2, margin: const EdgeInsets.symmetric(horizontal: 6), decoration: BoxDecoration(gradient: SanzarColors.brandGradient, borderRadius: BorderRadius.circular(6))),
                            const SizedBox(height: 4),
                            Text(d.$1.substring(8), style: const TextStyle(fontSize: 11)),
                          ]),
                        ),
                    ]),
                  ),
                ),
              ),
              if (p.bySubject.isNotEmpty) ...[
                SectionTitle(s('bySubject')),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(SanzarSpace.s4),
                    child: Column(children: [
                      for (final (id, sec) in p.bySubject)
                        Padding(
                          padding: const EdgeInsets.only(bottom: SanzarSpace.s2),
                          child: Row(children: [
                            SizedBox(width: 110, child: Text(cat?.subject(id)?.name(s.lang) ?? id, overflow: TextOverflow.ellipsis)),
                            Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: sec / maxSub, minHeight: 10, color: SanzarColors.forSubject(id), backgroundColor: SanzarColors.forSubject(id).withValues(alpha: .12)))),
                            const SizedBox(width: SanzarSpace.s2),
                            Text(s('minutes', {'n': (sec / 60).round()}), style: const TextStyle(fontSize: 12)),
                          ]),
                        ),
                    ]),
                  ),
                ),
              ],
              SectionTitle(s('achievements')),
              GridView.count(
                shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 2, mainAxisSpacing: SanzarSpace.s2, crossAxisSpacing: SanzarSpace.s2, childAspectRatio: 1.9,
                children: [for (final a in p.achievements) _AchievementTile(a)],
              ),
              const SizedBox(height: SanzarSpace.s6),
            ]),
          );
        },
      ),
    );
  }
}

class ProgressSummary extends StatelessWidget {
  final Progress progress;
  const ProgressSummary({super.key, required this.progress});
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final p = progress;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SanzarSpace.s4),
        child: Row(children: [
          SizedBox.square(
            dimension: 76,
            child: Stack(fit: StackFit.expand, children: [
              CircularProgressIndicator(value: (p.todaySec / p.goalSec).clamp(0, 1).toDouble(), strokeWidth: 8, backgroundColor: Theme.of(context).colorScheme.primaryContainer),
              Center(child: Text('${(p.todaySec / 60).floor()}′', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
            ]),
          ),
          const SizedBox(width: SanzarSpace.s4),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s('today'), style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(s('goalOf', {'m': (p.todaySec / 60).floor(), 'g': (p.goalSec / 60).round()})),
            const SizedBox(height: SanzarSpace.s1),
            Wrap(spacing: SanzarSpace.s2, runSpacing: SanzarSpace.s1, children: [
              Chip(visualDensity: VisualDensity.compact, avatar: const Icon(Icons.local_fire_department_rounded, color: SanzarColors.warning, size: 18), label: Text(s('streak', {'n': p.streak}))),
              Chip(visualDensity: VisualDensity.compact, avatar: const Icon(Icons.star_rounded, color: SanzarColors.gold, size: 18), label: Text('${s('levelN', {'n': p.level})} · ${s('xpTotal', {'n': p.xp})}')),
            ]),
          ])),
        ]),
      ),
    );
  }
}

class _AchievementTile extends StatelessWidget {
  final Achievement a;
  const _AchievementTile(this.a);
  @override
  Widget build(BuildContext context) {
    final on = a.unlockedAt != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SanzarSpace.s3),
        child: Row(children: [
          Icon(on ? Icons.emoji_events_rounded : Icons.lock_outline_rounded, color: on ? SanzarColors.gold : Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: SanzarSpace.s2),
          Expanded(child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(a.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: on ? null : Theme.of(context).colorScheme.onSurfaceVariant)),
            Text(a.desc, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11)),
          ])),
        ]),
      ),
    );
  }
}

/// Pomodoro-style focus timer. Time counts as study time like any other
/// screen (the tracker records it as "focus").
class FocusTimerCard extends StatefulWidget {
  const FocusTimerCard({super.key});
  @override
  State<FocusTimerCard> createState() => _FocusTimerCardState();
}

class _FocusTimerCardState extends State<FocusTimerCard> {
  static const _lengths = [15, 25, 45];
  int _minutes = 25;
  int _left = 0;
  Timer? _t;
  StudyTracker? _tracker;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _tracker = AppScope.of(context).tracker;
  }

  void _start() {
    final tracker = _tracker!;
    tracker.start('focus');
    tracker.playing = true; // the student chose to focus; no touches needed
    setState(() => _left = _minutes * 60);
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_left <= 1) {
        _stop(done: true);
      } else {
        setState(() => _left--);
      }
    });
  }

  void _stop({bool done = false}) {
    _t?.cancel();
    _t = null;
    final scope = AppScope.of(context);
    scope.tracker.stop();
    setState(() => _left = 0);
    if (done) {
      showSnack(context, S.of(context)('focusDone'));
      scope.progress.refresh();
    }
  }

  @override
  void dispose() {
    if (_t != null) {
      _t!.cancel();
      _tracker?.stop();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final running = _t != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SanzarSpace.s4),
        child: Row(children: [
          const Icon(Icons.timer_outlined, size: 32),
          const SizedBox(width: SanzarSpace.s3),
          Expanded(
            child: running
                ? Text(mmss(_left), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800))
                : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s('focus'), style: const TextStyle(fontWeight: FontWeight.w700)),
                    Wrap(spacing: SanzarSpace.s1, children: [for (final m in _lengths) ChoiceChip(label: Text('$m'), selected: _minutes == m, onSelected: (_) => setState(() => _minutes = m))]),
                  ]),
          ),
          running ? OutlinedButton(onPressed: _stop, child: Text(s('focusStop'))) : FilledButton(onPressed: _start, child: Text(s('focusStart', {'n': _minutes}))),
        ]),
      ),
    );
  }
}

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});
  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  String _period = 'weekly';
  bool _myClass = false;
  Future<(List<LeaderEntry>, LeaderEntry?)>? _f;

  void _load() => _f = AppScope.of(context).learning.leaderboard(_period, level: _myClass ? AppScope.of(context).auth.profile?.levelId : null);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_f == null) _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('leaderboard'))),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s4),
          child: SegmentedButton<String>(
            segments: [ButtonSegment(value: 'weekly', label: Text(s('weekly'))), ButtonSegment(value: 'monthly', label: Text(s('monthly'))), ButtonSegment(value: 'all', label: Text(s('allTime')))],
            selected: {_period},
            onSelectionChanged: (v) => setState(() { _period = v.first; _load(); }),
          ),
        ),
        SwitchListTile(title: Text(s('myClassOnly')), value: _myClass, onChanged: (v) => setState(() { _myClass = v; _load(); })),
        Expanded(
          child: FutureBuilder<(List<LeaderEntry>, LeaderEntry?)>(
            future: _f,
            builder: (context, snap) {
              if (snap.hasError) return ErrorRetry(message: s('err.generic'), onRetry: () => setState(_load));
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final (list, me) = snap.data!;
              if (list.isEmpty) return Center(child: Text(s('noRanking')));
              return ListView(padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s4), children: [
                if (me != null) Padding(padding: const EdgeInsets.only(bottom: SanzarSpace.s2), child: Text(s('yourRank', {'n': me.rank}), style: const TextStyle(fontWeight: FontWeight.w700))),
                for (final e in list)
                  Card(
                    margin: const EdgeInsets.only(bottom: SanzarSpace.s2),
                    color: e.me ? Theme.of(context).colorScheme.primaryContainer : null,
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: switch (e.rank) { 1 => SanzarColors.gold, 2 => const Color(0xFFB9C2D9), 3 => const Color(0xFFE08A4A), _ => Theme.of(context).colorScheme.surfaceContainerHighest },
                        child: Text('${e.rank}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                      title: Text(e.name),
                      trailing: Text(s('xpTotal', {'n': e.xp}), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
              ]);
            },
          ),
        ),
      ]),
    );
  }
}

