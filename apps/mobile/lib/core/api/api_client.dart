import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

/// Error returned by the Sanzar API (`{error:{code,message}}`) or by the network.
class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  const ApiException(this.status, this.code, this.message);
  bool get isNetwork => status == 0 && code == 'network';
  bool get isUnauthorized => status == 401;
  @override
  String toString() => 'ApiException($status $code: $message)';
}

/// Returns a fresh bearer token, or null when signed out.
typedef TokenProvider = Future<String?> Function({bool forceRefresh});

class ApiResponse {
  final int status;
  final Map<String, dynamic>? json;
  final String? etag;
  final String body;
  const ApiResponse(this.status, this.json, this.etag, this.body);
}

class ApiClient {
  final String base;
  final http.Client _http;
  final TokenProvider tokenProvider;
  final Duration timeout;
  ApiClient({required this.base, required this.tokenProvider, http.Client? client, this.timeout = const Duration(seconds: 20)}) : _http = client ?? http.Client();

  Future<ApiResponse> send(String method, String path, {Object? body, List<int>? bytes, Map<String, String> headers = const {}, bool retried = false}) async {
    if (base.isEmpty) throw const ApiException(0, 'configuration', 'Backend is not configured yet.');
    final token = await tokenProvider(forceRefresh: retried);
    final req = http.Request(method, Uri.parse('$base$path'))
      ..headers.addAll({'accept': 'application/json', if (token != null) 'authorization': 'Bearer $token', ...headers});
    if (bytes != null) {
      req.bodyBytes = bytes;
    } else if (body != null) {
      req.headers['content-type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(timeout));
    } on SocketException {
      throw const ApiException(0, 'network', 'No connection');
    } on TimeoutException {
      throw const ApiException(0, 'network', 'Request timed out');
    } on http.ClientException catch (e) {
      throw ApiException(0, 'network', e.message);
    }
    // One retry with a refreshed token if the cached one expired.
    if (res.statusCode == 401 && !retried && token != null) return send(method, path, body: body, bytes: bytes, headers: headers, retried: true);
    Map<String, dynamic>? data;
    if (res.body.isNotEmpty) {
      try {
        final d = jsonDecode(res.body);
        if (d is Map<String, dynamic>) data = d;
      } catch (_) {}
    }
    if (res.statusCode >= 400) {
      final err = (data?['error'] as Map?) ?? const {};
      throw ApiException(res.statusCode, '${err['code'] ?? 'http-${res.statusCode}'}', '${err['message'] ?? 'Request failed'}');
    }
    return ApiResponse(res.statusCode, data, res.headers['etag'], res.body);
  }

  Future<Map<String, dynamic>> get(String path) async => (await send('GET', path)).json ?? const {};
  Future<Map<String, dynamic>> patch(String path, Object body) async => (await send('PATCH', path, body: body)).json ?? const {};
  Future<Map<String, dynamic>> post(String path, Object body) async => (await send('POST', path, body: body)).json ?? const {};
  Future<Map<String, dynamic>> delete(String path) async => (await send('DELETE', path)).json ?? const {};
  Future<Map<String, dynamic>> postBytes(
    String path,
    List<int> bytes, {
    required String contentType,
  }) async =>
      (await send(
        'POST',
        path,
        bytes: bytes,
        headers: {'content-type': contentType},
      )).json ??
      const {};
}
