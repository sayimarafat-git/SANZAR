import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/app_scope.dart';
import '../../core/api/api_client.dart';
import '../../core/data/learning.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/time_ago.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});
  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  final _posts = <Post>[];
  int? _next;
  bool _loading = false, _loaded = false;
  Object? _error;
  String? _category;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loaded && !_loading) _load(reset: true);
  }

  Future<void> _load({bool reset = false}) async {
    setState(() => _loading = true);
    try {
      final (list, next) = await AppScope.of(context).learning.feed(before: reset ? null : _next, category: _category);
      setState(() {
        if (reset) _posts.clear();
        _posts.addAll(list);
        _next = next;
        _error = null;
        _loaded = true;
      });
    } catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _replace(Post p) => setState(() {
        final i = _posts.indexWhere((x) => x.id == p.id);
        if (i >= 0) _posts[i] = p;
      });

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('community'))),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('compose'),
        onPressed: () async {
          final created = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (_) => const ComposeSheet());
          if (created == true) _load(reset: true);
        },
        icon: const Icon(Icons.edit_rounded),
        label: Text(s('post')),
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView(padding: const EdgeInsets.fromLTRB(SanzarSpace.s4, 0, SanzarSpace.s4, 96), children: [
          Wrap(spacing: SanzarSpace.s2, children: [
            for (final (k, label) in [(null, s('feed')), ('general', s('general')), ('research', s('research'))])
              ChoiceChip(label: Text(label), selected: _category == k, onSelected: (_) {
                _category = k;
                _load(reset: true);
              }),
          ]),
          const SizedBox(height: SanzarSpace.s2),
          if (_loading) const Padding(padding: EdgeInsets.all(SanzarSpace.s3), child: Center(child: CircularProgressIndicator())),
          if (_error != null && _posts.isEmpty) ErrorRetry(message: s(_error is ApiException && (_error as ApiException).isNetwork ? 'err.network' : 'err.generic'), onRetry: () => _load(reset: true)),
          if (_loaded && _posts.isEmpty && _error == null) Padding(padding: const EdgeInsets.all(SanzarSpace.s8), child: Text(s('noPosts'), textAlign: TextAlign.center)),
          for (final p in _posts) PostCard(post: p, onChanged: _replace, onRemoved: () => _load(reset: true)),
          if (!_loading && _next != null) TextButton(onPressed: _load, child: Text(s('loadMore'))),
        ]),
      ),
    );
  }
}

class PostCard extends StatelessWidget {
  final Post post;
  final ValueChanged<Post> onChanged;
  final VoidCallback onRemoved;
  final bool showComments;
  const PostCard({super.key, required this.post, required this.onChanged, required this.onRemoved, this.showComments = true});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final api = AppScope.of(context).learning;
    final p = post;
    return Card(
      margin: const EdgeInsets.only(bottom: SanzarSpace.s3),
      child: Padding(
        padding: const EdgeInsets.all(SanzarSpace.s4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            InkWell(
              onTap: p.mine ? null : () => context.push('/user/${p.authorUid}'),
              child: CircleAvatar(radius: 18, child: Text(p.authorName.isEmpty ? '?' : p.authorName.characters.first.toUpperCase())),
            ),
            const SizedBox(width: SanzarSpace.s2),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.authorName, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text([timeAgo(s, p.createdAt), if (p.category == 'research') s('research')].join(' · '), style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ])),
            PopupMenuButton<String>(
              onSelected: (v) async {
                try {
                  if (v == 'delete') {
                    await api.deletePost(p.id);
                    onRemoved();
                  } else if (v == 'report') {
                    final reason = await askReason(context);
                    if (reason != null) {
                      await api.report('post', p.id, reason);
                      if (context.mounted) showSnack(context, s('reported'));
                    }
                  } else if (v == 'block') {
                    await api.setBlock(p.authorUid, true);
                    if (context.mounted) showSnack(context, s('blockedDone'));
                    onRemoved();
                  }
                } catch (_) {
                  if (context.mounted) showSnack(context, s('err.generic'));
                }
              },
              itemBuilder: (_) => [
                if (p.mine) PopupMenuItem(value: 'delete', child: Text(s('deletePost'))),
                if (!p.mine) PopupMenuItem(value: 'report', child: Text(s('report'))),
                if (!p.mine) PopupMenuItem(value: 'block', child: Text(s('block'))),
              ],
            ),
          ]),
          if (p.text.isNotEmpty) Padding(padding: const EdgeInsets.only(top: SanzarSpace.s3), child: SelectableText(p.text, style: const TextStyle(height: 1.45))),
          if (p.attachments.isNotEmpty) ...[
            const SizedBox(height: SanzarSpace.s3),
            for (final attachment in p.attachments)
              _PostAttachmentTile(attachment: attachment),
          ],
          if (p.poll != null) _PollView(post: p, onChanged: onChanged),
          const SizedBox(height: SanzarSpace.s2),
          Row(children: [
            TextButton.icon(
              onPressed: () async {
                try {
                  final (liked, n) = await api.like(p.id);
                  onChanged(p.copyWith(likedByMe: liked, likeCount: n));
                } catch (_) {
                  if (context.mounted) showSnack(context, s('err.generic'));
                }
              },
              icon: Icon(p.likedByMe ? Icons.favorite_rounded : Icons.favorite_border_rounded, color: p.likedByMe ? SanzarColors.danger : null),
              label: Text('${p.likeCount}'),
            ),
            TextButton.icon(
              onPressed: showComments ? () => context.push('/post/${p.id}', extra: p) : null,
              icon: const Icon(Icons.chat_bubble_outline_rounded),
              label: Text('${p.commentCount}'),
            ),
          ]),
        ]),
      ),
    );
  }
}

