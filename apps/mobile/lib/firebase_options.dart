import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

class DefaultFirebaseOptions {
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const _authDomain = String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const _messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
  );

  static FirebaseOptions get currentPlatform {
    if ([
      _apiKey,
      _appId,
      _messagingSenderId,
      _projectId,
    ].any((value) => value.isEmpty)) {
      throw StateError(
        'Firebase configuration is incomplete. Provide the FIREBASE_* dart-defines.',
      );
    }

    if (kIsWeb && _authDomain.isEmpty) {
      throw StateError('FIREBASE_AUTH_DOMAIN dart-define is required on web.');
    }

    return FirebaseOptions(
      apiKey: _apiKey,
      appId: _appId,
      authDomain: kIsWeb ? _authDomain : null,
      messagingSenderId: _messagingSenderId,
      projectId: _projectId,
      storageBucket: _storageBucket.isEmpty ? null : _storageBucket,
    );
  }
}
