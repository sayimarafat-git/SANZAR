import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'auth_gateway.dart';

class FirebaseAuthGateway implements AuthGateway {
  final FirebaseAuth _auth;

  FirebaseAuthGateway([FirebaseAuth? auth])
    : _auth = auth ?? FirebaseAuth.instance;

  AuthAccount? _account(User? user) {
    if (user == null) return null;
    return AuthAccount(
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      isPassword: user.providerData.any(
        (provider) => provider.providerId == 'password',
      ),
    );
  }

  @override
  Stream<AuthAccount?> changes() => _auth.authStateChanges().map(_account);

  @override
  AuthAccount? get current => _account(_auth.currentUser);

  @override
  Future<String?> idToken({bool forceRefresh = false}) async {
    final user = _auth.currentUser;
    if (user == null) return null;
    return user.getIdToken(forceRefresh);
  }

  @override
  Future<void> signInWithEmail(String email, String password) async {
    try {
      await _auth.signInWithEmailAndPassword(
        email: normalizeEmail(email),
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_mapError(e.code));
    }
  }

  @override
  Future<void> registerWithEmail(String email, String password) async {
    try {
      final result = await _auth.createUserWithEmailAndPassword(
        email: normalizeEmail(email),
        password: password,
      );
      await result.user?.sendEmailVerification();
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_mapError(e.code));
    }
  }

  @override
  Future<bool> signInWithGoogle() async {
    if (!kIsWeb) throw const AuthFailure('unsupportedProvider');
    try {
      final provider = GoogleAuthProvider();
      final result = await _auth.signInWithPopup(provider);
      return result.additionalUserInfo?.isNewUser ?? false;
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_mapError(e.code));
    }
  }

  @override
  Future<void> sendPasswordReset(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: normalizeEmail(email));
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_mapError(e.code));
    }
  }

  @override
  Future<void> sendEmailVerification() async {
    try {
      await _auth.currentUser?.sendEmailVerification();
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_mapError(e.code));
    }
  }

  @override
  Future<void> reload() async {
    await _auth.currentUser?.reload();
  }

  @override
  Future<void> signOut() => _auth.signOut();

  @override
  Future<void> deleteAccount() async {
    try {
      await _auth.currentUser?.delete();
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_mapError(e.code));
    }
  }

  String _mapError(String code) => switch (code) {
    'invalid-credential' ||
    'wrong-password' ||
    'user-not-found' => 'wrongCredentials',
    'email-already-in-use' => 'emailInUse',
    'requires-recent-login' => 'recentLogin',
    'network-request-failed' => 'network',
    'operation-not-allowed' => 'unsupportedProvider',
    _ => code,
  };
}
