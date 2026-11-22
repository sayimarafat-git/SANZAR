import 'package:flutter_test/flutter_test.dart';
import 'package:sanzar/core/auth/auth_gateway.dart';

void main() {
  test('email addresses are trimmed and canonicalized for auth', () {
    expect(normalizeEmail('  Student.Example@Example.com  '), 'student.example@example.com');
  });
}
