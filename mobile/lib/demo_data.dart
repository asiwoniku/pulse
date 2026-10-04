enum PulseOrderStatus { requested, assigned, inTransit, delivered, delayed }

extension PulseOrderStatusLabel on PulseOrderStatus {
  String get label => switch (this) {
    PulseOrderStatus.requested => 'Requested',
    PulseOrderStatus.assigned => 'Assigned',
    PulseOrderStatus.inTransit => 'In transit',
    PulseOrderStatus.delivered => 'Delivered',
    PulseOrderStatus.delayed => 'Delayed',
  };
}

class PulseOrder {
  const PulseOrder({
    required this.reference,
    required this.customer,
    required this.pickup,
    required this.destination,
    required this.status,
    required this.amount,
    required this.placedAt,
    required this.service,
  });

  final String reference;
  final String customer;
  final String pickup;
  final String destination;
  final PulseOrderStatus status;
  final String amount;
  final String placedAt;
  final String service;
}

class ShipmentEvent {
  const ShipmentEvent({
    required this.title,
    required this.source,
    required this.verification,
    required this.when,
    this.location,
    this.note,
  });

  final String title;
  final String source;
  final String verification;
  final String when;
  final String? location;
  final String? note;
}

class PulseShipment {
  const PulseShipment({
    required this.reference,
    required this.orderReference,
    required this.status,
    required this.from,
    required this.to,
    required this.eta,
    required this.progress,
    required this.events,
  });

  final String reference;
  final String orderReference;
  final PulseOrderStatus status;
  final String from;
  final String to;
  final String eta;
  final double progress;
  final List<ShipmentEvent> events;
}

class PulseCarrier {
  const PulseCarrier({
    required this.name,
    required this.location,
    required this.coverage,
    required this.vehicle,
    required this.rating,
    required this.jobs,
    required this.color,
  });

  final String name;
  final String location;
  final String coverage;
  final String vehicle;
  final String rating;
  final String jobs;
  final int color;
}

class DriverTask {
  const DriverTask({
    required this.reference,
    required this.customer,
    required this.pickup,
    required this.destination,
    required this.window,
    required this.status,
  });

  final String reference;
  final String customer;
  final String pickup;
  final String destination;
  final String window;
  final String status;
}

const sampleOrders = [
  PulseOrder(
    reference: 'ORD-2026-00184',
    customer: 'Amara Okafor',
    pickup: 'Ikeja, Lagos',
    destination: 'Victoria Island, Lagos',
    status: PulseOrderStatus.inTransit,
    amount: 'NGN 8,500',
    placedAt: 'Today · 09:18',
    service: 'Same-day delivery',
  ),
  PulseOrder(
    reference: 'ORD-2026-00183',
    customer: 'Chidi Eze',
    pickup: 'Surulere, Lagos',
    destination: 'Lekki Phase 1, Lagos',
    status: PulseOrderStatus.assigned,
    amount: 'NGN 6,200',
    placedAt: 'Today · 08:42',
    service: 'Express delivery',
  ),
  PulseOrder(
    reference: 'ORD-2026-00182',
    customer: 'Zainab Bello',
    pickup: 'Wuse 2, Abuja',
    destination: 'Garki, Abuja',
    status: PulseOrderStatus.delivered,
    amount: 'NGN 4,800',
    placedAt: 'Yesterday · 16:05',
    service: 'Standard delivery',
  ),
  PulseOrder(
    reference: 'ORD-2026-00181',
    customer: 'Tunde Adeyemi',
    pickup: 'Yaba, Lagos',
    destination: 'Maryland, Lagos',
    status: PulseOrderStatus.requested,
    amount: 'Price pending',
    placedAt: 'Yesterday · 14:32',
    service: 'Standard delivery',
  ),
  PulseOrder(
    reference: 'ORD-2026-00180',
    customer: 'Ngozi Nwosu',
    pickup: 'Port Harcourt, Rivers',
    destination: 'Owerri, Imo',
    status: PulseOrderStatus.delayed,
    amount: 'NGN 18,000',
    placedAt: 'Yesterday · 11:26',
    service: 'Intercity delivery',
  ),
];

