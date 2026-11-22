import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/app_scope.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import '../progress/progress_screen.dart';
import '../shell/app_shell.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final scope = AppScope.of(context);
    return Scaffold(
      body: ListenableBuilder(
        listenable: Listenable.merge([scope.catalog, scope.auth, scope.progress]),
        builder: (context, _) {
          final cat = scope.catalog.catalog;
          final profile = scope.auth.profile;
          final level = profile?.levelId;
          final name = (profile?.displayName.isNotEmpty ?? false) ? profile!.displayName.split(' ').first : '';
          return RefreshIndicator(
            onRefresh: () async => await Future.wait([scope.catalog.refresh(), scope.progress.refresh()]),
            child: CustomScrollView(slivers: [
              SliverToBoxAdapter(
                child: Container(
                  decoration: const BoxDecoration(gradient: SanzarColors.heroGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(SanzarRadius.xl))),
                  padding: EdgeInsets.fromLTRB(SanzarSpace.s5, MediaQuery.paddingOf(context).top + SanzarSpace.s4, SanzarSpace.s5, SanzarSpace.s6),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      const BrandMark(size: 36),
                      const SizedBox(width: SanzarSpace.s2),
                      const Expanded(child: Text('Sanzar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 17))),
                      if (scope.catalog.offline && MediaQuery.sizeOf(context).width > 380)
                        Chip(label: Text(s('offline')), avatar: const Icon(Icons.cloud_off_rounded, size: 16)),
                      PopupMenuButton<String>(
                        key: const Key('bell'),
                        tooltip: s('notifications'),
                        onSelected: (_) async {
                          try {
                            await scope.progress.markNotificationsRead();
                          } catch (e) {
                            if (context.mounted) {
                              showSnack(
                                context,
                                e is ApiException ? e.message : s('err.generic'),
                              );
                            }
                          }
                        },
                        itemBuilder: (_) {
                          final notifications = scope.progress.notifications;
                          if (notifications.isEmpty) {
                            return [
                              PopupMenuItem<String>(
                                enabled: false,
                                value: 'empty',
                                child: SizedBox(
                                  width: 260,
                                  child: Text(s('noNotifications')),
                                ),
                              ),
                            ];
                          }
                          return [
                            for (final n in notifications.take(8))
                              PopupMenuItem<String>(
                                value: n.id,
                                child: SizedBox(
                                  width: 280,
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        n.title,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontWeight: n.read
                                              ? FontWeight.w400
                                              : FontWeight.w700,
                                        ),
                                      ),
                                      if (n.body.isNotEmpty)
                                        Text(
                                          n.body,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                          ];
                        },
                        child: Badge(
                          isLabelVisible: scope.progress.unread > 0,
                          label: Text('${scope.progress.unread}'),
                          child: const Padding(
                            padding: EdgeInsets.all(12),
                            child: Icon(
                              Icons.notifications_none_rounded,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      if (MediaQuery.sizeOf(context).width < 900)
                        AppDisplayActions(light: true),
                    ]),
                    const SizedBox(height: SanzarSpace.s5),
                    Text(s('hello', {'name': name}), style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
                    const SizedBox(height: SanzarSpace.s1),
                    Text(s('tagline'), style: const TextStyle(color: Colors.white70)),
                  ]),
                ),
              ),
              if (cat == null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: scope.catalog.error != null ? ErrorRetry(message: s(scope.catalog.offline ? 'err.network' : 'err.generic'), onRetry: scope.catalog.refresh) : const Center(child: CircularProgressIndicator()),
                )
              else ...[
                if (scope.progress.progress != null)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(SanzarSpace.s4, SanzarSpace.s4, SanzarSpace.s4, 0),
                      child: GestureDetector(onTap: () => context.push('/progress'), child: ProgressSummary(progress: scope.progress.progress!)),
                    ),
                  ),
                SliverToBoxAdapter(child: SectionTitle(s('quickActions'))),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s4),
                    child: Row(children: [
                      for (final (icon, label, route) in [
                        (Icons.assignment_outlined, s('exams'), '/exams'),
                        (Icons.insights_rounded, s('progress'), '/progress'),
                        (Icons.leaderboard_outlined, s('leaderboard'), '/leaderboard'),
                      ])
                        Expanded(
                          child: InkWell(
                            borderRadius: BorderRadius.circular(SanzarRadius.md),
                            onTap: () => context.push(route),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: SanzarSpace.s2),
                              child: Column(children: [
                                Container(width: 52, height: 52, decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, borderRadius: BorderRadius.circular(SanzarRadius.md)), child: Icon(icon, color: Theme.of(context).colorScheme.primary)),
                                const SizedBox(height: SanzarSpace.s1),
                                Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                              ]),
                            ),
                          ),
                        ),
                    ]),
                  ),
                ),
                if (cat.announcements.isNotEmpty) ...[
                  SliverToBoxAdapter(child: SectionTitle(s('announcements'))),
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: 118,
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s4),
                        scrollDirection: Axis.horizontal,
                        itemCount: cat.announcements.length.clamp(0, 5),
                        separatorBuilder: (_, _) => const SizedBox(width: SanzarSpace.s3),
                        itemBuilder: (_, i) {
                          final a = cat.announcements[i];
                          return SizedBox(
                            width: 280,
                            child: Card(child: Padding(padding: const EdgeInsets.all(SanzarSpace.s4), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(a.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                              const SizedBox(height: SanzarSpace.s1),
                              Expanded(child: Text(a.body, maxLines: 3, overflow: TextOverflow.ellipsis)),
                            ]))),
                          );
                        },
                      ),
                    ),
                  ),
                ],
                SliverToBoxAdapter(child: SectionTitle(s('subjects'))),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s4),
                  sliver: SliverGrid.count(
                    crossAxisCount: 4, mainAxisSpacing: SanzarSpace.s3, crossAxisSpacing: SanzarSpace.s3, childAspectRatio: .82,
                    children: [
                      for (final sub in cat.subjects.where((x) => cat.booksFor(level).any((b) => b.subjectId == x.id)))
                        InkWell(
                          borderRadius: BorderRadius.circular(SanzarRadius.md),
                          onTap: () => context.go('/library?subject=${sub.id}'),
                          child: Column(children: [
                            Container(
                              width: 56, height: 56,
                              decoration: BoxDecoration(color: SanzarColors.forSubject(sub.id).withValues(alpha: .14), borderRadius: BorderRadius.circular(SanzarRadius.md)),
                              child: Icon(subjectIcon(sub.icon), color: SanzarColors.forSubject(sub.id)),
                            ),
                            const SizedBox(height: SanzarSpace.s1),
                            Text(sub.name(s.lang), maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                          ]),
                        ),
                    ],
                  ),
                ),
                if (cat.featured(level).isNotEmpty) ...[
                  SliverToBoxAdapter(child: SectionTitle(s('featured'), trailing: TextButton(onPressed: () => context.go('/library'), child: Text(s('seeAll'))))),
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: 190,
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: SanzarSpace.s4),
                        scrollDirection: Axis.horizontal,
                        itemCount: cat.featured(level).length,
                        separatorBuilder: (_, _) => const SizedBox(width: SanzarSpace.s3),
                        itemBuilder: (_, i) {
                          final b = cat.featured(level)[i];
                          return GestureDetector(
                            onTap: () => context.go('/library/book/${b.id}'),
                            child: SizedBox(width: 110, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              BookCover(colors: b.cover, title: b.title, width: 110),
                              const SizedBox(height: SanzarSpace.s1),
                              Text(s('chapters', {'n': b.chapters.length}), style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                            ])),
                          );
                        },
                      ),
                    ),
                  ),
                ],
                const SliverToBoxAdapter(child: SizedBox(height: SanzarSpace.s8)),
              ],
            ]),
          );
        },
      ),
    );
  }
}

IconData subjectIcon(String icon) => switch (icon) {
      'calc' => Icons.calculate_rounded,
      'atom' => Icons.science_rounded,
      'flask' => Icons.biotech_rounded,
      'leaf' => Icons.eco_rounded,
      'lang' => Icons.translate_rounded,
      'monitor' => Icons.computer_rounded,
      'feather' => Icons.edit_note_rounded,
      _ => Icons.grid_view_rounded,
    };
