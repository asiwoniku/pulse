/// Row shapes read from Postgres.
///
/// Typed rather than `Map<String, dynamic>` so a renamed or missing column becomes
/// a compile error here instead of `null` leaking into a rendered row. Every
/// factory tolerates null for anything optional: "the database has not recorded
/// this" is a real state that must survive to the screen.
library;

class Workspace {
  const Workspace({
    required this.id,
    required this.name,
    required this.kind,
    this.city,
    this.countryCode,
    this.currency,
    this.phoneE164,
    this.logoUrl,
    this.isActive = true,
  });

  final String id;
  final String name;

  /// `carrier` fulfils deliveries; `vendor` originates jobs and hands them to
  /// carriers (migration 0017).
  final String kind;
  final String? city;
  final String? countryCode;
  final String? currency;
  final String? phoneE164;

  /// The partner's own mark, shown beside Pulse's. Null until one is uploaded;
  /// the UI falls back to Pulse's rather than showing a broken image.
  final String? logoUrl;
  final bool isActive;

  bool get isVendor => kind == 'vendor';

  factory Workspace.fromJson(Map<String, dynamic> j) => Workspace(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? 'Unnamed workspace',
        kind: (j['kind'] as String?) ?? 'carrier',
        city: j['city'] as String?,
        countryCode: j['country_code'] as String?,
        currency: j['currency'] as String?,
        phoneE164: j['phone_e164'] as String?,
        logoUrl: j['logo_url'] as String?,
        isActive: (j['is_active'] as bool?) ?? true,
      );
}

class Shipment {
  const Shipment({
    required this.id,
    required this.pulseShipmentId,
    required this.businessId,
    required this.currentStatus,
    required this.orderId,
    this.createdAt,
    this.lastEventReceivedAt,
    this.lastVerifiedLocation,
  });

  final String id;

  /// Provider-neutral public identity (migration 0022).
  final String pulseShipmentId;
  final String businessId;
  final String currentStatus;
  final String orderId;
  final DateTime? createdAt;
  final DateTime? lastEventReceivedAt;
  final String? lastVerifiedLocation;

  factory Shipment.fromJson(Map<String, dynamic> j) => Shipment(
        id: j['id'] as String,
        pulseShipmentId: (j['pulse_shipment_id'] as String?) ?? '',
        businessId: (j['business_id'] as String?) ?? '',
        currentStatus: (j['current_status'] as String?) ?? 'unknown',
        orderId: (j['order_id'] as String?) ?? '',
        createdAt: DateTime.tryParse((j['created_at'] as String?) ?? ''),
        lastEventReceivedAt:
            DateTime.tryParse((j['last_event_received_at'] as String?) ?? ''),
        lastVerifiedLocation: j['last_verified_location'] as String?,
      );
}

class ShipmentEvent {
  const ShipmentEvent({
    required this.eventId,
    required this.eventType,
    required this.sourceType,
    required this.verificationStatus,
    this.sourceReference,
    this.location,
    this.orderStatusFrom,
    this.orderStatusTo,
    this.occurredAt,
  });

  final String eventId;
  final String eventType;
  final String sourceType;

  /// `verified`, `provider_reported`, `pending_review` or `unverified`. A
  /// partner-submitted event is never presented as proof.
  final String verificationStatus;
  final String? sourceReference;
  final String? location;
  final String? orderStatusFrom;
  final String? orderStatusTo;
  final DateTime? occurredAt;

  bool get isVerified => verificationStatus == 'verified';

  bool get isPendingReview => verificationStatus == 'pending_review';

  factory ShipmentEvent.fromJson(Map<String, dynamic> j) => ShipmentEvent(
        eventId: (j['event_id'] as String?) ?? '',
        eventType: (j['event_type'] as String?) ?? '',
        sourceType: (j['source_type'] as String?) ?? '',
        verificationStatus:
            (j['verification_status'] as String?) ?? 'unverified',
        sourceReference: j['source_reference'] as String?,
        location: j['location'] as String?,
        orderStatusFrom: j['order_status_from'] as String?,
        orderStatusTo: j['order_status_to'] as String?,
        occurredAt: DateTime.tryParse((j['occurred_at'] as String?) ?? ''),
      );
}

class OrderRow {
  const OrderRow({
    required this.id,
    required this.reference,
    required this.status,
    this.serviceType,
    this.pickupText,
    this.destinationText,
    this.priceAmount,
    this.currency,
    this.paymentStatus,
    this.promisedAt,
    this.requiresOtp,
  });

  final String id;
  final String reference;
  final String status;

