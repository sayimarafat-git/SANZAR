import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_scope.dart';
import '../../core/auth/auth_gateway.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_helpers.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s('profile'))),
      body: ListenableBuilder(
        listenable: Listenable.merge([
          scope.auth,
          scope.settings,
          scope.catalog,
        ]),
        builder: (context, _) {
          final p = scope.auth.profile;
          final level = scope.catalog.catalog?.levels
              .where((l) => l.id == p?.levelId)
              .firstOrNull;
          return ListView(
            padding: const EdgeInsets.all(SanzarSpace.s4),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(SanzarSpace.s4),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 30,
                        backgroundColor: Theme.of(context)
                            .colorScheme
                            .primaryContainer,
                        child: Text(
                          (p?.displayName.isNotEmpty ?? false)
                              ? p!.displayName.characters.first.toUpperCase()
                              : '?',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: SanzarSpace.s4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p?.displayName ?? '',
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(p?.email ?? scope.auth.account?.email ?? ''),
                            if (level != null)
                              Text(
                                level.name(s.lang),
                                style: TextStyle(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: SanzarSpace.s3),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.edit_outlined),
                      title: Text(s('editProfile')),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.go('/profile/edit'),
                    ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.insights_rounded),
                      title: Text(s('progress')),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.push('/progress'),
                    ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.assignment_outlined),
                      title: Text(s('exams')),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.push('/exams'),
                    ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.leaderboard_outlined),
                      title: Text(s('leaderboard')),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.push('/leaderboard'),
                    ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.visibility_outlined),
                      title: Text(s('visibility')),
                      trailing: DropdownButton<String>(
                        value: p?.visibility ?? 'private',
                        underline: const SizedBox(),
                        items: [
                          DropdownMenuItem(
                            value: 'public',
                            child: Text(s('visPublic')),
                          ),
                          DropdownMenuItem(
                            value: 'followers',
                            child: Text(s('visFollowers')),
                          ),
                          DropdownMenuItem(
                            value: 'private',
                            child: Text(s('visPrivate')),
                          ),
                        ],
                        onChanged: (v) async {
                          if (v == null) return;
                          try {
                            await scope.auth.updateProfile({
                              'profile_visibility': v,
                            });
                          } catch (_) {
                            if (context.mounted)
                              showSnack(context, s('err.generic'));
                          }
                        },
                      ),
                    ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.translate_rounded),
                      title: Text(s('language')),
                      trailing: DropdownButton<String>(
                        value: scope.settings.lang,
                        underline: const SizedBox(),
                        items: const [
                          DropdownMenuItem(value: 'bn', child: Text('বাংলা')),
                          DropdownMenuItem(value: 'en', child: Text('English')),
                          DropdownMenuItem(value: 'zh', child: Text('中文')),
                        ],
                        onChanged: (v) async {
                          if (v == null) return;
                          await scope.settings.setLang(v);
                          // Saved to the profile too so the website uses the same language.
                          try {
                            await scope.auth.updateProfile({'locale': v});
                          } catch (_) {}
                        },
                      ),
                    ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.dark_mode_outlined),
                      title: Text(s('theme')),
                      trailing: DropdownButton<ThemeMode>(
                        value: scope.settings.themeMode,
                        underline: const SizedBox(),
                        items: [
                          DropdownMenuItem(
                            value: ThemeMode.system,
                            child: Text(s('themeSystem')),
                          ),
                          DropdownMenuItem(
                            value: ThemeMode.light,
                            child: Text(s('themeLight')),
                          ),
                          DropdownMenuItem(
                            value: ThemeMode.dark,
                            child: Text(s('themeDark')),
                          ),
                        ],
                        onChanged: (v) =>
                            v == null ? null : scope.settings.setThemeMode(v),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: SanzarSpace.s3),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.logout_rounded),
                      title: Text(s('signOut')),
                      onTap: () async {
                        await scope.auth.signOut();
                      },
                    ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(
                        Icons.delete_forever_outlined,
                        color: SanzarColors.danger,
                      ),
                      title: Text(
                        s('deleteAccount'),
                        style: const TextStyle(color: SanzarColors.danger),
                      ),
                      onTap: () => _confirmDelete(context),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final s = S.of(context);
    final auth = AppScope.of(context).auth;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => const _DeleteDialog(),
    );
    if (ok != true) return;
    try {
      await auth.deleteAccount();
    } on AuthFailure catch (e) {
      if (context.mounted) showSnack(context, authMessage(s, e));
    } catch (_) {
      if (context.mounted) showSnack(context, s('err.generic'));
    }
  }
}

