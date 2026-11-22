import '../../core/auth/auth_gateway.dart';
import '../../core/l10n/strings.dart';

String authMessage(S strings, Object error) {
  if (error is! AuthFailure) return strings('err.generic');
  return switch (error.code) {
    'wrongCredentials' => strings('err.wrongCredentials'),
    'emailInUse' => strings('err.emailInUse'),
    'blocked' => strings('err.blocked'),
    'recentLogin' => strings('recentLogin'),
    'unconfigured' => strings('auth.unconfigured'),
    _ => strings('err.generic'),
  };
}

String? validateName(S strings, String? value) =>
    (value ?? '').trim().length >= 2 ? null : strings('err.name');
