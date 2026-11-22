import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-level preferences: theme, language and whether onboarding was seen.
class SettingsController extends ChangeNotifier {
  final SharedPreferences prefs;
  SettingsController(this.prefs);

  ThemeMode get themeMode => ThemeMode.values.firstWhere((m) => m.name == prefs.getString('theme'), orElse: () => ThemeMode.system);
  String get lang => prefs.getString('lang') ?? 'bn';
  bool get langChosen => prefs.getString('lang') != null;
  bool get onboarded => prefs.getBool('onboarded') ?? false;

  Future<void> setThemeMode(ThemeMode m) async {
    await prefs.setString('theme', m.name);
    notifyListeners();
  }

  Future<void> setLang(String l) async {
    if (!const ['bn', 'en', 'zh'].contains(l)) return;
    await prefs.setString('lang', l);
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    await prefs.setBool('onboarded', true);
    notifyListeners();
  }
}