  /// `delivery`, `moving`, `errand` or `freight` — the four values migration 0018
  /// permits, so this is a constrained value rather than free text.
  final String? serviceType;
  final String? pickupText;
  final String? destinationText;

  /// Null means "not stated". Zero would read as free, which is a different claim.
  final double? priceAmount;
  final String? currency;
  final String? paymentStatus;
  final DateTime? promisedAt;

  /// When true the business asked for a one-time code at the door, so proof of
  /// delivery is incomplete without it.
  final bool? requiresOtp;

  bool get isMoving => serviceType == 'moving';

  factory OrderRow.fromJson(Map<String, dynamic> j) {
    final raw = j['price_amount'];
    return OrderRow(
      id: j['id'] as String,
      reference: (j['reference'] as String?) ?? '',
      status: (j['status'] as String?) ?? 'unknown',
      serviceType: j['service_type'] as String?,
      pickupText: j['pickup_text'] as String?,
      destinationText: j['destination_text'] as String?,
      priceAmount: raw == null ? null : double.tryParse(raw.toString()),
      currency: j['currency'] as String?,
      paymentStatus: j['payment_status'] as String?,
      promisedAt: DateTime.tryParse((j['promised_at'] as String?) ?? ''),
      requiresOtp: j['requires_otp'] as bool?,
    );
  }
}

/// A driver record. `staffId` is the human-facing login handle a partner issues
/// from their own console; the account behind it is created for them, never by
/// the driver.
class DriverRow {
  const DriverRow({
    required this.id,
    required this.businessId,
    required this.status,
    this.staffId,
    this.fullName,
    this.phoneE164,
    this.accountActive,
  });

  final String id;
  final String businessId;
  final String status;
  final String? staffId;
  final String? fullName;
  final String? phoneE164;

  /// Whether the partner has issued credentials. A driver row can exist before
  /// anyone can log in with it.
  final bool? accountActive;

  bool get isAvailable => status == 'available';

  factory DriverRow.fromJson(Map<String, dynamic> j) => DriverRow(
        id: j['id'] as String,
        businessId: (j['business_id'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'unknown',
        staffId: j['staff_id'] as String?,
        fullName: j['full_name'] as String?,
        phoneE164: j['phone_e164'] as String?,
        accountActive: j['account_active'] as bool?,
      );
}

/// The signed-in user's own driver row.
///
/// Resolved by the database from `auth.uid()`, never by scanning the workspace, so
/// a driver cannot end up acting inside the wrong company.
class DriverProfile {
  const DriverProfile({
    required this.id,
    required this.businessId,
    required this.status,
    this.staffId,
    this.fullName,
  });

  final String id;
  final String businessId;
  final String status;
  final String? staffId;
  final String? fullName;

  bool get isAvailable => status == 'available';

  factory DriverProfile.fromJson(Map<String, dynamic> j) => DriverProfile(
        id: j['id'] as String,
        businessId: (j['business_id'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'unknown',
        staffId: j['staff_id'] as String?,
        fullName: j['full_name'] as String?,
      );
}

/// A job offered to one driver.
///
/// Drivers act on orders *only* through assignments, so this — never a raw order
/// row — is what the driver build is allowed to show.
class Assignment {
  const Assignment({
    required this.id,
    required this.orderId,
    required this.status,
    this.scheduledStart,
    this.notes,
    this.pulseShipmentId,
    this.orderReference,
    this.pickupText,
    this.destinationText,
    this.requiresOtp,
  });

  final String id;
  final String orderId;
  final String status;
  final DateTime? scheduledStart;
  final String? notes;

  /// Joined from the order for only what the driver needs to find the door.
  final String? pulseShipmentId;
  final String? orderReference;
  final String? pickupText;
  final String? destinationText;
  final bool? requiresOtp;

  bool get isPending => status == 'pending';

  bool get isAccepted => status == 'accepted';

  bool get isDeclined => status == 'declined';

  factory Assignment.fromJson(Map<String, dynamic> j) {
    final raw = j['order'];
    final o =
        raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    return Assignment(
      id: j['id'] as String,
      orderId: (j['order_id'] as String?) ?? '',
      status: (j['status'] as String?) ?? 'unknown',
      scheduledStart:
          DateTime.tryParse((j['scheduled_start'] as String?) ?? ''),
      notes: j['notes'] as String?,
      pulseShipmentId: j['pulse_shipment_id'] as String?,
      orderReference: o['reference'] as String?,
      pickupText: o['pickup_text'] as String?,
      destinationText: o['destination_text'] as String?,
      requiresOtp: o['requires_otp'] as bool?,
    );
  }
}