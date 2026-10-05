import 'package:flutter/material.dart';

import '../data/pulse_data.dart';
import 'live_workspace_home.dart';

/// The live app: Supabase is configured, so everything below is real data.
///
/// Loading, error and empty are kept strictly apart, because "nothing yet" and
/// "the request failed" look identical on a phone and mean opposite things. A
/// failure is never degraded into an empty list.
/// The partner build: sign in, then the workspace.
class PulseWorkspaceApp extends StatefulWidget {
  const PulseWorkspaceApp({super.key, required this.data});
  final PulseData data;

  @override
  State<PulseWorkspaceApp> createState() => _PulseWorkspaceAppState();
}

class _PulseWorkspaceAppState extends State<PulseWorkspaceApp> {
  late bool _signedIn = widget.data.session != null || PulseData.isDemoMode;

  void _onSignedIn() => setState(() => _signedIn = true);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Pulse',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF176B64)),
      ),
      home: _signedIn
          ? WorkspaceHome(data: widget.data)
          : SignInScreen(data: widget.data, onSignedIn: _onSignedIn),
    );
  }
}

/// A request reached Postgres and was refused. The message is the server's own:
/// the migrations raise human-readable text ("caller cannot operate"), and
/// paraphrasing a rule we do not own only makes it vaguer.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_off, size: 40),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: 20),
              FilledButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

/// The honest empty state: what is missing and what to do about it, never a
/// fabricated row standing in for a delivery that does not exist.
class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.title, required this.body, this.action});
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.inbox, size: 36),
            const SizedBox(height: 12),
            Text(title,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(body, textAlign: TextAlign.center),
            if (action != null) ...<Widget>[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.data, required this.onSignedIn});
  final PulseData data;
  final VoidCallback onSignedIn;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  // Built in initState rather than inline: `widget` is not available in a field
  // initializer, and demo credentials may only exist once state is attached.
  late final TextEditingController _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _register = false;
  String? _error;
  String? _notice;

  /// Pulser has no sign-up: a driver account exists because a partner issued it.
  bool get _canRegister => widget.data.canSelfRegister;

  @override
  void initState() {
    super.initState();
    if (PulseData.isDemoMode) {
      _identifier.text = widget.data.demoAccount.identifier;
      _password.text = widget.data.demoAccount.password;
    }
  }

  Future<void> _google() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final message = await widget.data.signInWithGoogle();
      if (!mounted) return;
      if (message.isEmpty) {
        widget.onSignedIn();
      } else {
        setState(() => _notice = message);
      }
    } on PulseApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Turning demo on fills the demo account in, so a reviewer never has to
  /// remember a fictional address to see the flow.
  Future<void> _toggleDemo(bool on) async {
    await PulseData.setDemoMode(on);
    if (!mounted) return;
    if (on) {
      final account = widget.data.demoAccount;
      setState(() {
        _identifier.text = account.identifier;
        _password.text = account.password;
        _register = false;
      });
    }
    setState(() {});
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final message = _register
          ? await widget.data.signUp(_identifier.text, _password.text)
          : await widget.data.signIn(_identifier.text, _password.text);
      if (!mounted) return;
      if (message.isEmpty) {
        widget.onSignedIn();
      } else {
        setState(() => _notice = message);
      }
    } on PulseApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Icon(widget.data.app.isPulser
                      ? Icons.local_shipping
                      : Icons.inventory_2),
                  const SizedBox(height: 10),
                  Text(
                    widget.data.app.isPulser
                        ? 'Pulser'
                        : (_register ? 'Create a Pulse account' : 'Sign in to Pulse'),
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    widget.data.app.isPulser
                        ? 'For drivers and dispatchers. Your company issues your account.'
                        : 'Partner workspace',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 20),
                  if (PulseData.isDemoMode) ...<Widget>[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.tertiaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'Demo mode. Every record is fictional and stays on this '
                        'device; nothing is read from or written to the database.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],
                  if (_error != null) ...<Widget>[
                    Text(_error!,
                        style: const TextStyle(color: Color(0xFFB3261E)),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                  ],
                  if (_notice != null) ...<Widget>[
                    Text(_notice!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    controller: _identifier,
                    keyboardType: widget.data.app.isPulser
                        ? TextInputType.text
                        : TextInputType.emailAddress,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.none,
                    decoration: InputDecoration(
                      labelText: widget.data.app.isPulser
                          ? 'Staff ID'
                          : 'Email or staff ID',
                      helperText: widget.data.app.isPulser
                          ? 'Your company gives you this. There is no sign-up here.'
                          : null,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: 'Password', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: Text(_busy
                        ? 'Signing in...'
                        : (_register ? 'Create account' : 'Sign in')),
                  ),
                  if (_canRegister)
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _register = !_register;
                                _error = null;
                                _notice = null;
                              }),
                      child: Text(_register
                          ? 'I already have an account'
                          : 'Need an account? Create one'),
                    ),

                  // Google is offered only where it makes sense: never on Pulser,
                  // where letting a personal Google account in would defeat the
                  // whole point of a partner-issued driver login.
                  if (widget.data.canUseGoogle) ...<Widget>[
                    const SizedBox(height: 8),
                    Row(
                      children: <Widget>[
                        const Expanded(child: Divider()),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text('or',
                              style: Theme.of(context).textTheme.labelSmall),
                        ),
                        const Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _google,
                      icon: const Icon(Icons.login, size: 18),
                      label: const Text('Continue with Google'),
                    ),
                  ],

                  const Divider(height: 28),
                  SwitchListTile(
                    value: PulseData.isDemoMode,
                    onChanged: _busy ? null : _toggleDemo,
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Demo mode'),
                    subtitle: const Text(
                        'Fictional data for reviewing the flow. Writes stay refused.'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}