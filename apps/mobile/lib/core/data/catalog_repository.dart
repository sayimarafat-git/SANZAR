import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import 'models.dart';

/// Loads the catalog from the API with ETag revalidation and keeps the last
/// good copy on the device, so the library works offline.
class CatalogRepository extends ChangeNotifier {
  static const _kBody = 'catalog.body', _kEtag = 'catalog.etag', _kAt = 'catalog.at';
  final ApiClient api;
  final SharedPreferences prefs;
  CatalogRepository(this.api, this.prefs) {
    final cached = prefs.getString(_kBody);
    if (cached != null) {
      try {
        catalog = Catalog.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      } catch (_) {
        prefs.remove(_kBody);
        prefs.remove(_kEtag);
      }
    }
  }

  Catalog? catalog;
  bool loading = false;
  bool offline = false;
  ApiException? error;
  DateTime? get savedAt => prefs.getInt(_kAt) == null ? null : DateTime.fromMillisecondsSinceEpoch(prefs.getInt(_kAt)!);

  Future<void> refresh() async {
    if (loading) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final etag = catalog == null ? null : prefs.getString(_kEtag);
      final res = await api.send('GET', '/v1/catalog', headers: {'if-none-match': ?etag});
      offline = false;
      if (res.status != 304) {
        catalog = Catalog.fromJson(res.json ?? const {});
        await prefs.setString(_kBody, res.body);
        if (res.etag != null) await prefs.setString(_kEtag, res.etag!);
      }
      await prefs.setInt(_kAt, DateTime.now().millisecondsSinceEpoch);
    } on ApiException catch (e) {
      offline = e.isNetwork;
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> clear() async {
    catalog = null;
    await prefs.remove(_kBody);
    await prefs.remove(_kEtag);
    await prefs.remove(_kAt);
    notifyListeners();
  }
}
