import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/tokens.dart';

class BrandMark extends StatelessWidget {
  final double size;
  const BrandMark({super.key, this.size = 72});
  @override
  Widget build(BuildContext context) => Container(
        width: size, height: size,
        decoration: BoxDecoration(gradient: SanzarColors.brandGradient, borderRadius: BorderRadius.circular(size * .3)),
        alignment: Alignment.center,
        child: Text('S', style: TextStyle(color: Colors.white, fontSize: size * .56, fontWeight: FontWeight.w900, height: 1)),
      );
}

class SectionTitle extends StatelessWidget {
  final String text;
  final Widget? trailing;
  const SectionTitle(this.text, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(SanzarSpace.s4, SanzarSpace.s5, SanzarSpace.s4, SanzarSpace.s2),
        child: Row(children: [Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))), ?trailing]),
      );
}

/// Book cover drawn from the two catalog colours (no network images needed).
class BookCover extends StatelessWidget {
  final List<String> colors;
  final String title;
  final double width;
  const BookCover({super.key, required this.colors, required this.title, this.width = 96});
  static Color parse(String hex, Color fallback) {
    final h = hex.replaceFirst('#', '');
    final v = int.tryParse(h.length == 6 ? 'FF$h' : h, radix: 16);
    return v == null ? fallback : Color(v);
  }

  @override
  Widget build(BuildContext context) {
    final c1 = parse(colors.isNotEmpty ? colors[0] : '', SanzarColors.brandEmerald);
    final c2 = parse(colors.length > 1 ? colors[1] : '', SanzarColors.brandJade);
    return Container(
      width: width, height: width * 1.3,
      padding: const EdgeInsets.all(SanzarSpace.s2),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(SanzarRadius.sm), gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c1, c2])),
      alignment: Alignment.bottomLeft,
      child: Text(title, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: width / 8.5, height: 1.15)),
    );
  }
}

class ErrorRetry extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorRetry({super.key, required this.message, required this.onRetry});
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(SanzarSpace.s6),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_rounded, size: 48),
            const SizedBox(height: SanzarSpace.s3),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: SanzarSpace.s4),
            OutlinedButton(onPressed: onRetry, child: Text(S.of(context)('retry'))),
          ]),
        ),
      );
}

void showSnack(BuildContext context, String text) => ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(text)));
