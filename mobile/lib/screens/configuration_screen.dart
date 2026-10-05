import 'package:flutter/material.dart';

import '../config.dart';

/// Shown when the app was built without Supabase credentials.
///
/// This screen exists so that "not configured" is a first-class state rather than a
/// crash or a silent empty list. It names the exact flags to pass, because the
/// alternative is a person staring at an error that means nothing.
class ConfigurationScreen extends StatelessWidget {
  const ConfigurationScreen({super.key, required this.onRetry});

  /// Re-checks configuration without a full restart, so someone can fix their
  /// launch options and retry without retyping anything.
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final missing = PulseConfig.missing;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 640),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(Icons.settings_ethernet, size: 40),
                  const SizedBox(height: 16),
                  Text(
                    'Pulse is not connected yet',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'This build has no Supabase project, so it cannot read or '
                    'write any real shipment. Nothing is invented to fill the gap.',
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'What is missing',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  ...missing.map(
                    (String item) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('• $item'),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'How to supply it',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(
                        context,
                      ).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const SelectableText(
                      'flutter run \\\n'
                      '  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \\\n'
                      '  --dart-define=SUPABASE_ANON_KEY=sb_publishable_...',
                      style: TextStyle(fontFamily: 'monospace', fontSize: 12),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Use the publishable or anon key only. A service-role key must '
                    'never be placed in a mobile binary: it bypasses row-level '
                    'security, so anyone who unpacked the app could read every '
                    "tenant's data.",
                    style: TextStyle(fontSize: 12),
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Check again'),
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
