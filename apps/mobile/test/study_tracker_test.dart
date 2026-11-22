import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sanzar/core/api/api_client.dart';
import 'package:sanzar/core/data/learning.dart';
import 'package:sanzar/core/data/study_tracker.dart';
import 'support/fakes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeApi fake;
  late StudyTracker tracker;
  late DateTime now;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    fake = FakeApi();
    now = DateTime(2026, 11, 7, 10);
    final api = LearningApi(ApiClient(base: 'https://api.test', tokenProvider: ({bool forceRefresh = false}) async => 't', client: fake.client));
    tracker = StudyTracker(api, await SharedPreferences.getInstance(), clock: () => now, observeLifecycle: false);
  });

  void seconds(int n) {
    for (var i = 0; i < n; i++) {
      now = now.add(const Duration(seconds: 1));
      tracker.tick();
    }
  }

  test('counts only while the student is active; idle time is not counted', () async {
    tracker.start('notes', chapterId: 'phy-910-01');
    seconds(60);
    seconds(200); // no touches for over 2 minutes → the last 80 s are idle
    tracker.stop();
    await tracker.flush();
    expect(fake.studyEvents.single['sec'], 120);
    expect(fake.studyEvents.single['chapterId'], 'phy-910-01');
    final ended = (fake.studyEvents.single['startedAt'] as int) + 120 * 1000;
    expect(ended <= now.millisecondsSinceEpoch, isTrue, reason: 'an event never ends in the future');
  });

  test('playing media counts without touches; long sessions split into ≤10-minute events', () async {
    tracker.start('video', resourceId: 'r1');
    tracker.playing = true;
    seconds(1500);
    tracker.stop();
    await tracker.flush();
    expect(fake.studyEvents.map((e) => e['sec']), [600, 600, 300]);
    expect(fake.studyEvents.map((e) => e['id']).toSet(), hasLength(3), reason: 'unique ids make retries safe');
  });

  test('offline events wait on the device and are sent later', () async {
    fake.offline = true;
    tracker.start('notes');
    seconds(30);
    tracker.stop();
    await tracker.flush();
    expect(tracker.queued, 1);
    fake.offline = false;
    await tracker.flush();
    expect(tracker.queued, 0);
    expect(fake.studyEvents.single['sec'], 30);
  });
}
