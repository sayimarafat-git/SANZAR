import '../l10n/strings.dart';

String timeAgo(S s, int ms, {DateTime? now}) {
  final d = (now ?? DateTime.now()).difference(DateTime.fromMillisecondsSinceEpoch(ms));
  if (d.inMinutes < 1) return s('justNow');
  if (d.inHours < 1) return s('minAgo', {'n': d.inMinutes});
  if (d.inDays < 1) return s('hAgo', {'n': d.inHours});
  return s('dAgo', {'n': d.inDays});
}

String mmss(int sec) => '${(sec ~/ 60).toString().padLeft(2, '0')}:${(sec % 60).toString().padLeft(2, '0')}';
