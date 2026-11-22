import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sanzar/core/api/api_client.dart';
import 'package:sanzar/core/data/catalog_repository.dart';
import 'support/fakes.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('downloads once, revalidates with ETag, and works offline from the saved copy', () async {
    final fake = FakeApi();
    final api = ApiClient(base: 'https://api.test', tokenProvider: ({bool forceRefresh = false}) async => 't', client: fake.client);
    final prefs = await SharedPreferences.getInstance();

    final repo = CatalogRepository(api, prefs);
    await repo.refresh();
    expect(repo.catalog!.books, hasLength(13));

    await repo.refresh(); // unchanged → 304
    expect(fake.requests.last.headers['if-none-match'], '"v1"');
    expect(repo.catalog!.books, hasLength(13));

    // New app start without internet: the saved catalog is shown.
    fake.offline = true;
    final again = CatalogRepository(api, prefs);
    expect(again.catalog!.books, hasLength(13));
    await again.refresh();
    expect(again.offline, isTrue);
    expect(again.catalog, isNotNull);

    await again.clear();
    expect(CatalogRepository(api, prefs).catalog, isNull);
  });

  test('a corrupt saved copy is discarded instead of crashing', () async {
    SharedPreferences.setMockInitialValues({'catalog.body': '{not json', 'catalog.etag': '"x"'});
    final prefs = await SharedPreferences.getInstance();
    final repo = CatalogRepository(ApiClient(base: 'https://api.test', tokenProvider: ({bool forceRefresh = false}) async => 't', client: FakeApi().client), prefs);
    expect(repo.catalog, isNull);
    expect(prefs.getString('catalog.etag'), isNull);
  });
}
