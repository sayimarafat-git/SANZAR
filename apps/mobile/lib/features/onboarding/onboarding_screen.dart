import 'package:flutter/material.dart';
import '../../core/app_scope.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _page = PageController();
  int _i = 0;
  static const _pages = [(Icons.menu_book_rounded, 'onb1'), (Icons.center_focus_strong_rounded, 'onb2'), (Icons.volunteer_activism_rounded, 'onb3')];

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final settings = AppScope.of(context).settings;
    final last = _i == _pages.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Row(children: [
            const Padding(padding: EdgeInsets.all(SanzarSpace.s4), child: BrandMark(size: 40)),
            const Spacer(),
            _LangPicker(),
            TextButton(onPressed: settings.completeOnboarding, child: Text(s('skip'))),
          ]),
          Expanded(
            child: PageView.builder(
              controller: _page,
              itemCount: _pages.length,
              onPageChanged: (i) => setState(() => _i = i),
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.all(SanzarSpace.s6),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Container(
                    width: 180, height: 180,
                    decoration: const BoxDecoration(gradient: SanzarColors.heroGradient, shape: BoxShape.circle),
                    child: Icon(_pages[i].$1, size: 84, color: Colors.white),
                  ),
                  const SizedBox(height: SanzarSpace.s8),
                  Text(s('${_pages[i].$2}.title'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: SanzarSpace.s3),
                  Text(s('${_pages[i].$2}.body'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
                ]),
              ),
            ),
          ),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var k = 0; k < _pages.length; k++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.all(4), height: 8, width: k == _i ? 24 : 8,
                decoration: BoxDecoration(color: k == _i ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.outline, borderRadius: BorderRadius.circular(4)),
              ),
          ]),
          Padding(
            padding: const EdgeInsets.all(SanzarSpace.s4),
            child: FilledButton(
              onPressed: last ? settings.completeOnboarding : () => _page.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut),
              child: Text(s(last ? 'getStarted' : 'next')),
            ),
          ),
        ]),
      ),
    );
  }
}

class _LangPicker extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final settings = AppScope.of(context).settings;
    return PopupMenuButton<String>(
      tooltip: S.of(context)('language'),
      icon: const Icon(Icons.translate_rounded),
      onSelected: settings.setLang,
      itemBuilder: (_) => const [PopupMenuItem(value: 'bn', child: Text('বাংলা')), PopupMenuItem(value: 'en', child: Text('English')), PopupMenuItem(value: 'zh', child: Text('中文'))],
    );
  }
}
