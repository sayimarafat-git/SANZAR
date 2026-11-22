import 'package:flutter/widgets.dart';
import 'auth/auth_controller.dart';
import 'data/catalog_repository.dart';
import 'data/learning.dart';
import 'data/study_tracker.dart';
import 'settings/settings_controller.dart';

/// Hands the app's controllers to every screen.
class AppScope extends InheritedWidget {
  final AuthController auth;
  final CatalogRepository catalog;
  final SettingsController settings;
  final LearningApi learning;
  final ProgressStore progress;
  final StudyTracker tracker;
  const AppScope({super.key, required this.auth, required this.catalog, required this.settings, required this.learning, required this.progress, required this.tracker, required super.child});

  static AppScope of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!;
  @override
  bool updateShouldNotify(AppScope old) => auth != old.auth || catalog != old.catalog || settings != old.settings || progress != old.progress;
}