class _PostAttachmentTile extends StatelessWidget {
  final PostAttachment attachment;
  const _PostAttachmentTile({required this.attachment});

  Future<void> _open(BuildContext context) async {
    final url = attachment.url;
    if (url == null) return;
    final opened = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && context.mounted) {
      showSnack(context, S.of(context)('cannotOpen'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final url = attachment.url;
    if (url == null) return const SizedBox.shrink();
    if (attachment.mime.startsWith('image/')) {
      return Padding(
        padding: const EdgeInsets.only(bottom: SanzarSpace.s2),
        child: GestureDetector(
          onTap: () => _open(context),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(SanzarRadius.sm),
            child: Image.network(
              url,
              height: 260,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => ListTile(
                leading: const Icon(Icons.broken_image_outlined),
                title: Text(attachment.name),
              ),
            ),
          ),
        ),
      );
    }
    return Card(
      margin: const EdgeInsets.only(bottom: SanzarSpace.s2),
      child: ListTile(
        leading: Icon(
          attachment.mime == 'text/uri-list'
              ? Icons.link_rounded
              : attachment.mime == 'application/pdf'
                  ? Icons.picture_as_pdf_outlined
                  : attachment.mime.startsWith('video/')
                      ? Icons.play_circle_outline_rounded
                      : Icons.attach_file_rounded,
        ),
        title: Text(attachment.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(attachment.mime, maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: const Icon(Icons.open_in_new_rounded),
        onTap: () => _open(context),
      ),
    );
  }
}

Future<String?> askReason(BuildContext context) async {
  final s = S.of(context);
  final c = TextEditingController();
  final r = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(s('report')),
      content: TextField(controller: c, maxLength: 500, decoration: InputDecoration(hintText: s('reportReason'))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s('cancel'))),
        FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim().length >= 3 ? c.text.trim() : null), child: Text(s('report'))),
      ],
    ),
  );
  WidgetsBinding.instance.addPostFrameCallback((_) => c.dispose());
  return r;
}

