import 'package:flutter_test/flutter_test.dart';
import 'package:sanzar/core/l10n/strings.dart';

void main() {
  test('every string exists in Bangla, English and Chinese with the same placeholders', () {
    final en = S.table['en']!;
    final ph = RegExp(r'\{(\w+)\}');
    for (final lang in ['bn', 'zh']) {
      final t = S.table[lang]!;
      expect(t.keys.toSet(), en.keys.toSet(), reason: '$lang keys differ from en');
      for (final k in en.keys) {
        expect(ph.allMatches(t[k]!).map((m) => m[1]).toSet(), ph.allMatches(en[k]!).map((m) => m[1]).toSet(), reason: '$lang:$k placeholders');
        expect(t[k]!.trim(), isNotEmpty, reason: '$lang:$k empty');
      }
    }
  });

  test('placeholders are filled', () {
    expect(const S('en')('hello', {'name': 'Rahim'}), 'Hello, Rahim');
    expect(const S('bn')('chapters', {'n': 5}), '5টি অধ্যায়');
    expect(const S('xx')('next'), 'Next'); // unknown language falls back to English
  });
}
