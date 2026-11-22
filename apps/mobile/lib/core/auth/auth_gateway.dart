import 'dart:async';

String normalizeEmail(String email) => email.trim().toLowerCase();

/// The signed-in account as the app needs it; provider-specific types stay out of the UI.
class AuthAccount {
  final String uid;
  final String? email, displayName;
  final bool emailVerified, isPassword;
  const AuthAccount({required this.uid, this.email, this.displayName, this.emailVerified = false, this.isPassword = false});
}

/// Auth failure with a stable code the UI maps to a translated message.
class AuthFailure implements Exception {
  final String code;
  const AuthFailure(this.code);
  @override
  String toString() => 'AuthFailure($code)';
}

abstract class AuthGateway {
  Stream<AuthAccount?> changes();
  AuthAccount? get current;
  Future<String?> idToken({bool forceRefresh = false});
  Future<void> signInWithEmail(String email, String password);
  Future<void> registerWithEmail(String email, String password);
  /// Returns true when this Google account is new to Sanzar.
  Future<bool> signInWithGoogle();
  Future<void> sendPasswordReset(String email);
  Future<void> sendEmailVerification();
  Future<void> reload();
  Future<void> signOut();
  Future<void> deleteAccount();
}

class UnconfiguredAuthGateway implements AuthGateway {
  @override
  Stream<AuthAccount?> changes() => Stream<AuthAccount?>.value(null);
  @override
  AuthAccount? get current => null;
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => null;
  @override
  Future<void> signInWithEmail(String email, String password) async => throw const AuthFailure('unconfigured');
  @override
  Future<void> registerWithEmail(String email, String password) async => throw const AuthFailure('unconfigured');
  @override
  Future<bool> signInWithGoogle() async => throw const AuthFailure('unconfigured');
  @override
  Future<void> sendPasswordReset(String email) async => throw const AuthFailure('unconfigured');
  @override
  Future<void> sendEmailVerification() async => throw const AuthFailure('unconfigured');
  @override
  Future<void> reload() async {}
  @override
  Future<void> signOut() async {}
  @override
  Future<void> deleteAccount() async => throw const AuthFailure('unconfigured');
}
