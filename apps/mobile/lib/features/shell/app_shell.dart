import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/app_scope.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';

/// Keeps bottom navigation on phones and switches to a website-style layout
/// with a persistent side rail on wider screens.
class AppShell extends StatelessWidget {
  final StatefulNavigationShell shell;
  const AppShell({super.key, required this.shell});

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth >= 900) return _desktop(context);
          return Scaffold(
            body: shell,
            bottomNavigationBar: _mobileNavigation(context),
          );
        },
      );

  Widget _desktop(BuildContext context) {
    final s = S.of(context);
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Row(
          children: [
            NavigationRail(
              backgroundColor: cs.surface,
              extended: true,
              selectedIndex: shell.currentIndex,
              onDestinationSelected: (index) => shell.goBranch(
                index,
                initialLocation: index == shell.currentIndex,
              ),
              leading: Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
                child: Row(
                  children: [
                    const BrandMark(size: 36),
                    const SizedBox(width: 10),
                    Text(
                      'Sanzar',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                  ],
                ),
              ),
              destinations: [
                NavigationRailDestination(
                  icon: const Icon(Icons.home_outlined),
                  selectedIcon: const Icon(Icons.home_rounded),
                  label: Text(s('home')),
                ),
                NavigationRailDestination(
                  icon: const Icon(Icons.local_library_outlined),
                  selectedIcon: const Icon(Icons.local_library_rounded),
                  label: Text(s('library')),
                ),
                NavigationRailDestination(
                  icon: const Icon(Icons.smart_toy_outlined),
                  selectedIcon: const Icon(Icons.smart_toy_rounded),
                  label: Text(s('tutor')),
                ),
                NavigationRailDestination(
                  icon: const Icon(Icons.forum_outlined),
                  selectedIcon: const Icon(Icons.forum_rounded),
                  label: Text(s('community')),
                ),
                NavigationRailDestination(
                  icon: const Icon(Icons.person_outline_rounded),
                  selectedIcon: const Icon(Icons.person_rounded),
                  label: Text(s('profile')),
                ),
              ],
            ),
            VerticalDivider(width: 1, color: cs.outlineVariant),
            Expanded(
              child: Column(
                children: [
                  SizedBox(
                    height: 64,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          const Spacer(),
                          AppDisplayActions(),
                        ],
                      ),
                    ),
                  ),
                  Expanded(
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 1320),
                        child: shell,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _mobileNavigation(BuildContext context) {
    final s = S.of(context);
    final cs = Theme.of(context).colorScheme;
    Widget item(int i, IconData icon, IconData active, String label) {
      final on = shell.currentIndex == i;
      return Expanded(
        child: InkWell(
          onTap: () => shell.goBranch(i, initialLocation: on),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(on ? active : icon, color: on ? cs.primary : cs.onSurfaceVariant),
              const SizedBox(height: 2),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                  color: on ? cs.primary : cs.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        border: Border(top: BorderSide(color: cs.outline)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 66,
          child: Row(
            children: [
              item(0, Icons.home_outlined, Icons.home_rounded, s('home')),
              item(
                1,
                Icons.local_library_outlined,
                Icons.local_library_rounded,
                s('library'),
              ),
              Expanded(
                child: Semantics(
                  button: true,
                  label: s('tutor'),
                  child: GestureDetector(
                    key: const Key('tutorTab'),
                    onTap: () => shell.goBranch(2),
                    child: OverflowBox(
                      maxHeight: 96,
                      child: Transform.translate(
                        offset: const Offset(0, -12),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                gradient: SanzarColors.brandGradient,
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: SanzarColors.brandEmerald.withValues(
                                      alpha: .35,
                                    ),
                                    blurRadius: 14,
                                    offset: const Offset(0, 6),
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.smart_toy_rounded,
                                color: Colors.white,
                                size: 28,
                              ),
                            ),
                            Text(
                              s('tutor'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                color: shell.currentIndex == 2
                                    ? cs.primary
                                    : cs.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              item(3, Icons.forum_outlined, Icons.forum_rounded, s('community')),
              item(
                4,
                Icons.person_outline_rounded,
                Icons.person_rounded,
                s('profile'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AppDisplayActions extends StatelessWidget {
  final bool light;
  const AppDisplayActions({super.key, this.light = false});

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final s = S.of(context);
    final color = light ? Colors.white : null;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: s('theme'),
          color: color,
          onPressed: () {
            final current = scope.settings.themeMode;
            scope.settings.setThemeMode(
              current == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark,
            );
          },
          icon: Icon(
            scope.settings.themeMode == ThemeMode.dark
                ? Icons.light_mode_rounded
                : Icons.dark_mode_outlined,
          ),
        ),
        PopupMenuButton<String>(
          tooltip: s('language'),
          iconColor: color,
          onSelected: (language) async {
            await scope.settings.setLang(language);
            try {
              await scope.auth.updateProfile({'locale': language});
            } on ApiException catch (e) {
              if (context.mounted) showSnack(context, e.message);
            } catch (_) {
              if (context.mounted) showSnack(context, s('err.generic'));
            }
          },
          itemBuilder: (_) => [
            for (final (code, label) in [
              ('bn', 'বাংলা'),
              ('en', 'English'),
              ('zh', '中文'),
            ])
              PopupMenuItem(value: code, child: Text(label)),
          ],
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Icon(Icons.translate_rounded, color: color),
          ),
        ),
      ],
    );
  }
}
