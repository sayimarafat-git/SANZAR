import 'package:flutter_test/flutter_test.dart';
import 'package:sanzar/core/auth/auth_controller.dart';
import 'package:sanzar/router.dart';

String? r(String loc, {bool onboarded = true, AuthStatus status = AuthStatus.signedIn, bool verify = false, bool cls = false}) =>
    redirectFor(location: loc, onboarded: onboarded, status: status, needsVerification: verify, needsClass: cls);

void main() {
  test('gates run in order: loading, onboarding, sign-in, verification, class, app', () {
    expect(r('/', status: AuthStatus.unknown), '/splash');
    expect(r('/', onboarded: false, status: AuthStatus.signedOut), '/onboarding');
    expect(r('/library', status: AuthStatus.signedOut), '/sign-in');
    expect(r('/register', status: AuthStatus.signedOut), isNull);
    expect(r('/', verify: true), '/verify');
    expect(r('/', cls: true), '/choose-class');
    expect(r('/sign-in'), '/');
    expect(r('/library/book/phy-910'), isNull);
  });
}
