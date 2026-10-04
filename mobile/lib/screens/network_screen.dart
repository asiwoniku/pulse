import 'package:flutter/material.dart';

import '../demo_data.dart';
import '../theme.dart';
import '../widgets.dart';

class NetworkScreen extends StatefulWidget {
  const NetworkScreen({super.key});

  @override
  State<NetworkScreen> createState() => _NetworkScreenState();
}

class _NetworkScreenState extends State<NetworkScreen> {
  final _searchController = TextEditingController();

  List<PulseCarrier> get _carriers {
    final query = _searchController.text.trim().toLowerCase();
    return sampleCarriers
        .where((carrier) {
          return query.isEmpty ||
              carrier.name.toLowerCase().contains(query) ||
              carrier.location.toLowerCase().contains(query) ||
              carrier.coverage.toLowerCase().contains(query) ||
              carrier.vehicle.toLowerCase().contains(query);
        })
        .toList(growable: false);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _requestCarrier(PulseCarrier carrier) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.hub_outlined, color: pulseTeal),
        title: const Text('Preview carrier request?'),
        content: Text(
          'This would start a conversation with ${carrier.name}. In this offline '
          'demo, no request is sent and no carrier is contacted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () {
              Navigator.of(context).pop();
              ScaffoldMessenger.of(this.context).showSnackBar(
                const SnackBar(
                  content: Text('Preview only · no carrier request was sent'),
                ),
              );
            },
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final carriers = _carriers;
    return ScreenBody(
      children: [
        const PageTitle(
          eyebrow: 'Partner network',
          title: 'Find a carrier',
          subtitle:
              'Discover sample logistics partners by location and service.',
        ),
        const DemoNotice(
          message:
              'Illustrative directory · these are not verified or reachable partners',
        ),
        TextField(
          controller: _searchController,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'Search name, city or vehicle',
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
        SampleCard(
          child: Row(
            children: [
              const Icon(
                Icons.verified_user_outlined,
                color: pulseTeal,
                size: 21,
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'In a live directory, partner access and business details are controlled by account verification.',
                  style: TextStyle(color: pulseInk, fontSize: 12, height: 1.4),
                ),
              ),
            ],
          ),
        ),
        SectionTitle(
          'Sample carriers',
          subtitle: '${carriers.length} example listings',
        ),
        if (carriers.isEmpty)
          const EmptyHint(
            title: 'No matching carriers',
            message: 'Try another location, vehicle type or search.',
          )
        else
          ...carriers.map(
            (carrier) => _CarrierCard(
              carrier: carrier,
              onRequest: () => _requestCarrier(carrier),
            ),
          ),
      ],
    );
  }
}

class _CarrierCard extends StatelessWidget {
  const _CarrierCard({required this.carrier, required this.onRequest});

  final PulseCarrier carrier;
  final VoidCallback onRequest;

  @override
  Widget build(BuildContext context) {
    final color = Color(carrier.color);
    return SampleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: color.withValues(alpha: .12),
                child: Icon(
                  Icons.local_shipping_rounded,
                  color: color,
                  size: 22,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      carrier.name,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      carrier.location,
                      style: const TextStyle(color: pulseMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF5DF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.star_rounded,
                      color: Color(0xFFB9781A),
                      size: 14,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      carrier.rating,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 15),
          _CarrierFact(icon: Icons.map_outlined, value: carrier.coverage),
          const SizedBox(height: 8),
          _CarrierFact(icon: Icons.directions_outlined, value: carrier.vehicle),
          const SizedBox(height: 8),
          _CarrierFact(icon: Icons.task_alt_rounded, value: carrier.jobs),
          const SizedBox(height: 15),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onRequest,
              icon: const Icon(Icons.chat_bubble_outline_rounded, size: 17),
              label: const Text('Preview a partner request'),
              style: OutlinedButton.styleFrom(
                foregroundColor: pulseTeal,
                side: const BorderSide(color: Color(0xFFDCE7E1)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CarrierFact extends StatelessWidget {
  const _CarrierFact({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: pulseMuted),
        const SizedBox(width: 8),
        Expanded(child: Text(value, style: const TextStyle(fontSize: 12))),
      ],
    );
  }
}
