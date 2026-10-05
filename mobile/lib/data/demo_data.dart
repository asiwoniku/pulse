/// Fictional records for reviewing the flow on a device.
///
/// This is the same contract the web client keeps: opt-in, device-only, never
/// merged with real rows, never written. Reads are wholly demo or wholly live, so
/// a demo shipment can never appear beside a real one.
library;

import 'models.dart';

String _ago(int minutes) =>
    DateTime.now().subtract(Duration(minutes: minutes)).toIso8601String();

/// An account offered on the sign-in screen in demo mode.
///
/// A partner signs in as themselves; a driver signs in with the **staff id** their
/// partner would have issued. There is no driver sign-up anywhere, demo or live —
/// an account exists because a partner created it.
class DemoAccount {
  const DemoAccount({
    required this.identifier,
    required this.password,
    required this.roleLabel,
    required this.description,
  });

  final String identifier;
  final String password;
  final String roleLabel;
  final String description;
}

const DemoAccount demoPartnerAccount = DemoAccount(
  identifier: 'owner@demo-haulage.example',
  password: 'demo-password',
  roleLabel: 'Owner · Demo Haulage Co.',
  description: 'Full workspace: dispatch, drivers, offers, reports.',
);

const DemoAccount demoDriverAccount = DemoAccount(
  identifier: 'PLS-DRV-0007',
  password: 'demo-password',
  roleLabel: 'Driver · staff id login',
  description: 'Jobs, proof of delivery, availability. No money, ever.',
);

List<Workspace> demoWorkspaces() => <Workspace>[
      const Workspace(
        id: 'demo-business',
        name: 'Demo Haulage Co.',
        kind: 'carrier',
        city: 'Lagos',
        countryCode: 'NG',
        currency: 'NGN',
        phoneE164: '+2348000000001',
      ),
    ];

List<Shipment> demoShipments() => <Shipment>[
      Shipment(
        id: 'demo-s1',
        pulseShipmentId: 'PLS-DEMO-0004',
        businessId: 'demo-business',
        currentStatus: 'assigned',
        orderId: 'demo-o4',
        createdAt: DateTime.parse(_ago(120)),
        lastEventReceivedAt: DateTime.parse(_ago(10)),
        lastVerifiedLocation: 'Lekki Phase 1',
      ),
      Shipment(
        id: 'demo-s2',
        pulseShipmentId: 'PLS-DEMO-0006',
        businessId: 'demo-business',
        currentStatus: 'in_transit',
        orderId: 'demo-o6',
        createdAt: DateTime.parse(_ago(240)),
        lastEventReceivedAt: DateTime.parse(_ago(40)),
        lastVerifiedLocation: 'Third Mainland Bridge',
      ),
      Shipment(
        id: 'demo-s3',
        pulseShipmentId: 'PLS-DEMO-0007',
        businessId: 'demo-business',
        currentStatus: 'delivered',
        orderId: 'demo-o7',
        createdAt: DateTime.parse(_ago(900)),
        lastEventReceivedAt: DateTime.parse(_ago(600)),
        lastVerifiedLocation: 'Wuse II, Abuja',
      ),
    ];

List<OrderRow> demoOrders() => <OrderRow>[
      OrderRow(
        id: 'demo-o1',
        reference: 'PLS-0001',
        status: 'requested',
        serviceType: 'delivery',
        pickupText: '12 Adeola Odeku, Victoria Island',
        destinationText: '15 Ozumba Mbadiwe Ave, Ikoyi',
        priceAmount: 45000,
        currency: 'NGN',
      ),
      OrderRow(
        id: 'demo-o4',
        reference: 'PLS-0004',
        status: 'assigned',
        // A moving job, labelled as one: same lifecycle, not a parcel.
        serviceType: 'moving',
        pickupText: '5 Lekki Phase 1',
        destinationText: '9 Admiralty Way, Lekki Phase 1',
        priceAmount: 95000,
        currency: 'NGN',
        requiresOtp: true,
      ),
      OrderRow(
        id: 'demo-o7',
        reference: 'PLS-0007',
        status: 'delivered',
        serviceType: 'freight',
        pickupText: '1 Michael Okpara Road, Abuja',
        destinationText: 'Wuse II, Abuja',
        priceAmount: 310000,
        currency: 'NGN',
      ),
    ];

List<ShipmentEvent> demoEvents() => <ShipmentEvent>[
      ShipmentEvent(
        eventId: 'demo-e1',
        eventType: 'CREATED',
        sourceType: 'system',
        verificationStatus: 'verified',
        orderStatusTo: 'requested',
        occurredAt: DateTime.parse(_ago(240)),
      ),
      ShipmentEvent(
        eventId: 'demo-e3',
        eventType: 'PICKED_UP',
        sourceType: 'provider',
        sourceReference: 'TRACK-88213',
        verificationStatus: 'provider_reported',
        location: 'Third Mainland Bridge',
        orderStatusFrom: 'at_pickup',
        orderStatusTo: 'picked_up',
        occurredAt: DateTime.parse(_ago(45)),
      ),
      ShipmentEvent(
        // Partner-submitted, so it stays pending review and is never shown as proof.
        eventId: 'demo-e4',
        eventType: 'ROAD_DIVERSION',
        sourceType: 'partner',
        verificationStatus: 'pending_review',
        location: 'Lekki Phase 1',
        occurredAt: DateTime.parse(_ago(20)),
      ),
    ];

List<DriverRow> demoDrivers() => <DriverRow>[
      const DriverRow(
        id: 'demo-d1',
        businessId: 'demo-business',
        status: 'available',
        staffId: 'PLS-DRV-0007',
        fullName: 'Amaka Obi',
        phoneE164: '+2348000000011',
        accountActive: true,
      ),
      const DriverRow(
        id: 'demo-d2',
        businessId: 'demo-business',
        status: 'busy',
        staffId: 'PLS-DRV-0012',
        fullName: 'Tunde Bakare',
        phoneE164: '+2348000000012',
        accountActive: true,
      ),
      const DriverRow(
        // Created but not yet issued credentials: a real and common state.
        id: 'demo-d3',
        businessId: 'demo-business',
        status: 'off_duty',
        fullName: 'Chidi Nwosu',
        phoneE164: '+2348000000013',
        accountActive: false,
      ),
    ];

DriverProfile demoDriverProfile() => const DriverProfile(
      id: 'demo-d1',
      businessId: 'demo-business',
      status: 'available',
      staffId: 'PLS-DRV-0007',
      fullName: 'Amaka Obi',
    );

List<Assignment> demoAssignments() => <Assignment>[
      Assignment(
        id: 'demo-a1',
        orderId: 'demo-o4',
        status: 'pending',
        scheduledStart: DateTime.parse(_ago(-30)),
        pulseShipmentId: 'PLS-DEMO-0004',
        orderReference: 'PLS-0004',
        pickupText: '5 Lekki Phase 1',
        destinationText: '9 Admiralty Way, Lekki Phase 1',
        requiresOtp: true,
        notes: 'Two sofas and a dining set. Third floor, no lift.',
      ),
      Assignment(
        id: 'demo-a2',
        orderId: 'demo-o6',
        status: 'accepted',
        scheduledStart: DateTime.parse(_ago(-45)),
        pulseShipmentId: 'PLS-DEMO-0006',
        orderReference: 'PLS-0006',
        pickupText: '22 Balogun Street',
        destinationText: '14 Adeniran Ogunsanya, Surulere',
      ),
    ];