class _PollView extends StatelessWidget {
  final Post post;
  final ValueChanged<Post> onChanged;
  const _PollView({required this.post, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    final poll = post.poll!;
    final total = poll.total;
    return Padding(
      padding: const EdgeInsets.only(top: SanzarSpace.s3),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(poll.question, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: SanzarSpace.s2),
        for (final (i, o) in poll.options.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: SanzarSpace.s2),
            child: InkWell(
              borderRadius: BorderRadius.circular(SanzarRadius.sm),
              onTap: () async {
                try {
                  onChanged(post.copyWith(poll: await AppScope.of(context).learning.vote(post.id, i)));
                } catch (_) {
                  if (context.mounted) showSnack(context, S.of(context)('err.generic'));
                }
              },
              child: Stack(children: [
                Positioned.fill(
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: total == 0 ? 0 : o.votes / total,
                    child: Container(decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, borderRadius: BorderRadius.circular(SanzarRadius.sm))),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s3, vertical: SanzarSpace.s2),
                  decoration: BoxDecoration(border: Border.all(color: poll.myVote == i ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.outline), borderRadius: BorderRadius.circular(SanzarRadius.sm)),
                  child: Row(children: [Expanded(child: Text(o.text)), Text(total == 0 ? '' : '${(100 * o.votes / total).round()}%')]),
                ),
              ]),
            ),
          ),
      ]),
    );
  }
}

class ComposeSheet extends StatefulWidget {
  const ComposeSheet({super.key});
  @override
  State<ComposeSheet> createState() => _ComposeSheetState();
}

class _ComposeSheetState extends State<ComposeSheet> {
  final _text = TextEditingController();
  final _q = TextEditingController();
  final _link = TextEditingController();
  final _opts = [TextEditingController(), TextEditingController()];
  final _attachments = <PostAttachment>[];
  bool _poll = false, _research = false, _busy = false;
  static const _maxAttachments = 5;
  static const _maxFileBytes = 20 * 1024 * 1024;
  static const _mimeByExtension = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'pdf': 'application/pdf',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };

  @override
  void dispose() {
    for (final c in [_text, _q, _link, ..._opts]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickFiles() async {
    final s = S.of(context);
    if (_attachments.length >= _maxAttachments) {
      showSnack(context, s('attachmentLimit'));
      return;
    }
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: _mimeByExtension.keys.toList(),
      );
      if (files.isEmpty || !mounted) return;
      final remaining = _maxAttachments - _attachments.length;
      if (files.length > remaining) {
        showSnack(context, s('attachmentLimit'));
        return;
      }
      final api = AppScope.of(context).learning;
      for (final file in files) {
        final extension = file.extension?.toLowerCase();
        final mime = extension == null ? null : _mimeByExtension[extension];
        if (mime == null) {
          showSnack(context, s('unsupportedAttachment'));
          return;
        }
        final bytes = await file.readAsBytes();
        if (!mounted) return;
        if (bytes.length > _maxFileBytes) {
          showSnack(context, s('attachmentTooLarge'));
          return;
        }
        final uploaded = await api.uploadAttachment(
          bytes,
          name: file.name,
          mime: mime,
        );
        if (!mounted) return;
        setState(() => _attachments.add(uploaded));
      }
    } on ApiException catch (e) {
      if (mounted) {
        showSnack(
          context,
          e.status == 503
              ? s('uploadUnavailable')
              : e.status == 413
                  ? s('attachmentTooLarge')
                  : e.message,
        );
      }
    } catch (_) {
      if (mounted) showSnack(context, s('err.generic'));
    }
  }

  void _attachLink() {
    final s = S.of(context);
    final value = _link.text.trim();
    final uri = Uri.tryParse(value);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
      showSnack(context, s('invalidAttachmentLink'));
      return;
    }
    if (_attachments.length >= _maxAttachments) {
      showSnack(context, s('attachmentLimit'));
      return;
    }
    setState(() {
      _attachments.add(
        PostAttachment(
          url: uri.toString(),
          name: uri.host,
          mime: 'text/uri-list',
        ),
      );
      _link.clear();
    });
  }

  Future<void> _send() async {
    final s = S.of(context);
    final opts = _opts.map((c) => c.text.trim()).where((t) => t.isNotEmpty).toList();
    if (_text.text.trim().isEmpty && !_poll && _attachments.isEmpty) return;
    if (_poll && (_q.text.trim().isEmpty || opts.length < 2)) return;
    setState(() => _busy = true);
    final scope = AppScope.of(context);
    try {
      final r = await scope.learning.createPost(
            text: _text.text.trim(), category: _research ? 'research' : 'general',
            pollQuestion: _poll ? _q.text.trim() : null, pollOptions: _poll ? opts : null,
            attachments: _attachments);
      scope.progress.refresh();
      if (mounted) {
        final xp = (r['xpAwarded'] as num?)?.toInt() ?? 0;
        if (xp > 0) showSnack(context, s('xpEarned', {'n': xp}));
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.status == 429 || e.status == 400 || e.status == 403 ? e.message : s('err.generic'));
    } catch (_) {
      if (mounted) showSnack(context, s('err.generic'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(SanzarSpace.s4, SanzarSpace.s4, SanzarSpace.s4, MediaQuery.viewInsetsOf(context).bottom + SanzarSpace.s4),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(key: const Key('postText'), controller: _text, autofocus: true, minLines: 3, maxLines: 8, maxLength: 2000, decoration: InputDecoration(hintText: s('whatsOnMind'))),
          Wrap(spacing: SanzarSpace.s2, children: [
            FilterChip(label: Text(s('addPoll')), selected: _poll, onSelected: (v) => setState(() => _poll = v)),
            FilterChip(label: Text(s('research')), selected: _research, onSelected: (v) => setState(() => _research = v)),
          ]),
          const SizedBox(height: SanzarSpace.s2),
          TextField(
            key: const Key('attachmentLink'),
            controller: _link,
            keyboardType: TextInputType.url,
            decoration: InputDecoration(
              labelText: s('attachmentLink'),
              suffixIcon: IconButton(
                tooltip: s('attachLink'),
                onPressed: _busy ? null : _attachLink,
                icon: const Icon(Icons.add_link_rounded),
              ),
            ),
            onSubmitted: (_) => _attachLink(),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _pickFiles,
              icon: const Icon(Icons.attach_file_rounded),
              label: Text(s('addAttachment')),
            ),
          ),
          if (_attachments.isNotEmpty)
            Wrap(
              spacing: SanzarSpace.s2,
              runSpacing: SanzarSpace.s1,
              children: [
                for (final (index, attachment) in _attachments.indexed)
                  InputChip(
                    label: Text(
                      attachment.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onDeleted: _busy
                        ? null
                        : () => setState(() => _attachments.removeAt(index)),
                  ),
              ],
            ),
          if (_poll) ...[
            const SizedBox(height: SanzarSpace.s2),
            TextField(controller: _q, maxLength: 200, decoration: InputDecoration(labelText: s('pollQuestion'))),
            for (final (i, c) in _opts.indexed) Padding(padding: const EdgeInsets.only(bottom: SanzarSpace.s2), child: TextField(controller: c, maxLength: 80, decoration: InputDecoration(labelText: s('option', {'n': i + 1})))),
            if (_opts.length < 6) TextButton.icon(onPressed: () => setState(() => _opts.add(TextEditingController())), icon: const Icon(Icons.add), label: Text(s('option', {'n': _opts.length + 1}))),
          ],
          const SizedBox(height: SanzarSpace.s2),
          FilledButton(key: const Key('publish'), onPressed: _busy ? null : _send, child: Text(s('post'))),
        ]),
      ),
    );
  }
}