final sampleShipments = [
  PulseShipment(
    reference: 'PLS-NG-00042',
    orderReference: 'ORD-2026-00184',
    status: PulseOrderStatus.inTransit,
    from: 'Ikeja, Lagos',
    to: 'Victoria Island, Lagos',
    eta: 'Today, 13:30–14:00',
    progress: .64,
    events: const [
      ShipmentEvent(
        title: 'Order created',
        source: 'Pulse system',
        verification: 'Verified',
        when: 'Today · 09:18',
        location: 'Ikeja, Lagos',
      ),
      ShipmentEvent(
        title: 'Pickup confirmed',
        source: 'Driver app',
        verification: 'Pending review · sample',
        when: 'Today · 10:02',
        location: 'Ikeja, Lagos',
      ),
      ShipmentEvent(
        title: 'In transit',
        source: 'Pulse system',
        verification: 'Verified',
        when: 'Today · 10:14',
        location: 'Lagos Mainland',
      ),
    ],
  ),
  PulseShipment(
    reference: 'PLS-NG-00041',
    orderReference: 'ORD-2026-00182',
    status: PulseOrderStatus.delivered,
    from: 'Wuse 2, Abuja',
    to: 'Garki, Abuja',
    eta: 'Delivered yesterday · 17:22',
    progress: 1,
    events: const [
      ShipmentEvent(
        title: 'Order created',
        source: 'Pulse system',
        verification: 'Verified',
        when: 'Yesterday · 16:05',
        location: 'Wuse 2, Abuja',
      ),
      ShipmentEvent(
        title: 'Out for delivery',
        source: 'Pulse system',
        verification: 'Verified',
        when: 'Yesterday · 16:49',
        location: 'Abuja Municipal',
      ),
      ShipmentEvent(
        title: 'Delivered',
        source: 'Driver app',
        verification: 'Pending review · sample',
        when: 'Yesterday · 17:22',
        location: 'Garki, Abuja',
        note: 'Received by Fatima.',
      ),
    ],
  ),
  PulseShipment(
    reference: 'PLS-NG-00040',
    orderReference: 'ORD-2026-00180',
    status: PulseOrderStatus.delayed,
    from: 'Port Harcourt, Rivers',
    to: 'Owerri, Imo',
    eta: 'Updated estimate pending',
    progress: .38,
    events: const [
      ShipmentEvent(
        title: 'Order created',
        source: 'Pulse system',
        verification: 'Verified',
        when: 'Yesterday · 11:26',
        location: 'Port Harcourt, Rivers',
      ),
      ShipmentEvent(
        title: 'Route delay reported',
        source: 'Operations team',
        verification: 'Pending review · sample',
        when: 'Today · 08:40',
        location: 'Eleme, Rivers',
        note: 'Carrier is confirming a revised arrival time.',
      ),
    ],
  ),
];

const sampleCarriers = [
  PulseCarrier(
    name: 'Swift Haul Logistics',
    location: 'Lagos, Nigeria',
    coverage: 'Lagos Mainland · Island · Ogun',
    vehicle: 'Van · Truck',
    rating: '4.9',
    jobs: '248 completed',
    color: 0xFF167464,
  ),
  PulseCarrier(
    name: 'Northline Dispatch',
    location: 'Abuja, Nigeria',
    coverage: 'FCT · Kaduna · Niger',
    vehicle: 'Motorbike · Van',
    rating: '4.8',
    jobs: '176 completed',
    color: 0xFF7559A5,
  ),
  PulseCarrier(
    name: 'Coast2City Couriers',
    location: 'Port Harcourt, Nigeria',
    coverage: 'Rivers · Imo · Abia',
    vehicle: 'Tricycle · Van',
    rating: '4.7',
    jobs: '93 completed',
    color: 0xFFB4752E,
  ),
];

const sampleDriverTasks = [
  DriverTask(
    reference: 'ORD-2026-00186',
    customer: 'Kemi Adebayo',
    pickup: 'Ikeja City Mall, Lagos',
    destination: 'Onikan, Lagos Island',
    window: 'Pickup by 11:30',
    status: 'Ready to accept',
  ),
  DriverTask(
    reference: 'ORD-2026-00187',
    customer: 'Emeka Obi',
    pickup: 'Maryland, Lagos',
    destination: 'Yaba, Lagos',
    window: 'Pickup by 12:15',
    status: 'Assigned to you',
  ),
];
