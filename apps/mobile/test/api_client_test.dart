import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sanzar/core/api/api_client.dart';
import 'package:sanzar/core/auth/auth_gateway.dart';

void main() {
  test('sends the auth token and parses JSON', () async {
    late http.Request seen;
    final api = ApiClient(
      base: 'https://api.test',
      tokenProvider: ({bool forceRefresh = false}) async => 'abc',
      client: MockClient((r) async {
        seen = r;
        return http.Response('{"ok":true}', 200);
      }),
    );
    expect(await api.get('/v1/health'), {'ok': true});
    expect(seen.headers['authorization'], 'Bearer abc');
  });

  test('retries once with a refreshed token after 401', () async {
    final tokens = <bool>[];
    var n = 0;
    final api = ApiClient(
      base: 'https://api.test',
      tokenProvider: ({bool forceRefresh = false}) async {
        tokens.add(forceRefresh);
        return forceRefresh ? 'fresh' : 'stale';
      },
      client: MockClient(
        (r) async => ++n == 1
            ? http.Response(
                '{"error":{"code":"unauthenticated","message":"expired"}}',
                401,
              )
            : http.Response('{"user":{}}', 200),
      ),
    );
    await api.get('/v1/me');
    expect(tokens, [false, true]);
  });

  test('maps API errors and network failures', () async {
    final api = ApiClient(
      base: 'https://api.test',
      tokenProvider: ({bool forceRefresh = false}) async => 't',
      client: MockClient(
        (r) async => http.Response(
          '{"error":{"code":"invalid-argument","message":"Unknown class"}}',
          400,
        ),
      ),
    );
    await expectLater(
      api.patch('/v1/me', {'level_id': 'x'}),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'invalid-argument')
            .having((e) => e.message, 'message', 'Unknown class'),
      ),
    );
    final down = ApiClient(
      base: 'https://api.test',
      tokenProvider: ({bool forceRefresh = false}) async => 't',
      client: MockClient((r) async => throw http.ClientException('down')),
    );
    await expectLater(
      down.get('/v1/me'),
      throwsA(
        isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', true),
      ),
    );
  });

  test('fails explicitly when no backend is configured', () async {
    var requestedToken = false;
    final api = ApiClient(
      base: '',
      tokenProvider: ({bool forceRefresh = false}) async {
        requestedToken = true;
        return null;
      },
    );
    await expectLater(
      api.get('/v1/me'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'configuration')
            .having(
              (e) => e.message,
              'message',
              'Backend is not configured yet.',
            ),
      ),
    );
    expect(requestedToken, isFalse);
  });

  test(
    'unconfigured auth gateway rejects authentication actions explicitly',
    () async {
      final gateway = UnconfiguredAuthGateway();
      await expectLater(
        gateway.signInWithEmail('student@example.com', 'password'),
        throwsA(
          isA<AuthFailure>().having((e) => e.code, 'code', 'unconfigured'),
        ),
      );
      await expectLater(
        gateway.registerWithEmail('student@example.com', 'password'),
        throwsA(
          isA<AuthFailure>().having((e) => e.code, 'code', 'unconfigured'),
        ),
      );
      expect(gateway.current, isNull);
      expect(await gateway.idToken(), isNull);
    },
  );
}
