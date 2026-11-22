import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import 'learning.dart';

/// Counts only *active* study time and sends it to the server in small,
/// idempotent events. Time counts while the app is in the foreground, a
/// study screen is open, and the student interacted recently (reading) or
/// media is playing. Unsent events wait on the device until there is
/// internet, so offline study still counts.
class StudyTracker with WidgetsBindingObserver {
  static const _kQueue = 'study.queue';
  static const idleLimit = Duration(minutes: 2);
  static const maxEventSec = 600;
  final LearningApi api;
  final SharedPreferences prefs;
  final DateTime Function() clock;
  final void Function(Map<String, dynamic> result)? onFlushed;
  StudyTracker(this.api, this.prefs, {DateTime Function()? clock, this.onFlushed, bool observeLifecycle = true}) : clock = clock ?? DateTime.now {
    if (observeLifecycle) WidgetsBinding.instance.addObserver(this);
  }

  _Session? _s;
  Timer? _timer;
  bool _foreground = true;
  final _rand = Random.secure();

  bool get active => _s != null;
  int get queued => _queue().length;

  /// Starts timing a screen. [type] is notes, pdf, ppt, video, exam or focus.
  void start(String type, {String? chapterId, String? resourceId}) {
    stop();
    _s = _Session(type, chapterId, resourceId, clock());
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => tick());
  }

  /// Call on scroll, tap or page change.
  void activity() => _s?.lastActivity = clock();

  /// Media playing counts as active even without touches.
  set playing(bool v) => _s?.playing = v;

  /// Adds one second if the session is active right now (called every second).
  void tick() {
    final s = _s;
    if (s == null || !_foreground) return;
    final t = clock();
    if (!s.playing && t.difference(s.lastActivity) > idleLimit) return;
    s.sec++;
    if (s.sec >= maxEventSec) _cut();
  }

  /// Ends the current screen's session and sends what was counted.
  void stop() {
    _timer?.cancel();
    _timer = null;
    if (_s != null) {
      _cut();
      _s = null;
      flush();
    }
  }

  void _cut() {
    final s = _s!;
    if (s.sec > 0) {
      final ev = {
        'id': '${clock().millisecondsSinceEpoch.toRadixString(36)}${_rand.nextInt(1 << 32).toRadixString(36)}',
        'type': s.type, 'chapterId': s.chapterId, 'resourceId': s.resourceId, 'sec': s.sec,
        // The event ends now and covers exactly the counted seconds, so it never ends in the future.
        'startedAt': clock().millisecondsSinceEpoch - s.sec * 1000,
      };
      final q = _queue()..add(ev);
      prefs.setString(_kQueue, jsonEncode(q.length > 500 ? q.sublist(q.length - 500) : q));
    }
    s.sec = 0;
  }

  List<Map<String, dynamic>> _queue() {
    try {
      return [for (final e in jsonDecode(prefs.getString(_kQueue) ?? '[]') as List) Map<String, dynamic>.from(e as Map)];
    } catch (_) {
      return [];
    }
  }

  Future<void>? _inflight;

  /// Sends queued events (50 per request). Keeps them on network errors.
  /// Concurrent callers share the same send.
  Future<void> flush() => _inflight ??= _flush().whenComplete(() => _inflight = null);

  Future<void> _flush() async {
    try {
      while (true) {
        final q = _queue();
        if (q.isEmpty) break;
        final batch = q.take(50).toList();
        try {
          final res = await api.studyEvents(batch);
          onFlushed?.call(res);
        } on ApiException catch (e) {
          if (e.isNetwork || e.status >= 500 || e.status == 429 || e.status == 401) break;
          // The server refused this batch as invalid: drop it so it cannot block the queue.
        }
        final sent = batch.map((e) => e['id']).toSet();
        await prefs.setString(_kQueue, jsonEncode(_queue().where((e) => !sent.contains(e['id'])).toList()));
      }
    } finally {}
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground) {
      if (_s != null) _cut();
      flush();
    } else {
      activity();
    }
  }

  void dispose() {
    stop();
    WidgetsBinding.instance.removeObserver(this);
  }
}

class _Session {
  final String type;
  final String? chapterId, resourceId;
  DateTime lastActivity;
  bool playing = false;
  int sec = 0;
  _Session(this.type, this.chapterId, this.resourceId, this.lastActivity);
}

/// Wraps a study screen: starts the tracker on open, stops on close, and
/// treats touches and scrolling as activity.
class TrackedStudy extends StatefulWidget {
  final StudyTracker tracker;
  final String type;
  final String? chapterId, resourceId;
  final Widget child;
  const TrackedStudy({super.key, required this.tracker, required this.type, this.chapterId, this.resourceId, required this.child});
  @override
  State<TrackedStudy> createState() => _TrackedStudyState();
}

class _TrackedStudyState extends State<TrackedStudy> {
  @override
  void initState() {
    super.initState();
    widget.tracker.start(widget.type, chapterId: widget.chapterId, resourceId: widget.resourceId);
  }

  @override
  void dispose() {
    widget.tracker.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: (_) => widget.tracker.activity(),
        child: NotificationListener<ScrollNotification>(
          onNotification: (_) {
            widget.tracker.activity();
            return false;
          },
          child: widget.child,
        ),
      );
}
