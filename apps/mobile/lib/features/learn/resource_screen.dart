import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import '../../core/app_scope.dart';
import '../../core/data/models.dart';
import '../../core/data/study_tracker.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/web_frame.dart';

enum ResourceView { pdf, video, embedded, external }

String? embeddedUrlFor(Resource resource) {
  final url = resource.url;
  if (url == null) return null;
  final uri = Uri.tryParse(url);
  if (uri == null) return null;
  final host = uri.host.toLowerCase();
  bool hostIs(String domain) => host == domain || host.endsWith('.$domain');

  if (host == 'youtu.be' || hostIs('youtube.com')) {
    final id = host == 'youtu.be'
        ? uri.pathSegments.firstOrNull
        : uri.queryParameters['v'] ??
            (uri.pathSegments.length >= 2 &&
                    const {'embed', 'shorts', 'live'}.contains(uri.pathSegments.first)
                ? uri.pathSegments[1]
                : null);
    if (id != null && RegExp(r'^[A-Za-z0-9_-]{11}$').hasMatch(id)) {
      return Uri.https('www.youtube-nocookie.com', '/embed/$id', {
        'playsinline': '1',
        'rel': '0',
      }).toString();
    }
  }

  if (host == 'drive.google.com') {
    final id = RegExp(r'/file/d/([^/]+)').firstMatch(uri.path)?.group(1) ??
        uri.queryParameters['id'];
    if (id != null && id.isNotEmpty) {
      return Uri.https('drive.google.com', '/file/d/$id/preview').toString();
    }
  }

  if (host == 'docs.google.com' &&
      uri.pathSegments.length >= 3 &&
      uri.pathSegments.first == 'presentation') {
    return Uri.https(
      'docs.google.com',
      '/presentation/d/${uri.pathSegments[2]}/embed',
    ).toString();
  }

  if (hostIs('dailymotion.com') || host == 'dai.ly') {
    final id = host == 'dai.ly'
        ? uri.pathSegments.firstOrNull
        : (uri.pathSegments.length >= 2 && uri.pathSegments.first == 'video'
            ? uri.pathSegments[1].split('_').first
            : null);
    if (id != null && id.isNotEmpty) {
      return Uri.https('www.dailymotion.com', '/embed/video/$id').toString();
    }
  }

  if (hostIs('loom.com') &&
      uri.pathSegments.length >= 2 &&
      uri.pathSegments.first == 'share') {
    return Uri.https('www.loom.com', '/embed/${uri.pathSegments[1]}')
        .toString();
  }

  if (hostIs('vimeo.com')) {
    final id = uri.pathSegments.reversed.firstWhere(
      (part) => RegExp(r'^\d+$').hasMatch(part),
      orElse: () => '',
    );
    if (id.isNotEmpty) {
      return Uri.https('player.vimeo.com', '/video/$id').toString();
    }
  }

  if (resource.type == 'ppt') {
    return Uri.https('view.officeapps.live.com', '/op/embed.aspx', {
      'src': url,
    }).toString();
  }
  if (resource.type == 'link') return url;
  return null;
}

ResourceView viewFor(Resource r) {
  final embedded = embeddedUrlFor(r);
  if (r.type == 'pdf' && embedded == null) return ResourceView.pdf;
  if (r.type == 'video' && embedded == null) return ResourceView.video;
  if (embedded != null) return kIsWeb ? ResourceView.embedded : ResourceView.external;
  if (r.type == 'ppt' || r.type == 'link') {
    return kIsWeb ? ResourceView.embedded : ResourceView.external;
  }
  return ResourceView.external;
}

class ResourceScreen extends StatelessWidget {
  final String bookId, chapterId, resourceId;
  const ResourceScreen({super.key, required this.bookId, required this.chapterId, required this.resourceId});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    final ch = scope.catalog.catalog?.book(bookId)?.chapters.where((c) => c.id == chapterId).firstOrNull;
    final r = ch?.resources.where((x) => x.id == resourceId).firstOrNull;
    if (r == null || r.url == null) return Scaffold(appBar: AppBar(), body: Center(child: Text(s('cannotOpen'))));
    final view = viewFor(r);
    return TrackedStudy(
      tracker: scope.tracker,
      type: r.type == 'link' ? 'notes' : r.type,
      chapterId: chapterId,
      resourceId: r.id,
      child: Scaffold(
        appBar: AppBar(title: Text(r.title.isEmpty ? r.type.toUpperCase() : r.title, maxLines: 1, overflow: TextOverflow.ellipsis), actions: [_DoneButton(resource: r)]),
        body: switch (view) {
          ResourceView.pdf => _PdfView(resource: r),
          ResourceView.video => _VideoView(resource: r),
          ResourceView.embedded => _EmbeddedView(resource: r),
          ResourceView.external => _ExternalView(resource: r),
        },
      ),
    );
  }
}