class PostScreen extends StatefulWidget {
  final String postId;
  final Post? post;
  const PostScreen({super.key, required this.postId, this.post});
  @override
  State<PostScreen> createState() => _PostScreenState();
}

class _PostScreenState extends State<PostScreen> {
  Post? _post;
  List<Comment>? _comments;
  Object? _error;
  final _c = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _post = widget.post;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_comments == null && _error == null) _load();
  }

  Future<void> _load() async {
    try {
      final list = await AppScope.of(context).learning.comments(widget.postId);
      setState(() => _comments = list);
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _send() async {
    final t = _c.text.trim();
    if (t.isEmpty) return;
    setState(() => _busy = true);
    try {
      final c = await AppScope.of(context).learning.addComment(widget.postId, t);
      setState(() {
        _comments = [...?_comments, c];
        _post = _post?.copyWith(commentCount: (_post?.commentCount ?? 0) + 1);
        _c.clear();
      });
    } catch (_) {
      if (mounted) showSnack(context, S.of(context)('err.generic'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('comments'))),
      body: Column(children: [
        Expanded(
          child: _error != null
              ? ErrorRetry(message: s('err.generic'), onRetry: () => setState(() { _error = null; _load(); }))
              : ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
                  if (_post != null) PostCard(post: _post!, showComments: false, onChanged: (p) => setState(() => _post = p), onRemoved: () => context.pop()),
                  if (_comments == null) const Center(child: CircularProgressIndicator()),
                  for (final c in _comments ?? const <Comment>[])
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(radius: 16, child: Text(c.authorName.isEmpty ? '?' : c.authorName.characters.first)),
                      title: Text(c.authorName, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('${c.text}\n${timeAgo(s, c.createdAt)}'),
                      isThreeLine: true,
                      trailing: c.mine
                          ? IconButton(icon: const Icon(Icons.delete_outline), onPressed: () async {
                              await AppScope.of(context).learning.deleteComment(c.id);
                              setState(() => _comments = _comments!.where((x) => x.id != c.id).toList());
                            })
                          : IconButton(icon: const Icon(Icons.flag_outlined), tooltip: s('report'), onPressed: () async {
                              final r = await askReason(context);
                              if (r != null && context.mounted) {
                                await AppScope.of(context).learning.report('comment', c.id, r);
                                if (context.mounted) showSnack(context, s('reported'));
                              }
                            }),
                    ),
                ]),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(SanzarSpace.s3),
            child: Row(children: [
              Expanded(child: TextField(key: const Key('commentInput'), controller: _c, maxLength: 1000, decoration: InputDecoration(hintText: s('writeComment'), counterText: ''))),
              const SizedBox(width: SanzarSpace.s2),
              IconButton.filled(key: const Key('sendComment'), onPressed: _busy ? null : _send, icon: const Icon(Icons.send_rounded)),
            ]),
          ),
        ),
      ]),
    );
  }
}

