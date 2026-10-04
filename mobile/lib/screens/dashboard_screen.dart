import 'package:flutter/material.dart';

import '../demo_data.dart';
import '../theme.dart';
import '../widgets.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, required this.onNavigate});

  final ValueChanged<int> onNavigate;

  @override
  Widget build(BuildContext context) {
    return ScreenBody(
      children: [
        const DemoNotice(),
        _WelcomeCard(onNavigate: onNavigate),
        const SectionTitle(
          'Today at a glance',
          subtitle: 'Example workspace · Lagos',
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final columns = constraints.maxWidth > 620 ? 4 : 2;
            final metricAspectRatio = constraints.maxWidth < 380 ? .72 : .98;
            return GridView.count(
              crossAxisCount: columns,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: metricAspectRatio,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: const [
                MetricCard(
                  label: 'Active orders',
                  value: '12',
                  icon: Icons.inventory_2_outlined,
                  detail: '+3 sample today',
                ),
                MetricCard(
                  label: 'In transit',
                  value: '08',
                  icon: Icons.local_shipping_outlined,
                  tone: Color(0xFFE5ECF8),
                ),
                MetricCard(
                  label: 'Needs attention',
                  value: '02',
                  icon: Icons.warning_amber_rounded,
                  tone: Color(0xFFFFEAE3),
                ),
                MetricCard(
                  label: 'Available drivers',
                  value: '06',
                  icon: Icons.delivery_dining_rounded,
                  tone: Color(0xFFF0EAFE),
                ),
              ],
            );
          },
        ),
        SectionTitle(
          'Recent orders',
          subtitle: 'Sample records from the demo workspace',
          trailing: TextButton(
            onPressed: () => onNavigate(1),
            child: const Text('All orders'),
          ),
        ),
        ...sampleOrders.take(3).map((order) => _RecentOrderTile(order: order)),
        SectionTitle(
          'Shipment pulse',
          subtitle: 'Latest sample tracking updates',
          trailing: TextButton(
            onPressed: () => onNavigate(2),
            child: const Text('View all'),
          ),
        ),
        ...sampleShipments
            .take(2)
            .map((shipment) => _ShipmentPeek(shipment: shipment)),
        SampleCard(
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: pulseMint,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(Icons.hub_outlined, color: pulseTeal),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Grow your delivery network',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Explore sample carriers and service areas.',
                      style: TextStyle(color: pulseMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => onNavigate(3),
                tooltip: 'Explore network',
                icon: const Icon(Icons.arrow_forward_rounded),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _WelcomeCard extends StatelessWidget {
  const _WelcomeCard({required this.onNavigate});

  final ValueChanged<int> onNavigate;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: Stack(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(21),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF153F43), Color(0xFF176B64)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final showRoute = constraints.maxWidth > 480;
                return Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: .13),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Text(
                              'PULSE PARTNER WORKSPACE',
                              style: TextStyle(
                                color: Color(0xFFD4EEE5),
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: .8,
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            'Every handoff.\nIn sync.',
                            style: Theme.of(context).textTheme.headlineMedium
                                ?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -.8,
                                  height: 1.05,
                                ),
                          ),
                          const SizedBox(height: 9),
                          const Text(
                            'A live-looking preview of your logistics day — built with sample data.',
                            style: TextStyle(
                              color: Color(0xFFD5E7E1),
                              fontSize: 12,
                              height: 1.45,
                            ),
                          ),
                          const SizedBox(height: 16),
                          FilledButton.tonalIcon(
                            onPressed: () => onNavigate(1),
                            icon: const Icon(
                              Icons.arrow_forward_rounded,
                              size: 16,
                            ),
                            label: const Text('Explore orders'),
                            style: FilledButton.styleFrom(
                              foregroundColor: pulseInk,
                              backgroundColor: const Color(0xFFE8F6F0),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 13,
                                vertical: 10,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (showRoute) ...[
                      const SizedBox(width: 12),
                      const SizedBox(
                        width: 170,
                        height: 175,
                        child: CustomPaint(painter: _RouteGraphicPainter()),
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteGraphicPainter extends CustomPainter {
  const _RouteGraphicPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final routePaint = Paint()
      ..color = const Color(0xFFB6E5D4).withValues(alpha: .85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final route = Path()
      ..moveTo(25, size.height * .76)
      ..cubicTo(
        70,
        size.height * .69,
        55,
        size.height * .42,
        108,
        size.height * .48,
      )
      ..cubicTo(
        135,
        size.height * .52,
        118,
        size.height * .25,
        157,
        size.height * .2,
      );
    canvas.drawPath(route, routePaint);

    final points = [
      Offset(25, size.height * .76),
      Offset(108, size.height * .48),
      Offset(157, size.height * .2),
    ];
    for (var index = 0; index < points.length; index++) {
      final point = points[index];
      canvas.drawCircle(
        point,
        index == 1 ? 13 : 10,
        Paint()..color = Colors.white.withValues(alpha: .12),
      );
      canvas.drawCircle(
        point,
        5,
        Paint()
          ..color = index == 1
              ? const Color(0xFFFFC875)
              : const Color(0xFFB6E5D4),
      );
    }

    final truckRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(58, size.height * .65, 72, 43),
      const Radius.circular(13),
    );
    canvas.drawRRect(
      truckRect,
      Paint()..color = Colors.white.withValues(alpha: .13),
    );
    final textPainter = TextPainter(
      text: const TextSpan(
        text: 'PULSE',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w900,
          fontSize: 10,
          letterSpacing: 1.5,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    textPainter.paint(canvas, Offset(75, size.height * .65 + 16));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RecentOrderTile extends StatelessWidget {
  const _RecentOrderTile({required this.order});

  final PulseOrder order;

  @override
  Widget build(BuildContext context) {
    return SampleCard(
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: const Color(0xFFEAF5F0),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.inventory_2_outlined,
              color: pulseTeal,
              size: 19,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.reference,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${order.pickup} → ${order.destination}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: pulseMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          StatusPill(order.status),
        ],
      ),
    );
  }
}

class _ShipmentPeek extends StatelessWidget {
  const _ShipmentPeek({required this.shipment});

  final PulseShipment shipment;

  @override
  Widget build(BuildContext context) {
    return SampleCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  shipment.reference,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              StatusPill(shipment.status),
            ],
          ),
          const SizedBox(height: 12),
          RoutePair(from: shipment.from, to: shipment.to, compact: true),
          const SizedBox(height: 9),
          Row(
            children: [
              const Icon(Icons.schedule_rounded, size: 14, color: pulseMuted),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  shipment.eta,
                  style: const TextStyle(color: pulseMuted, fontSize: 11),
                ),
              ),
              Text(
                '${(shipment.progress * 100).round()}%',
                style: const TextStyle(
                  color: pulseTeal,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: LinearProgressIndicator(
              value: shipment.progress,
              minHeight: 6,
              backgroundColor: const Color(0xFFE9EFEB),
              color: pulseTeal,
            ),
          ),
        ],
      ),
    );
  }
}