class _DoneButton extends StatefulWidget {
  final Resource resource;
  const _DoneButton({required this.resource});
  @override
  State<_DoneButton> createState() => _DoneButtonState();
}

class _DoneButtonState extends State<_DoneButton> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final s = S.of(context);
    final done = scope.progress.progress?.completed.contains(widget.resource.id) ?? false;
    if (done) return const Padding(padding: EdgeInsets.all(SanzarSpace.s3), child: Icon(Icons.check_circle, color: SanzarColors.success));
    return TextButton(
      onPressed: _busy
          ? null
          : () async {
              setState(() => _busy = true);
              try {
                final r = await scope.learning.complete(widget.resource.id);
                await scope.progress.refresh();
                final xp = (r['xpAwarded'] as num?)?.toInt() ?? 0;
                if (context.mounted) showSnack(context, xp > 0 ? s('xpEarned', {'n': xp}) : s('done'));
              } catch (_) {
                if (context.mounted) showSnack(context, s('err.generic'));
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
      child: Text(s('markDone')),
    );
  }
}

/// Downloads the PDF once (kept for offline use) and reopens at the last page.
class _PdfView extends StatefulWidget {
  final Resource resource;
  const _PdfView({required this.resource});
  @override
  State<_PdfView> createState() => _PdfViewState();
}

class _PdfViewState extends State<_PdfView> {
  String? _path;
  Object? _error;
  int _page = 1, _pages = 0;
  String get _pageKey => 'pdf.page.${widget.resource.id}';

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) _load();
  }

  Future<void> _load() async {
    try {
      final dir = Directory('${(await getApplicationSupportDirectory()).path}/downloads');
      await dir.create(recursive: true);
      final f = File('${dir.path}/${widget.resource.id}_v${widget.resource.version}.pdf');
      if (!await f.exists()) {
        final res = await http.get(Uri.parse(widget.resource.url!)).timeout(const Duration(minutes: 3));
        if (res.statusCode != 200 || res.bodyBytes.length < 5 || String.fromCharCodes(res.bodyBytes.take(4)) != '%PDF') throw Exception('not a pdf');
        final tmp = File('${f.path}.part');
        await tmp.writeAsBytes(res.bodyBytes, flush: true);
        await tmp.rename(f.path);
      }
      if (!mounted) return;
      _page = AppScope.of(context).settings.prefs.getInt(_pageKey) ?? 1;
      setState(() => _path = f.path);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    if (kIsWeb) {
      return Stack(
        children: [
          PdfViewer.uri(
            Uri.parse(widget.resource.url!),
            initialPageNumber: _page,
            params: PdfViewerParams(
              onDocumentChanged: (doc) => setState(() => _pages = doc?.pages.length ?? 0),
              onPageChanged: (p) {
                if (p == null) return;
                scope.tracker.activity();
                scope.settings.prefs.setInt(_pageKey, p);
                setState(() => _page = p);
              },
            ),
          ),
          if (_pages > 0)
            Positioned(
              bottom: SanzarSpace.s4,
              left: 0,
              right: 0,
              child: Center(child: Chip(label: Text(s('pageOf', {'p': _page, 'n': _pages})))),
            ),
        ],
      );
    }
    if (_error != null) return ErrorRetry(message: s('cannotOpen'), onRetry: () => setState(() { _error = null; _load(); }));
    if (_path == null) return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [const CircularProgressIndicator(), const SizedBox(height: SanzarSpace.s3), Text(s('downloading'))]));
    return Stack(children: [
      PdfViewer.file(
        _path!,
        initialPageNumber: _page,
        params: PdfViewerParams(
          onDocumentChanged: (doc) => setState(() => _pages = doc?.pages.length ?? 0),
          onPageChanged: (p) {
            if (p == null) return;
            scope.tracker.activity();
            scope.settings.prefs.setInt(_pageKey, p);
            setState(() => _page = p);
          },
        ),
      ),
      if (_pages > 0)
        Positioned(
          bottom: SanzarSpace.s4, left: 0, right: 0,
          child: Center(child: Chip(label: Text(s('pageOf', {'p': _page, 'n': _pages})))),
        ),
    ]);
  }
}