class UserScreen extends StatefulWidget {
  final String uid;
  const UserScreen({super.key, required this.uid});
  @override
  State<UserScreen> createState() => _UserScreenState();
}

class _UserScreenState extends State<UserScreen> {
  PublicProfile? _p;
  Object? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_p == null && _error == null) _load();
  }

  Future<void> _load() async {
    try {
      final p = await AppScope.of(context).learning.user(widget.uid);
      setState(() => _p = p);
    } catch (e) {
      setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final api = AppScope.of(context).learning;
    final p = _p;
    return Scaffold(
      appBar: AppBar(),
      body: _error != null
          ? ErrorRetry(message: s('err.generic'), onRetry: () => setState(() { _error = null; _load(); }))
          : p == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(padding: const EdgeInsets.all(SanzarSpace.s4), children: [
                  Center(child: CircleAvatar(radius: 40, child: Text(p.name.isEmpty ? '?' : p.name.characters.first, style: const TextStyle(fontSize: 32)))),
                  const SizedBox(height: SanzarSpace.s3),
                  Text(p.name, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  Text('${s('followers', {'n': p.followers})} · ${s('followingN', {'n': p.following})}', textAlign: TextAlign.center),
                  if (p.limited) Padding(padding: const EdgeInsets.all(SanzarSpace.s3), child: Text(s('privateProfile'), textAlign: TextAlign.center)),
                  if (!p.limited && p.xp != null) Text(s('xpTotal', {'n': p.xp!}), textAlign: TextAlign.center),
                  if (!p.limited && (p.institution ?? '').isNotEmpty) Text(p.institution!, textAlign: TextAlign.center),
                  const SizedBox(height: SanzarSpace.s4),
                  Row(children: [
                    Expanded(
                      child: FilledButton(
                        onPressed: () async {
                          await api.setFollow(p.uid, !p.isFollowing);
                          setState(() => _p = null);
                          _load();
                        },
                        child: Text(s(p.isFollowing ? 'unfollow' : 'follow')),
                      ),
                    ),
                    const SizedBox(width: SanzarSpace.s3),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () async {
                          await api.setBlock(p.uid, true);
                          if (context.mounted) {
                            showSnack(context, s('blockedDone'));
                            context.pop();
                          }
                        },
                        child: Text(s('block')),
                      ),
                    ),
                  ]),
                ]),
    );
  }
}
