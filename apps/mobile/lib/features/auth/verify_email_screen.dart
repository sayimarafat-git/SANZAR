import 'package:flutter/material.dart';

import '../../core/app_scope.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import 'auth_helpers.dart';

class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key});
  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen>
    with WidgetsBindingObserver {
  bool _checking = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Returning from the mail app re-checks verification automatically.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkVerification();
  }

  Future<void> _checkVerification() async {
    if (_checking) return;
    setState(() {
      _checking = true;
      _message = null;
    });
    try {
      final verified = await AppScope.of(context).auth.refreshVerification();
      if (!verified && mounted) {
        setState(() => _message = S.of(context)('notVerified'));
      }
    } catch (_) {
      if (mounted) setState(() => _message = S.of(context)('err.generic'));
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final auth = AppScope.of(context).auth;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SanzarSpace.s6),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.mark_email_unread_outlined, size: 72),
              const SizedBox(height: SanzarSpace.s4),
              Text(
                s('verifyEmail', {'email': auth.account?.email ?? ''}),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (_message != null) ...[
                const SizedBox(height: SanzarSpace.s3),
                Text(
                  _message!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const SizedBox(height: SanzarSpace.s6),
              FilledButton(
                onPressed: _checking ? null : _checkVerification,
                child: _checking
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(s('continue')),
              ),
              const SizedBox(height: SanzarSpace.s3),
              OutlinedButton(
                onPressed: () async {
                  try {
                    await auth.gateway.sendEmailVerification();
                  } catch (e) {
                    if (context.mounted) showSnack(context, authMessage(s, e));
                  }
                },
                child: Text(s('resend')),
              ),
              TextButton(onPressed: auth.signOut, child: Text(s('signOut'))),
            ],
          ),
        ),
      ),
    );
  }
}