class _VideoView extends StatefulWidget {
  final Resource resource;
  const _VideoView({required this.resource});
  @override
  State<_VideoView> createState() => _VideoViewState();
}

class _VideoViewState extends State<_VideoView> {
  late final VideoPlayerController _c = VideoPlayerController.networkUrl(Uri.parse(widget.resource.url!));
  bool _failed = false, _started = false;
  late AppScope _scope;
  String get _posKey => 'video.pos.${widget.resource.id}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _scope = AppScope.of(context);
    if (!_started) {
      _started = true;
      _init();
    }
  }

  void _init() {
    _c.initialize().then((_) async {
      final pos = _scope.settings.prefs.getInt(_posKey) ?? 0;
      if (pos > 0) await _c.seekTo(Duration(seconds: pos));
      _c.addListener(_onTick);
      if (mounted) setState(() {});
    }).catchError((_) {
      if (mounted) setState(() => _failed = true);
    });
  }

  void _onTick() {
    if (!mounted) return;
    final scope = _scope;
    scope.tracker.playing = _c.value.isPlaying;
    final sec = _c.value.position.inSeconds;
    if (sec % 5 == 0) scope.settings.prefs.setInt(_posKey, sec);
  }

  @override
  void dispose() {
    _c.removeListener(_onTick);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    if (_failed) return _ExternalView(resource: widget.resource, message: s('cannotOpen'));
    if (!_c.value.isInitialized) return const Center(child: CircularProgressIndicator());
    return Column(children: [
      AspectRatio(aspectRatio: _c.value.aspectRatio, child: VideoPlayer(_c)),
      VideoProgressIndicator(_c, allowScrubbing: true),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        IconButton(icon: const Icon(Icons.replay_10_rounded), onPressed: () => _c.seekTo(_c.value.position - const Duration(seconds: 10))),
        IconButton.filled(iconSize: 36, icon: Icon(_c.value.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded), onPressed: () => setState(() => _c.value.isPlaying ? _c.pause() : _c.play())),
        IconButton(icon: const Icon(Icons.forward_10_rounded), onPressed: () => _c.seekTo(_c.value.position + const Duration(seconds: 10))),
      ]),
    ]);
  }
}

class _EmbeddedView extends StatelessWidget {
  final Resource resource;
  const _EmbeddedView({required this.resource});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final url = embeddedUrlFor(resource);
    if (!kIsWeb || url == null) return _ExternalView(resource: resource);
    return Column(
      children: [
        Expanded(child: WebFrame(key: ValueKey(url), src: url)),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: () async {
              final opened = await launchUrl(
                Uri.parse(resource.url!),
                mode: LaunchMode.externalApplication,
              );
              if (!opened && context.mounted) {
                showSnack(context, s('cannotOpen'));
              }
            },
            icon: const Icon(Icons.open_in_new_rounded),
            label: Text(s('openExternal')),
          ),
        ),
      ],
    );
  }
}

class _ExternalView extends StatelessWidget {
  final Resource resource;
  final String? message;
  const _ExternalView({required this.resource, this.message});
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(SanzarSpace.s6),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.open_in_new_rounded, size: 56),
          const SizedBox(height: SanzarSpace.s3),
          Text(message ?? s('openExternal'), textAlign: TextAlign.center),
          const SizedBox(height: SanzarSpace.s4),
          FilledButton(
            onPressed: () async {
              final ok = await launchUrl(Uri.parse(resource.url!), mode: LaunchMode.externalApplication);
              if (!ok && context.mounted) showSnack(context, s('cannotOpen'));
            },
            child: Text(resource.title.isEmpty ? resource.type.toUpperCase() : resource.title),
          ),
        ]),
      ),
    );
  }
}
