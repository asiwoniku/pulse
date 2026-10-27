import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart' as launcher;

import '../config.dart';
import 'demo_data.dart';
import 'models.dart';

/// Reached Postgres and was refused.
///
/// The message is the server's own. The migrations raise human-readable text
/// ("caller cannot operate", "this order can no longer be answered"), and
/// paraphrasing a rule we do not own only makes it vaguer.
class PulseApiError implements Exception {
  const PulseApiError(this.message, {this.code});
  final String message;
  final String? code;

  factory PulseApiError.fromPostgrest(PostgrestException e) =>
      PulseApiError(e.message, code: e.code);

  @override
  String toString() => message;
}

/// One codebase, two products.
///
/// Pulse is the partner operations workspace; Pulser is what a driver or dispatcher
/// carries. They are separate installable apps — different applicationId, different
/// launcher name — but they share every line of domain code, because a shipment is
/// the same shipment whoever is looking at it.
enum PulseApp {
  partner('Pulse', 'com.pulse.pulse'),
  pulser('Pulser', 'com.pulse.pulser');

  const PulseApp(this.label, this.applicationId);
  final String label;
  final String applicationId;

  /// Resolved at compile time from `--dart-define=PULSE_APP=pulser`, so the wrong
  /// build can never be mistaken for the right one.
  static PulseApp get current =>
      const String.fromEnvironment('PULSE_APP', defaultValue: 'partner') ==
          'pulser'
      ? PulseApp.pulser
      : PulseApp.partner;

  bool get isPulser => this == PulseApp.pulser;
}

/// The app's single door to Postgres.
///
/// Every read carries the signed-in user's own token, so row-level security
/// decides what comes back. **An empty list is a real answer** and is never
/// replaced with sample rows.
class PulseData {
  PulseData._(this._client, this._storage, this.app);

  final SupabaseClient _client;
  final FlutterSecureStorage _storage;
  final PulseApp app;

  static const String _tokenKey = 'pulse.access_token';
  static const String _refreshKey = 'pulse.refresh_token';
  static const String _businessKey = 'pulse.business_id';
  static const String _demoKey = 'pulse.demo';

  static const FlutterSecureStorage _prefs = FlutterSecureStorage();

  /// Demo mode is opt-in and remembered per device. Nothing enables it by
  /// accident: no URL parameter, no environment variable.
  static bool get isDemoMode {
    try {
      return _prefs.read(key: _demoKey) == '1';
    } catch (_) {
      return false;
    }
  }

  static Future<void> setDemoMode(bool on) async {
    try {
      if (on) {
        await _prefs.write(key: _demoKey, value: '1');
      } else {
        await _prefs.delete(key: _demoKey);
      }
    } catch (_) {
      /* Storage unavailable: demo simply cannot be enabled. */
    }
  }

  SupabaseClient get client => _client;
  Session? get session => _client.auth.currentSession;
  String? get userId => session?.user.id;
  String? get email => session?.user.email;

  /// Boots Supabase and restores a saved session.
  ///
  /// Returns null when no project is configured: "no database" is a state a person
  /// needs to see and fix, not a crash, so every caller handles null by design.
  static Future<PulseData?> bootstrap() async {
    if (!PulseConfig.hasSupabase) return null;
    await Supabase.initialize(
      url: PulseConfig.supabaseUrl,
      anonKey: PulseConfig.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(
        autoRefreshToken: true,
        persistSession: true,
      ),
    );
    final storage = const FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
    );
    final data = PulseData._(
      Supabase.instance.client,
      storage,
      PulseApp.current,
    );

