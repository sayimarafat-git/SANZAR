import 'package:flutter/material.dart';
import '../../core/app_scope.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';

/// Shown once after sign-up so the library can show the right books.
class ChooseClassScreen extends StatefulWidget {
  const ChooseClassScreen({super.key});
  @override
  State<ChooseClassScreen> createState() => _ChooseClassScreenState();
}

class _ChooseClassScreenState extends State<ChooseClassScreen> {
  String? _level;
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _level ??= AppScope.of(context).auth.profile?.levelId;
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('chooseClass'))),
      body: ListenableBuilder(
        listenable: scope.catalog,
        builder: (context, _) {
          final levels = scope.catalog.catalog?.levels ?? const [];
          if (levels.isEmpty && scope.catalog.error != null) return ErrorRetry(message: s('err.generic'), onRetry: scope.catalog.refresh);
          if (levels.isEmpty) {
            return Center(
              child: scope.catalog.loading
                  ? const CircularProgressIndicator()
                  : Text(s('noClasses')),
            );
          }
          return ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
            RadioGroup<String>(
              groupValue: _level,
              onChanged: (v) => setState(() => _level = v),
              child: Column(children: [
                for (final l in levels)
                  Padding(
                    padding: const EdgeInsets.only(bottom: SanzarSpace.s2),
                    child: Card(child: RadioListTile<String>(value: l.id, title: Text(l.name(s.lang)))),
                  ),
              ]),
            ),
            const SizedBox(height: SanzarSpace.s4),
            FilledButton(
              onPressed: _level == null || _busy
                  ? null
                  : () async {
                      setState(() => _busy = true);
                      try {
                        await scope.auth.chooseClass(_level!, scope.settings.lang);
                      } catch (_) {
                        if (context.mounted) showSnack(context, s('err.generic'));
                      } finally {
                        if (mounted) setState(() => _busy = false);
                      }
                    },
              child: Text(s('continue')),
            ),
          ]);
        },
      ),
    );
  }
}
