import 'package:flutter/material.dart';

import '../demo_data.dart';
import '../theme.dart';
import '../widgets.dart';

class ShipmentsScreen extends StatefulWidget {
  const ShipmentsScreen({super.key});

  @override
  State<ShipmentsScreen> createState() => _ShipmentsScreenState();
}

class _ShipmentsScreenState extends State<ShipmentsScreen> {
  final _searchController = TextEditingController();
  final Map<String, List<ShipmentEvent>> _localEvents = {};

  List<PulseShipment> get _visibleShipments {
    final query = _searchController.text.trim().toLowerCase();
    return sampleShipments
        .where((shipment) {
          return query.isEmpty ||
              shipment.reference.toLowerCase().contains(query) ||
              shipment.orderReference.toLowerCase().contains(query) ||
              shipment.from.toLowerCase().contains(query) ||
              shipment.to.toLowerCase().contains(query);
        })
        .toList(growable: false);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _openShipment(PulseShipment shipment) {
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => ShipmentDetailScreen(
          shipment: shipment,
          events: _localEvents[shipment.reference] ?? shipment.events,
          onEventsChanged: (events) {
            setState(() => _localEvents[shipment.reference] = events);
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shipments = _visibleShipments;
    return ScreenBody(
      children: [
        const PageTitle(
          eyebrow: 'End-to-end visibility',
          title: 'Shipments',
          subtitle: 'Follow each journey and its source-aware event trail.',
        ),
        const DemoNotice(
          message:
              'Sample shipment passports · timeline events are illustrative',
        ),
        TextField(
          controller: _searchController,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'Search shipment, order or route',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _searchController.text.isEmpty
                ? null
                : IconButton(
                    onPressed: () {
                      _searchController.clear();
                      setState(() {});
                    },
                    tooltip: 'Clear search',
                    icon: const Icon(Icons.close_rounded),
                  ),
          ),
        ),
        SectionTitle(
          'Shipment passports',
          subtitle: '${shipments.length} sample records',
        ),
        if (shipments.isEmpty)
          const EmptyHint(
            title: 'No matching shipments',
            message: 'Try a shipment reference, order number or city.',
          )
        else
          ...shipments.map(
            (shipment) => _ShipmentCard(
              shipment: shipment,
              events: _localEvents[shipment.reference] ?? shipment.events,
              onTap: () => _openShipment(shipment),
            ),
          ),
      ],
    );
  }
}

class _ShipmentCard extends StatelessWidget {
  const _ShipmentCard({
    required this.shipment,
    required this.events,
    required this.onTap,
  });

  final PulseShipment shipment;
  final List<ShipmentEvent> events;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final latestEvent = events.isEmpty ? null : events.last;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      shipment.reference,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  StatusPill(shipment.status),
                ],
              ),
              const SizedBox(height: 3),
              Text(
                'Order ${shipment.orderReference}',
                style: const TextStyle(color: pulseMuted, fontSize: 11),
              ),
              const SizedBox(height: 15),
              RoutePair(from: shipment.from, to: shipment.to, compact: true),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: LinearProgressIndicator(
                  value: shipment.progress,
                  minHeight: 6,
                  color: pulseTeal,
                  backgroundColor: const Color(0xFFE8EFEB),
                ),
              ),
              const SizedBox(height: 11),
              Row(
                children: [
                  const Icon(
                    Icons.schedule_rounded,
                    size: 14,
                    color: pulseMuted,
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      shipment.eta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: pulseMuted, fontSize: 11),
                    ),
                  ),
                  Text(
                    '${events.length} updates',
                    style: const TextStyle(
                      color: pulseTeal,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (latestEvent != null) ...[
                const SizedBox(height: 11),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: pulseCanvas,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.bolt_rounded,
                        color: pulseTeal,
                        size: 17,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Latest · ${latestEvent.title}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right_rounded,
                        size: 18,
                        color: pulseMuted,
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ShipmentDetailScreen extends StatefulWidget {
  const ShipmentDetailScreen({
    super.key,
    required this.shipment,
    required this.events,
    required this.onEventsChanged,
  });

  final PulseShipment shipment;
  final List<ShipmentEvent> events;
  final ValueChanged<List<ShipmentEvent>> onEventsChanged;

  @override
  State<ShipmentDetailScreen> createState() => _ShipmentDetailScreenState();
}

class _ShipmentDetailScreenState extends State<ShipmentDetailScreen> {
  late List<ShipmentEvent> _events;

  @override
  void initState() {
    super.initState();
    _events = List.of(widget.events);
  }

  Future<void> _showAddEvent() async {
    final newEvent = await showModalBottomSheet<ShipmentEvent>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => const _SampleEventForm(),
    );
    if (newEvent == null || !mounted) return;
    setState(() => _events = [..._events, newEvent]);
    widget.onEventsChanged(_events);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Sample event added locally · nothing was sent'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shipment = widget.shipment;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          tooltip: 'Back to shipments',
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        title: Text(shipment.reference),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 14),
            child: DemoBadge(compact: true),
          ),
        ],
      ),
      body: ScreenBody(
        children: [
          const DemoNotice(
            message:
                'Offline sample passport · updates are not verified or sent to a server',
          ),
          SampleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Shipment journey',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    StatusPill(shipment.status),
                  ],
                ),
                const SizedBox(height: 16),
                RoutePair(from: shipment.from, to: shipment.to),
                const SizedBox(height: 14),
                ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: LinearProgressIndicator(
                    value: shipment.progress,
                    minHeight: 7,
                    color: pulseTeal,
                    backgroundColor: const Color(0xFFE8EFEB),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Estimated arrival · ${shipment.eta}',
                  style: const TextStyle(color: pulseMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          SectionTitle(
            'Event timeline',
            subtitle: '${_events.length} sample updates',
            trailing: DemoActionButton(
              label: 'Add update',
              icon: Icons.add_rounded,
              onPressed: _showAddEvent,
            ),
          ),
          if (_events.isEmpty)
            const EmptyHint(
              title: 'No events yet',
              message: 'Updates will appear here when recorded.',
            )
          else
            _Timeline(events: _events),
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.events});

  final List<ShipmentEvent> events;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var index = 0; index < events.length; index++)
          _TimelineEvent(
            event: events[index],
            isLast: index == events.length - 1,
          ),
      ],
    );
  }
}

