import 'package:flutter/material.dart';

import '../demo_data.dart';
import '../theme.dart';
import '../widgets.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final _searchController = TextEditingController();
  PulseOrderStatus? _statusFilter;

  List<PulseOrder> get _visibleOrders {
    final query = _searchController.text.trim().toLowerCase();
    return sampleOrders
        .where((order) {
          final matchesStatus =
              _statusFilter == null || order.status == _statusFilter;
          final matchesQuery =
              query.isEmpty ||
              order.reference.toLowerCase().contains(query) ||
              order.customer.toLowerCase().contains(query) ||
              order.pickup.toLowerCase().contains(query) ||
              order.destination.toLowerCase().contains(query);
          return matchesStatus && matchesQuery;
        })
        .toList(growable: false);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showOrder(PulseOrder order) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _OrderDetails(order: order),
    );
  }

  @override
  Widget build(BuildContext context) {
    final orders = _visibleOrders;
    return ScreenBody(
      children: [
        const PageTitle(
          eyebrow: 'Operations',
          title: 'Orders',
          subtitle: 'Review dispatch work and delivery progress.',
        ),
        const DemoNotice(
          message: 'Offline preview · sample orders only · no live updates',
        ),
        TextField(
          controller: _searchController,
          onChanged: (_) => setState(() {}),
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search reference, customer or route',
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
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              FilterChip(
                label: Text('All · ${sampleOrders.length}'),
                selected: _statusFilter == null,
                onSelected: (_) => setState(() => _statusFilter = null),
              ),
              const SizedBox(width: 7),
              ...PulseOrderStatus.values.map(
                (status) => Padding(
                  padding: const EdgeInsets.only(right: 7),
                  child: FilterChip(
                    label: Text(status.label),
                    selected: _statusFilter == status,
                    onSelected: (_) => setState(
                      () => _statusFilter = _statusFilter == status
                          ? null
                          : status,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        SectionTitle(
          'Order queue',
          subtitle:
              '${orders.length} sample ${orders.length == 1 ? 'order' : 'orders'}',
        ),
        if (orders.isEmpty)
          const EmptyHint(
            title: 'No matching orders',
            message: 'Try another search or clear the status filter.',
          )
        else
          ...orders.map(
            (order) => _OrderCard(order: order, onTap: () => _showOrder(order)),
          ),
      ],
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onTap});

  final PulseOrder order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
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
                      order.reference,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  StatusPill(order.status),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '${order.customer} · ${order.service}',
                style: const TextStyle(color: pulseMuted, fontSize: 11),
              ),
              const SizedBox(height: 14),
              RoutePair(
                from: order.pickup,
                to: order.destination,
                compact: true,
              ),
              const SizedBox(height: 12),
              const Divider(height: 1, color: Color(0xFFEEF1EF)),
              const SizedBox(height: 11),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      order.placedAt,
                      style: const TextStyle(color: pulseMuted, fontSize: 11),
                    ),
                  ),
                  Text(
                    order.amount,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: pulseMuted,
                    size: 18,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderDetails extends StatelessWidget {
  const _OrderDetails({required this.order});

  final PulseOrder order;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order.reference,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                StatusPill(order.status),
              ],
            ),
            const SizedBox(height: 16),
            const DemoNotice(
              message:
                  'Sample order · details are not connected to a live workspace',
            ),
            const SizedBox(height: 17),
            _DetailLine(
              icon: Icons.person_outline_rounded,
              label: 'Customer',
              value: order.customer,
            ),
            _DetailLine(
              icon: Icons.local_shipping_outlined,
              label: 'Service',
              value: order.service,
            ),
            _DetailLine(
              icon: Icons.radio_button_checked_rounded,
              label: 'Pickup',
              value: order.pickup,
            ),
            _DetailLine(
              icon: Icons.location_on_outlined,
              label: 'Destination',
              value: order.destination,
            ),
            _DetailLine(
              icon: Icons.payments_outlined,
              label: 'Amount',
              value: order.amount,
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.done_rounded),
                label: const Text('Close preview'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(icon, size: 18, color: pulseTeal),
          const SizedBox(width: 10),
          SizedBox(
            width: 78,
            child: Text(
              label,
              style: const TextStyle(color: pulseMuted, fontSize: 12),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
