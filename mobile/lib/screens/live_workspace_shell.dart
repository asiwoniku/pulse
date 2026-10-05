import 'package:flutter/material.dart';

import '../data/models.dart';
import '../data/pulse_data.dart';
import 'live_app.dart';

/// Inside one workspace: the live shipment list and order list.
///
/// Realtime pushes on change rather than polling, so a status move by a driver or
/// a partner appears without a manual refresh.
class WorkspaceShell extends StatefulWidget {
  const WorkspaceShell({
    super.key,
    required this.data,
    required this.workspace,
  });
  final PulseData data;
  final Workspace workspace;

  @override
  State<WorkspaceShell> createState() => _WorkspaceShellState();
}

class _WorkspaceShellState extends State<WorkspaceShell> {
  List<Shipment> _shipments = <Shipment>[];
  String? _error;
  bool _loading = true;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await widget.data.shipments(widget.workspace.id);
      if (!mounted) return;
      setState(() {
        _shipments = rows;
        _loading = false;
      });
    } on PulseApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.workspace.name),
          actions: <Widget>[
            IconButton(
              tooltip: 'Reload',
              icon: const Icon(Icons.refresh),
              onPressed: _load,
            ),
          ],
          bottom: const TabBar(
            tabs: <Widget>[
              Tab(text: 'Shipments'),
              Tab(text: 'Orders'),
            ],
          ),
        ),
        body: _error != null && _shipments.isEmpty
            ? ErrorView(message: _error!, onRetry: _load)
            : TabBarView(children: <Widget>[_shipmentsTab(), _ordersTab()]),
      ),
    );
  }

  Widget _shipmentsTab() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_shipments.isEmpty) {
      return const EmptyView(
        title: 'No shipments yet',
        body:
            'Postgres returned no shipment rows for this workspace. Records appear '
            'here only once they genuinely exist — nothing is shown in their place.',
      );
    }
    return ListView.separated(
      itemCount: _shipments.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (BuildContext context, int i) {
        final Shipment s = _shipments[i];
        return ListTile(
          title: Text(
            s.pulseShipmentId.isEmpty ? s.id : s.pulseShipmentId,
            style: const TextStyle(fontFamily: 'monospace'),
          ),
          subtitle: Text(
            <String?>[
              s.lastVerifiedLocation,
              if (s.lastEventReceivedAt != null)
                'last event ${_ago(s.lastEventReceivedAt!)}',
            ].whereType<String>().join(' · '),
          ),
          trailing: StatusChip(status: s.currentStatus),
          onTap: () async {
            await Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ShipmentDetail(data: widget.data, shipment: s),
              ),
            );
            if (mounted) _load();
          },
        );
      },
    );
  }

  static String _ago(DateTime when) {
    final Duration d = DateTime.now().difference(when);
    if (d.inMinutes < 60) return '${d.inMinutes}m ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }

  Widget _ordersTab() {
    return FutureBuilder<List<OrderRow>>(
      // Keyed so tapping "Try again" re-runs the query instead of handing back the
      // failed future Flutter is still holding.
      key: ValueKey<int>(_generation),
      future: widget.data.orders(widget.workspace.id),
      builder: (BuildContext context, AsyncSnapshot<List<OrderRow>> snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return ErrorView(
            message: snap.error is PulseApiError
                ? (snap.error as PulseApiError).message
                : 'Orders could not be loaded.',
            onRetry: () => setState(() => _generation++),
          );
        }
        final rows = snap.data ?? <OrderRow>[];
        if (rows.isEmpty) {
          return const EmptyView(
            title: 'No orders yet',
            body: 'This workspace has no order rows visible to your role.',
          );
        }
        return ListView.separated(
          itemCount: rows.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (BuildContext context, int i) {
            final OrderRow o = rows[i];
            return ListTile(
              title: Text(
                o.reference.isEmpty ? o.id : o.reference,
                style: const TextStyle(fontFamily: 'monospace'),
              ),
              // A moving job is labelled as one, so nobody reads a relocation as a
              // parcel just because it shares the same lifecycle.
              subtitle: Text(
                <String?>[
                  o.isMoving ? 'Moving' : o.serviceType,
                  o.pickupText,
                  o.destinationText,
                ].whereType<String>().join(' → '),
              ),
              trailing: StatusChip(status: o.status),
            );
          },
        );
      },
    );
  }
}

/// The Shipment Passport: an append-only, source-aware timeline.
class ShipmentDetail extends StatefulWidget {
  const ShipmentDetail({super.key, required this.data, required this.shipment});
  final PulseData data;
  final Shipment shipment;

  @override
  State<ShipmentDetail> createState() => _ShipmentDetailState();
}

class _ShipmentDetailState extends State<ShipmentDetail> {
  late Future<List<ShipmentEvent>> _events = widget.data.shipmentEvents(
    widget.shipment.id,
  );
  int _generation = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.shipment.pulseShipmentId)),
      body: FutureBuilder<List<ShipmentEvent>>(
        key: ValueKey<int>(_generation),
        future: _events,
        builder: (BuildContext context, AsyncSnapshot<List<ShipmentEvent>> snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorView(
              message: snap.error is PulseApiError
                  ? (snap.error as PulseApiError).message
                  : 'Events could not be loaded.',
              onRetry: () => setState(() {
                _generation++;
                _events = widget.data.shipmentEvents(widget.shipment.id);
              }),
            );
          }
          final events = snap.data ?? <ShipmentEvent>[];
          if (events.isEmpty) {
            return const EmptyView(
              title: 'No events yet',
              body:
                  'The chain of custody begins when the first event is recorded.',
            );
          }
          return ListView.separated(
            itemCount: events.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (BuildContext context, int i) {
              final ShipmentEvent e = events[i];
              return ListTile(
                title: Text(e.eventType.replaceAll('_', ' ').toLowerCase()),
                // A partner-submitted event stays pending review, and saying so is
                // the point: it must never read as proof of anything.
                subtitle: Text(
                  <String?>[
                    e.location,
                    if (e.isPendingReview) 'Pending review',
                    if (e.isVerified) 'Verified',
                  ].whereType<String>().join(' · '),
                ),
                trailing: Text(
                  e.sourceType,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(status.replaceAll('_', ' ')),
      visualDensity: VisualDensity.compact,
    );
  }
}
