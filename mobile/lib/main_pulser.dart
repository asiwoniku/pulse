import 'package:flutter/material.dart';

import 'data/pulse_data.dart';
import 'screens/configuration_screen.dart';
import 'screens/live_app.dart';
import 'screens/pulser_home.dart';

/// **Pulser** — the driver and dispatcher app.
///
/// A separate installable app from Pulse (`com.pulse.pulser`), built from the same
/// codebase with `PULSE_APP=pulser`. They share every line of domain code because a
/// shipment is the same shipment whoever is looking at it, but they are different
/// products: different launcher, different applicationId, and a driver never sees
/// money.
///
/// Run it with:
/// ```sh
/// flutter run --flavor pulser -t lib/main_pulser.dart \
///   --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
/// ```
void main() {
  // Pulser ships without the release gate: the driver build is not a preview, and
  // a driver in the field must never be shown a screen that blocks them.
  runApp(const PulserBootstrap());
}

/// Chooses between "not configured", "not a driver", and the driver's real home.
///
/// The middle case matters: a partner who installs Pulser by mistake is told so
/// plainly and pointed at Pulse, rather than being shown an empty driver list and
/// left to guess whether the app is broken.
class PulserBootstrap extends StatefulWidget {
  const PulserBootstrap({super.key});

  @override
  State<PulserBootstrap> createState() => _PulserBootstrapState();
}

class _PulserBootstrapState extends State<PulserBootstrap> {
  late Future<PulseData?> _future = PulseData.bootstrap();

  void _retry() => setState(() => _future = PulseData.bootstrap());

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PulseData?>(
      future: _future,
      builder: (BuildContext context, AsyncSnapshot<PulseData?> snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const MaterialApp(
            debugShowCheckedModeBanner: false,
            home: Scaffold(body: Center(child: CircularProgressIndicator())),
          );
        }
        final data = snapshot.data;
        if (data == null) {
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            home: ConfigurationScreen(onRetry: _retry),
          );
        }
        return PulserApp(data: data);
      },
    );
  }
}

/// The signed-in Pulser shell.
class PulserApp extends StatefulWidget {
  const PulserApp({super.key, required this.data});
  final PulseData data;

  @override
  State<PulserApp> createState() => _PulserAppState();
}

class _PulserAppState extends State<PulserApp> {
  bool _signedIn = false;
  bool _isDriver = false;
  bool _checked = false;

  @override
  void initState() {
    super.initState();
    _signedIn = widget.data.session != null || PulseData.isDemoMode;
    if (_signedIn) _verify();
  }

  Future<void> _verify() async {
    try {
      final isDriver = await widget.data.isDriverAccount();
      if (!mounted) return;
      setState(() {
        _isDriver = isDriver;
        _checked = true;
      });
    } on PulseApiError {
      if (!mounted) return;
      setState(() => _checked = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Pulser',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F9D58)),
      ),
      home: !_signedIn
          ? SignInScreen(
              data: widget.data,
              onSignedIn: () {
                setState(() => _signedIn = true);
                _verify();
              },
            )
          : !_checked
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _isDriver
          ? PulserHome(data: widget.data)
          : WrongAppScreen(onSignOut: widget.data.signOut),
    );
  }
}

/// Shown when a partner account signs into Pulser.
///
/// Being told "this is the wrong app" is far more useful than an empty job list.
class WrongAppScreen extends StatelessWidget {
  const WrongAppScreen({super.key, required this.onSignOut});
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Icon(Icons.swap_horiz, size: 40),
                const SizedBox(height: 16),
                Text(
                  'This account is not a driver',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Pulser is for drivers and dispatchers. Sign in with Pulse to '
                  'manage your workspace.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: onSignOut,
                  child: const Text('Sign out'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
