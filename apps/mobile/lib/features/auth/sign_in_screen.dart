import 'package:flutter/material.dart';

import '../../core/app_scope.dart';
import '../../core/l10n/strings.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/common.dart';
import 'auth_helpers.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _register = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final auth = AppScope.of(context).auth;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(SanzarSpace.s5),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: BrandMark()),
                  const SizedBox(height: SanzarSpace.s4),
                  Text(
                    'Sanzar',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  Text(
                    s('tagline'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: SanzarSpace.s6),
                  Text(
                    _register ? 'Create your account' : 'Sign in',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: SanzarSpace.s4),
                  Form(
                    key: _form,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_register) ...[
                          TextFormField(
                            controller: _name,
                            decoration: const InputDecoration(
                              labelText: 'Name',
                            ),
                            validator: (value) =>
                                _register && (value ?? '').trim().length < 2
                                ? 'Enter at least 2 characters.'
                                : null,
                          ),
                          const SizedBox(height: SanzarSpace.s3),
                        ],
                        TextFormField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(labelText: 'Email'),
                          validator: (value) => (value ?? '').contains('@')
                              ? null
                              : 'Enter a valid email address.',
                        ),
                        const SizedBox(height: SanzarSpace.s3),
                        TextFormField(
                          controller: _password,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Password',
                          ),
                          validator: (value) => (value ?? '').length >= 6
                              ? null
                              : 'Use at least 6 characters.',
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: SanzarSpace.s3),
                          Text(
                            _error!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                        const SizedBox(height: SanzarSpace.s4),
                        FilledButton(
                          onPressed: _busy ? null : _submit,
                          child: Text(
                            _busy
                                ? 'Please wait…'
                                : _register
                                ? 'Create account'
                                : 'Sign in',
                          ),
                        ),
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () => setState(() {
                                  _register = !_register;
                                  _error = null;
                                }),
                          child: Text(
                            _register
                                ? 'Already have an account? Sign in'
                                : 'Create an account',
                          ),
                        ),
                        if (!_register)
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () async {
                                    final email = _email.text.trim();
                                    if (!email.contains('@')) {
                                      setState(
                                        () =>
                                            _error = 'Enter your email first.',
                                      );
                                      return;
                                    }
                                    try {
                                      await auth.gateway.sendPasswordReset(
                                        email,
                                      );
                                      if (mounted) {
                                        setState(
                                          () => _error =
                                              'Password reset email sent.',
                                        );
                                      }
                                    } catch (e) {
                                      if (mounted) {
                                        setState(
                                          () => _error = authMessage(s, e),
                                        );
                                      }
                                    }
                                  },
                            child: const Text('Forgot password?'),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final auth = AppScope.of(context).auth;
    try {
      if (_register) {
        await auth.register(
          _name.text.trim(),
          _email.text.trim(),
          _password.text,
        );
      } else {
        await auth.gateway.signInWithEmail(_email.text.trim(), _password.text);
      }
    } catch (e) {
      if (mounted) setState(() => _error = authMessage(S.of(context), e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
