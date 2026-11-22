import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import 'auth_gateway.dart';

enum AuthStatus { unknown, signedOut, signedIn }

/// Combines the auth session with the app API profile (`/v1/me`).
class AuthController extends ChangeNotifier {
  final AuthGateway gateway;
  late final ApiClient api;
  StreamSubscription<AuthAccount?>? _sub;

  AuthController(this.gateway, {String apiBase = '', ApiClient? apiClient}) {
    api =
        apiClient ??
        ApiClient(
          base: apiBase,
          tokenProvider: ({bool forceRefresh = false}) =>
              gateway.idToken(forceRefresh: forceRefresh),
        );
    _sub = gateway.changes().listen(_onAccount);
  }

  AuthStatus status = AuthStatus.unknown;
  AuthAccount? account;
  Profile? profile;
  ApiException? profileError;
  String? _loadedFor;

  bool get needsVerification =>
      account != null && account!.isPassword && !account!.emailVerified;

  /// New accounts pick their class once before entering the app.
  bool pendingClassChoice = false;
  bool get needsClass => pendingClassChoice && profile != null;

  Future<void> signInWithGoogle() async {
    final isNew = await gateway.signInWithGoogle();
    if (isNew) {
      pendingClassChoice = true;
      notifyListeners();
    }
  }

  Future<void> chooseClass(String levelId, String locale) async {
    await updateProfile({'level_id': levelId, 'locale': locale});
    pendingClassChoice = false;
    notifyListeners();
  }

  Future<void> _onAccount(AuthAccount? a) async {
    account = a;
    status = a == null ? AuthStatus.signedOut : AuthStatus.signedIn;
    if (a == null) {
      profile = null;
      pendingClassChoice = false;
      _loadedFor = null;
    }
    notifyListeners();
    if (a != null && _loadedFor != a.uid) await loadProfile();
  }

  Future<void> loadProfile() async {
    if (account == null) return;
    try {
      final j = await api.get('/v1/me');
      profile = Profile.fromJson(Map<String, dynamic>.from(j['user'] as Map));
      _loadedFor = account!.uid;
      profileError = null;
    } on ApiException catch (e) {
      profileError = e;
    }
    notifyListeners();
  }

  /// Sends only the changed fields; the API validates every value again.
  Future<void> updateProfile(Map<String, Object?> changes) async {
    final j = await api.patch('/v1/me', changes);
    profile = Profile.fromJson(Map<String, dynamic>.from(j['user'] as Map));
    notifyListeners();
  }

  Future<void> register(String name, String email, String password) async {
    pendingClassChoice = true;
    try {
      await gateway.registerWithEmail(email, password);
    } catch (_) {
      pendingClassChoice = false;
      rethrow;
    }
    // The ID token has no name for email accounts, so set it on the profile.
    for (var i = 0; i < 20 && profile == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 150));
    }
    if (profile != null) await updateProfile({'display_name': name});
  }

  Future<bool> refreshVerification() async {
    await gateway.reload();
    account = gateway.current;
    final verified = account?.emailVerified == true;
    if (verified) {
      await gateway.idToken(forceRefresh: true);
      await loadProfile();
    }
    notifyListeners();
    return verified;
  }

  /// Deletes API data first, then the account from the selected auth gateway.
  Future<void> deleteAccount() async {
    await api.delete('/v1/me');
    try {
      await gateway.deleteAccount();
    } on AuthFailure catch (e) {
      if (e.code == 'recentLogin') {
        await gateway.signOut();
        rethrow;
      }
      rethrow;
    }
  }

  Future<void> signOut() => gateway.signOut();

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