/// Owns its text controller so it outlives the closing animation.
class _DeleteDialog extends StatefulWidget {
  const _DeleteDialog();
  @override
  State<_DeleteDialog> createState() => _DeleteDialogState();
}

class _DeleteDialogState extends State<_DeleteDialog> {
  final _ctrl = TextEditingController();
  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return AlertDialog(
      title: Text(s('deleteAccount')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(s('deleteConfirm')),
            const SizedBox(height: SanzarSpace.s3),
            TextField(controller: _ctrl, onChanged: (_) => setState(() {})),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: Text(s('cancel')),
        ),
        TextButton(
          onPressed: _ctrl.text.trim() == 'DELETE'
              ? () => Navigator.pop(context, true)
              : null,
          child: Text(
            s('delete'),
            style: const TextStyle(color: SanzarColors.danger),
          ),
        ),
      ],
    );
  }
}

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name, _inst, _group;
  String? _level;
  bool _busy = false, _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    final p = AppScope.of(context).auth.profile;
    _name = TextEditingController(text: p?.displayName ?? '');
    _inst = TextEditingController(text: p?.institution ?? '');
    _group = TextEditingController(text: p?.group ?? '');
    _level = p?.levelId;
  }

  @override
  void dispose() {
    _name.dispose();
    _inst.dispose();
    _group.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final s = S.of(context);
    final auth = AppScope.of(context).auth;
    final p = auth.profile;
    final changes = <String, Object?>{
      if (_name.text.trim() != p?.displayName)
        'display_name': _name.text.trim(),
      if (_inst.text.trim() != (p?.institution ?? ''))
        'institution': _inst.text.trim(),
      if (_group.text.trim() != (p?.group ?? '') &&
          _group.text.trim().isNotEmpty)
        'grp': _group.text.trim(),
      if (_level != null && _level != p?.levelId) 'level_id': _level,
    };
    if (changes.isEmpty) {
      if (mounted) context.pop();
      return;
    }
    setState(() => _busy = true);
    try {
      await auth.updateProfile(changes);
      if (mounted) {
        showSnack(context, s('saved'));
        context.pop();
      }
    } catch (_) {
      if (mounted) showSnack(context, s('err.generic'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final levels = AppScope.of(context).catalog.catalog?.levels ?? const [];
    return Scaffold(
      appBar: AppBar(title: Text(s('editProfile'))),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(SanzarSpace.s4),
          children: [
            TextFormField(
              controller: _name,
              decoration: InputDecoration(labelText: s('name')),
              validator: (v) => validateName(s, v),
              maxLength: 60,
            ),
            const SizedBox(height: SanzarSpace.s2),
            DropdownButtonFormField<String>(
              initialValue: levels.any((l) => l.id == _level) ? _level : null,
              decoration: InputDecoration(labelText: s('class')),
              items: [
                for (final l in levels)
                  DropdownMenuItem(value: l.id, child: Text(l.name(s.lang))),
              ],
              onChanged: (v) => setState(() => _level = v),
            ),
            const SizedBox(height: SanzarSpace.s4),
            TextFormField(
              controller: _inst,
              decoration: InputDecoration(labelText: s('institution')),
              maxLength: 100,
            ),
            const SizedBox(height: SanzarSpace.s2),
            TextFormField(
              controller: _group,
              decoration: InputDecoration(labelText: s('group')),
              maxLength: 40,
              validator: (v) =>
                  (v ?? '').trim().isEmpty || v!.trim().length >= 2
                  ? null
                  : s('err.name'),
            ),
            const SizedBox(height: SanzarSpace.s4),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(s('save')),
            ),
          ],
        ),
      ),
    );
  }
}
