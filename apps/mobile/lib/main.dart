import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/firebase_auth_gateway.dart';
import 'core/config.dart';
import 'core/data/catalog_repository.dart';
import 'core/data/learning.dart';
import 'core/data/study_tracker.dart';
import 'core/settings/settings_controller.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  final prefs = await SharedPreferences.getInstance();
  final auth = AuthController(
    FirebaseAuthGateway(),
    apiBase: AppConfig.apiBase,
  );
  final learning = LearningApi(auth.api);
  final progress = ProgressStore(learning);
  final tracker = StudyTracker(
    learning,
    prefs,
    onFlushed: (_) => progress.refresh(),
  );
  runApp(
    SanzarApp(
      auth: auth,
      catalog: CatalogRepository(auth.api, prefs),
      settings: SettingsController(prefs),
      learning: learning,
      progress: progress,
      tracker: tracker,
    ),
  );
}
