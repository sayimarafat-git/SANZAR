import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'core/app_scope.dart';
import 'core/auth/auth_controller.dart';
import 'core/data/catalog_repository.dart';
import 'core/data/learning.dart';
import 'core/data/study_tracker.dart';
import 'core/l10n/strings.dart';
import 'core/settings/settings_controller.dart';
import 'core/theme/app_theme.dart';
import 'router.dart';

class SanzarApp extends StatefulWidget {
  final AuthController auth;
  final CatalogRepository catalog;
  final SettingsController settings;
  final LearningApi learning;
  final ProgressStore progress;
  final StudyTracker tracker;
  const SanzarApp({super.key, required this.auth, required this.catalog, required this.settings, required this.learning, required this.progress, required this.tracker});
  @override
  State<SanzarApp> createState() => _SanzarAppState();
}

class _SanzarAppState extends State<SanzarApp> {
  late final GoRouter _router = buildRouter(widget.auth, widget.settings);
  String? _catalogFor;

  @override
  void initState() {
    super.initState();
    widget.auth.addListener(_syncCatalog);
    _syncCatalog();
  }

  /// Loads the catalog once per signed-in user; clears it on sign-out.
  void _syncCatalog() {
    final uid = widget.auth.status == AuthStatus.signedIn && !widget.auth.needsVerification ? widget.auth.account?.uid : null;
    if (uid == _catalogFor) return _applyProfileLang();
    _catalogFor = uid;
    if (uid != null) {
      widget.catalog.refresh();
      widget.progress.refresh();
      widget.tracker.flush();
    } else {
      widget.progress.clear();
    }
    _applyProfileLang();
  }

  /// A new device follows the language saved on the account; a language
  /// already chosen on this device is kept (and synced to the account by Profile).
  void _applyProfileLang() {
    final lang = widget.auth.profile?.locale;
    if (lang != null && !widget.settings.langChosen) widget.settings.setLang(lang);
  }

  @override
  void dispose() {
    widget.auth.removeListener(_syncCatalog);
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppScope(
        auth: widget.auth,
        catalog: widget.catalog,
        settings: widget.settings,
        learning: widget.learning,
        progress: widget.progress,
        tracker: widget.tracker,
        child: ListenableBuilder(
          listenable: widget.settings,
          builder: (context, _) => MaterialApp.router(
            title: 'Sanzar',
            debugShowCheckedModeBanner: false,
            theme: buildTheme(Brightness.light),
            darkTheme: buildTheme(Brightness.dark),
            themeMode: widget.settings.themeMode,
            locale: Locale(widget.settings.lang),
            supportedLocales: S.supported,
            localizationsDelegates: const [S.delegate, GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
            routerConfig: _router,
          ),
        ),
      );
}