class _TimelineEvent extends StatelessWidget {
  const _TimelineEvent({required this.event, required this.isLast});

  final ShipmentEvent event;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final verified = event.verification.startsWith('Verified');
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 27,
            child: Column(
              children: [
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: verified ? pulseTeal : const Color(0xFFF0AD54),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x1A12363C),
                        blurRadius: 0,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      color: const Color(0xFFDDE8E2),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: SampleCard(
                padding: const EdgeInsets.all(13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            event.title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        Icon(
                          verified
                              ? Icons.verified_rounded
                              : Icons.hourglass_top_rounded,
                          size: 16,
                          color: verified ? pulseTeal : const Color(0xFFC28326),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      event.verification,
                      style: TextStyle(
                        color: verified ? pulseTeal : const Color(0xFF98600B),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '${event.when} · ${event.source}',
                      style: const TextStyle(color: pulseMuted, fontSize: 11),
                    ),
                    if (event.location != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        event.location!,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if (event.note != null) ...[
                      const SizedBox(height: 7),
                      Text(
                        event.note!,
                        style: const TextStyle(color: pulseMuted, fontSize: 12),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SampleEventForm extends StatefulWidget {
  const _SampleEventForm();

  @override
  State<_SampleEventForm> createState() => _SampleEventFormState();
}

class _SampleEventFormState extends State<_SampleEventForm> {
  static const _eventTypes = [
    'Pickup confirmed',
    'In transit',
    'Arrived at checkpoint',
    'Delivery attempted',
    'Delivered',
    'Delay reported',
  ];

  String _eventType = _eventTypes.first;
  final _location = TextEditingController();
  final _note = TextEditingController();

  @override
  void dispose() {
    _location.dispose();
    _note.dispose();
    super.dispose();
  }

  void _add() {
    Navigator.of(context).pop(
      ShipmentEvent(
        title: _eventType,
        source: 'Local preview',
        verification: 'Pending review · sample',
        when: 'Just now · local preview',
        location: _location.text.trim().isEmpty ? null : _location.text.trim(),
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          4,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 22,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Add a sample update',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 5),
            const DemoNotice(
              message: 'This stays on this screen and is never uploaded',
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _eventType,
              decoration: const InputDecoration(labelText: 'Event'),
              items: _eventTypes
                  .map(
                    (value) =>
                        DropdownMenuItem(value: value, child: Text(value)),
                  )
                  .toList(),
              onChanged: (value) {
                if (value != null) setState(() => _eventType = value);
              },
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _location,
              decoration: const InputDecoration(
                labelText: 'Location (optional)',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _note,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Note (optional)'),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _add,
                icon: const Icon(Icons.add_rounded),
                label: const Text('Add local sample event'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