    final token = await storage.read(key: _tokenKey);
    if (token != null && token.isNotEmpty) {
      final refresh = await storage.read(key: _refreshKey) ?? '';
      try {
        // A refresh token Supabase rejects means the session is genuinely gone;
        // clearing it stops the app showing a signed-in shell it cannot use.
        final response = await data._client.auth
            .setSession(refresh, accessToken: token)
            .timeout(const Duration(seconds: 20));
        if (response.session == null) await data.signOut();
      } catch (_) {
        await data.signOut();
      }
    }
    return data;
  }

  Future<void> _persist(Session session) async {
    await _storage.write(key: _tokenKey, value: session.accessToken);
    await _storage.write(key: _refreshKey, value: session.refreshToken ?? '');
  }

  /// Sign in with an email address or a staff ID.
  ///
  /// Supabase authenticates on email, so a staff login resolves the account's
  /// reserved address first, through a `SECURITY DEFINER` function the database
  /// owns. The mapping is deliberately never held in the app: a stolen binary
  /// cannot be used to enumerate which staff IDs exist, and an unknown ID reports
  /// the same wording as a wrong password.
  Future<String> signIn(String identifier, String password) async {
    final id = identifier.trim();
    if (id.isEmpty || password.isEmpty) {
      throw const PulseApiError('Enter your details and try again.');
    }

    // Demo sign-in is answered locally and never touches Supabase. It still checks
    // the password, because a preview that accepts anything teaches a reviewer
    // nothing about the real flow.
    if (isDemoMode) {
      final account = demoAccountFor(id);
      if (account == null || account.password != password) {
        throw const PulseApiError(
          'That demo sign-in does not match. Use one of the accounts listed below.',
        );
      }
      await _storage.write(key: _businessKey, value: 'demo-business');
      return '';
    }

    try {
      final email = id.contains('@') ? id : await _staffEmail(id);
      final response = await _client.auth
          .signInWithPassword(email: email, password: password)
          .timeout(const Duration(seconds: 20));
      if (response.session == null) {
        throw const PulseApiError('That sign-in did not return a session.');
      }
      await _persist(response.session!);
      return '';
    } on AuthException catch (e) {
      throw PulseApiError(e.message, code: e.code);
    }
  }

  /// The demo account this build signs in as. Pulser only knows the driver
  /// account: the point of the separation is that a driver build has no partner
  /// sign-in to stumble into.
  DemoAccount get demoAccount =>
      app.isPulser ? demoDriverAccount : demoPartnerAccount;

  /// Everything the sign-in screen should offer, so nobody has to remember a
  /// fictional email address.
  List<DemoAccount> get demoAccounts => <DemoAccount>[demoAccount];

  DemoAccount? demoAccountFor(String identifier) {
    final id = identifier.trim().toLowerCase();
    return id == demoAccount.identifier.toLowerCase() ? demoAccount : null;
  }

  /// Whether this signed-in identity is a driver. Resolved by the database, so a
  /// partner account opening Pulser is told plainly rather than shown a blank
  /// driver screen.
  Future<bool> isDriverAccount() async {
    if (isDemoMode) return app.isPulser;
    try {
      final rows = await _client
          .from('drivers')
          .select('id')
          .eq('profile_user_id', userId ?? '')
          .limit(1);
      return rows.isNotEmpty;
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  Future<String> _staffEmail(String staffId) async {
    final result = await _client.rpc(
      'staff_login_email',
      params: <String, dynamic>{'p_staff_id': staffId},
    );
    final value = result is List && result.isNotEmpty ? result.first : result;
    if (value == null) {
      // Deliberately identical to a wrong password. Anything else turns this into
      // an oracle for discovering which staff IDs are real.
      throw const PulseApiError('Invalid login credentials');
    }
    return value.toString();
  }

  /// Whether this build offers Google sign-in.
  ///
  /// Pulser never does: a driver account is issued by a partner, so letting a
  /// personal Google account in would defeat the whole point of the partner-issued
  /// login. The check also covers a missing client id, so the button never appears
  /// in a build that could only fail.
  bool get canUseGoogle => PulseConfig.hasGoogleClientId && !app.isPulser;

  /// Sign in with Google, through the system browser.
  ///
  /// Supabase performs the exchange server-side, so no Google credential is ever
  /// handled by this app and the user's password is never typed into it. The
  /// browser returns through the deep link declared in AndroidManifest.xml, which
  /// is where the session appears.
  Future<String> signInWithGoogle() async {
    try {
      final response = await _client.auth.getOAuthSignInUrl(
        provider: OAuthProvider.google,
        redirectTo: const String.fromEnvironment(
          'OAUTH_REDIRECT_URL',
          // Must match a Redirect URL in the Supabase dashboard. The scheme is the
          // one the manifest declares.
          defaultValue: 'com.supabase.pulse://login-callback',
        ),
      );
      final url = response.url;

      final launched = await launcher.launchUrl(
        Uri.parse(url),
        mode: launcher.LaunchMode.externalApplication,
      );
      if (!launched) {
        throw const PulseApiError(
          'No browser is available to complete Google sign-in.',
        );
      }

      // Wait for the round trip to deliver a session. If Google is not enabled in
      // the Supabase project the browser returns without one, so this gives up
      // with the reason rather than leaving a dead screen.
      for (var attempt = 0; attempt < 40; attempt++) {
        await Future<void>.delayed(const Duration(milliseconds: 500));
        final session = _client.auth.currentSession;
        if (session != null) {
          await _persist(session);
          return '';
        }
      }
      throw const PulseApiError(
        'Google sign-in did not complete. Check that Google is enabled under '
        'Authentication → Providers in the Supabase project, that '
        'GOOGLE_CLIENT_ID was passed to this build, and that '
        'com.supabase.pulse://login-callback is in its Redirect URLs.',
      );
    } on AuthException catch (e) {
      throw PulseApiError(e.message, code: e.code);
    }
  }

  Future<String> signUp(
    String email,
    String password, {
    String? fullName,
  }) async {
    try {
      final response = await _client.auth.signUp(
        email: email.trim(),
        password: password,
        data: fullName == null || fullName.trim().isEmpty
            ? null
            : <String, dynamic>{'full_name': fullName.trim()},
      );
      if (response.session == null) {
        // Email confirmation is on by default: the account exists but cannot sign
        // in yet, and saying so beats a screen that merely looks broken.
        return 'Account created. Check your email to confirm the address, then sign in.';
      }
      await _persist(response.session!);
      return '';
    } on AuthException catch (e) {
      throw PulseApiError(e.message, code: e.code);
    }
  }

  /// Pulser has no sign-up. A driver account exists because a partner issued it,
  /// so the register screen is simply not reachable in that build.
  bool get canSelfRegister => !app.isPulser;

  Future<void> signOut() async {
    await _client.auth.signOut();
    for (final k in <String>[_tokenKey, _refreshKey, _businessKey]) {
      await _storage.delete(key: k);
    }
  }

  Future<String?> activeBusinessId() async => _storage.read(key: _businessKey);

  Future<void> selectBusiness(String id) =>
      _storage.write(key: _businessKey, value: id);

  /* ---------------- workspaces ---------------- */

  /// Workspaces this account belongs to. Empty means none — never a substitute.
  Future<List<Workspace>> workspaces() async {
    try {
      final rows = await _client
          .from('businesses')
          .select(
            'id,name,kind,city,country_code,currency,phone_e164,logo_url,service_areas,is_active',
          )
          .order('name');
      return (rows as List<dynamic>)
          .map((r) => Workspace.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /// Creates a workspace through the guarded RPC, which also provisions the
  /// caller's `owner` membership in the same transaction.
  Future<void> createBusiness({
    required String name,
    String? city,
    String? countryCode,
    String? currency,
    String kind = 'carrier',
    String? phoneE164,
  }) async {
    try {
      await _client.rpc(
        'create_business',
        params: <String, dynamic>{
          'p_name': name.trim(),
          if (city != null && city.trim().isNotEmpty) 'p_city': city.trim(),
          if (countryCode != null && countryCode.trim().isNotEmpty)
            'p_country_code': countryCode.trim().toUpperCase(),
          if (currency != null && currency.trim().isNotEmpty)
            'p_currency': currency.trim().toUpperCase(),
          'p_kind': kind,
          // 0017 requires a phone number for vendors; the database enforces it.
          if (phoneE164 != null && phoneE164.trim().isNotEmpty)
            'p_phone_e164': phoneE164.trim(),
        },
      );
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /// Redeems an invitation code. Only the account it was issued to can use it.
  Future<void> acceptInvitation(String code) async {
    try {
      await _client.rpc(
        'accept_invitation',
        params: <String, dynamic>{'p_code': code.trim()},
      );
      await _storage.delete(key: _businessKey);
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /* ---------------- partner reads ---------------- */

  Future<List<Shipment>> shipments(
    String businessId, {
    int offset = 0,
    int limit = 25,
  }) async {
    if (isDemoMode) return demoShipments();
    try {
      final rows = await _client
          .from('shipments')
          .select(
            'id,pulse_shipment_id,business_id,current_status,order_id,created_at,'
            'last_event_received_at,last_verified_event_at,last_verified_location',
          )
          .eq('business_id', businessId)
          .order('created_at', ascending: false)
          .range(offset, offset + limit - 1);
      return (rows as List<dynamic>)
          .map((r) => Shipment.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  Future<List<ShipmentEvent>> shipmentEvents(String shipmentId) async {
    if (isDemoMode) return demoEvents();
    try {
      final rows = await _client
          .from('shipment_events')
          .select(
            'event_id,event_type,source_type,source_reference,occurred_at,received_at,'
            'location,verification_status,order_status_from,order_status_to',
          )
          .eq('shipment_id', shipmentId)
          .order('occurred_at', ascending: false)
          .limit(500);
      return (rows as List<dynamic>)
          .map(
            (r) => ShipmentEvent.fromJson(Map<String, dynamic>.from(r as Map)),
          )
          .toList();
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  Future<List<OrderRow>> orders(
    String businessId, {
    int offset = 0,
    int limit = 25,
  }) async {
    if (isDemoMode) return demoOrders();
    try {
      final rows = await _client
          .from('orders')
          .select(
            'id,reference,status,service_type,pickup_text,destination_text,'
            'price_amount,currency,payment_status,promised_at,created_at,requires_otp',
          )
          .eq('business_id', businessId)
          .order('created_at', ascending: false)
          .range(offset, offset + limit - 1);
      return (rows as List<dynamic>)
          .map((r) => OrderRow.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  Future<List<DriverRow>> drivers(String businessId) async {
    if (isDemoMode) return demoDrivers();
    try {
      final rows = await _client
          .from('drivers')
          .select(
            'id,business_id,status,staff_id,full_name,phone_e164,account_active',
          )
          .eq('business_id', businessId)
          .order('created_at', ascending: false);
      return (rows as List<dynamic>)
          .map((r) => DriverRow.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /* ---------------- driver surface (Pulser) ---------------- */
  /* These six are the entire driver-facing API. `guard_order_columns` (0013)
   * makes it structurally impossible for a driver to touch price or payment
   * state, so there is deliberately no driver method for either. */

  /// The signed-in user's own driver row, resolved by the database from
  /// `auth.uid()`. Never found by scanning the workspace.
  Future<DriverProfile?> currentDriver() async {
    if (isDemoMode) return demoDriverProfile();
    try {
      final rows = await _client
          .from('drivers')
          .select('id,business_id,status,staff_id,full_name')
          .eq('profile_user_id', userId ?? '')
          .limit(1);
      if (rows.isEmpty) return null;
      return DriverProfile.fromJson(
        Map<String, dynamic>.from(rows.first as Map),
      );
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /// Jobs assigned to this driver. RLS already restricts this; the explicit filter
  /// is belt-and-braces so a mistake in a policy cannot widen it.
  Future<List<Assignment>> myAssignments(String driverId) async {
    if (isDemoMode) return demoAssignments();
    try {
      final rows = await _client
          .from('driver_assignments')
          .select(
            'id,order_id,status,scheduled_start,notes,'
            'order:orders!inner(id,reference,pickup_text,destination_text,requires_otp),'
            'shipments!inner(pulse_shipment_id)',
          )
          .eq('driver_id', driverId)
          .order('scheduled_start', ascending: true, nullsFirst: false);
      return (rows as List<dynamic>)
          .map((r) => Assignment.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  Future<void> respondToAssignment(
    String assignmentId,
    bool accept, {
    String? reason,
  }) async {
    await _guardDemo('Accepting a job needs a live account.');
    try {
      await _client.rpc(
        'respond_to_assignment',
        params: <String, dynamic>{
          'p_assignment_id': assignmentId,
          'p_accept': accept,
          'p_reason': reason,
        },
      );
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /// Records a delivery attempt. A *failed* attempt is normal and expected: it
  /// creates a real exception case rather than destroying the primary status.
  Future<void> recordDeliveryAttempt(
    String orderId,
    String event, {
    String? note,
  }) async {
    await _guardDemo('Recording an attempt needs a live account.');
    try {
      await _client.rpc(
        'record_delivery_attempt',
        params: <String, dynamic>{
          'p_order_id': orderId,
          'p_event': event,
          'p_note': note,
        },
      );
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /// Proof of delivery. The database rejects this unless the order actually
  /// reached `delivered` and, where the business asked for one, a correct OTP was
  /// given. An unsigned delivery cannot be dressed up as proved.
  Future<void> captureProofOfDelivery(
    String orderId, {
    required String recipientName,
    String? photoUrl,
    String? signatureUrl,
    String? otp,
  }) async {
    await _guardDemo('Proof of delivery needs a live account.');
    try {
      await _client.rpc(
        'capture_proof_of_delivery',
        params: <String, dynamic>{
          'p_order_id': orderId,
          'p_recipient_name': recipientName,
          'p_photo_url': photoUrl,
          'p_signature_url': signatureUrl,
          'p_otp': otp,
        },
      );
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /// Go on or off the available list. A driver who is unavailable is offered no
  /// new work, which is the whole point of the flag.
  Future<void> setDriverAvailability(String driverId, bool available) async {
    await _guardDemo('Availability needs a live account.');
    try {
      await _client.rpc(
        'set_driver_availability',
        params: <String, dynamic>{
          'p_driver_id': driverId,
          'p_available': available,
        },
      );
    } on PostgrestException catch (e) {
      throw PulseApiError.fromPostgrest(e);
    }
  }

  /// Writes are refused in demo mode rather than faked, so a tap can never look
  /// like it saved something.
  Future<void> _guardDemo(String message) async {
    if (isDemoMode) throw PulseApiError(message);
  }
}
