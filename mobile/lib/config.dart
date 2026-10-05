/// Build-time configuration.
///
/// Supabase values arrive as `--dart-define` flags rather than being committed:
///
/// ```
/// flutter run \
///   --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
///   --dart-define=SUPABASE_ANON_KEY=sb_publishable_...
/// ```
///
/// The key here is the **publishable/anon** key and nothing else. It is designed to
/// ship inside a client: it can only read what RLS already lets this signed-in user
/// read, which is exactly the guarantee we want. A service-role key must never
/// appear in a mobile binary — it bypasses RLS entirely, so anyone who unpacks the
/// APK would be able to read every tenant's data. There is no code path here that
/// accepts one.
library;

class PulseConfig {
  const PulseConfig._();

  static const String supabaseUrl =
      String.fromEnvironment('SUPABASE_URL', defaultValue: '');

  static const String supabaseAnonKey =
      String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');

  /// The Android client ID of the Google OAuth app. Supabase needs this too — it is
  /// the same value entered in Supabase → Authentication → Providers → Google.
  static const String googleClientId =
      String.fromEnvironment('GOOGLE_CLIENT_ID', defaultValue: '');

  static bool get hasGoogleClientId =>
      !_placeholders.contains(googleClientId.trim().toLowerCase()) &&
      googleClientId.trim().isNotEmpty;

  /// Placeholder values are treated as "not configured" rather than as a URL, so a
  /// forgotten copy of `.env.example` produces an honest configuration screen
  /// instead of a confusing network error.
  static const List<String> _placeholders = <String>['', 'changeme', 'your-key', 'todo'];

  static bool get hasSupabase =>
      !_placeholders.contains(supabaseUrl.trim().toLowerCase()) &&
      supabaseUrl.startsWith('https://') &&
      !_placeholders.contains(supabaseAnonKey.trim().toLowerCase());

  /// What is missing, in the order it should be fixed. The Integrations-style
  /// checklist in the web client uses the same phrasing, so the two agree.
  static List<String> get missing => <String>[
        if (!supabaseUrl.startsWith('https://'))
          'SUPABASE_URL (pass it with --dart-define=)'
        else if (_placeholders.contains(supabaseUrl.trim().toLowerCase()))
          'SUPABASE_URL is still a placeholder',
        if (_placeholders.contains(supabaseAnonKey.trim().toLowerCase()))
          'SUPABASE_ANON_KEY (publishable key only, never the service-role key)',
      ];

  static String get missingSummary =>
      missing.isEmpty ? 'Supabase is configured.' : missing.join('\n');
}