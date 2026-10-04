import 'package:flutter/material.dart';

import '../demo_data.dart';
import '../theme.dart';
import '../widgets.dart';

class DriverScreen extends StatefulWidget {
  const DriverScreen({super.key});

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends State<DriverScreen> {
  final Map<String, int> _progressByOrder = {};
  bool _available = true;

  static const _stages = [
    'Ready to accept',
    'Accepted · sample',
    'Picked up · sample',
    'Delivered · sample',
  ];

  void _advance(DriverTask task) {
    final current = _progressByOrder[task.reference] ?? 0;
    final next = (current + 1).clamp(0, _stages.length - 1);
    setState(() => _progressByOrder[task.reference] = next);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Sample task updated locally · no driver action was sent',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ScreenBody(
      children: [
        const PageTitle(
          eyebrow: 'Driver workspace',
          title: 'My tasks',
          subtitle: 'A sample view of driver assignments and delivery work.',
        ),
        const DemoNotice(
          message:
              'Offline driver preview · accept and status actions stay local',
        ),
        SampleCard(
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: pulseMint,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.delivery_dining_rounded,
                  color: pulseTeal,
                  size: 25,
                ),
              ),
              const SizedBox(width: 11),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Driver availability',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Lagos · Example driver profile',
                      style: TextStyle(color: pulseMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                value: _available,
                onChanged: (value) => setState(() => _available = value),
              ),
            ],
          ),
        ),
        SampleCard(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(
                Icons.info_outline_rounded,
                color: Color(0xFF98600B),
                size: 19,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  _available
                      ? 'You appear available in this local preview.'
                      : 'You appear unavailable in this local preview.',
                  style: const TextStyle(
                    color: Color(0xFF765615),
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        ),
        SectionTitle(
          'Assigned tasks',
          subtitle: '${sampleDriverTasks.length} sample jobs',
        ),
        ...sampleDriverTasks.map((task) {
          final stage = _progressByOrder[task.reference] ?? 0;
          return _TaskCard(
            task: task,
            status: _stages[stage],
            step: stage,
            total: _stages.length,
            onAdvance: stage == _stages.length - 1 || !_available
                ? null
                : () => _advance(task),
          );
        }),
        const SampleCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.shield_outlined, color: pulseTeal, size: 20),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'In a connected app, the database validates the assigned driver and each legal delivery transition. This preview does not update real work.',
                  style: TextStyle(
                    color: pulseMuted,
                    fontSize: 12,
                    height: 1.45,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.status,
    required this.step,
    required this.total,
    required this.onAdvance,
  });

  final DriverTask task;
  final String status;
  final int step;
  final int total;
  final VoidCallback? onAdvance;

  @override
  Widget build(BuildContext context) {
    final actionLabel = switch (step) {
      0 => 'Accept sample task',
      1 => 'Mark sample pickup',
      2 => 'Complete sample delivery',
      _ => 'Task complete',
    };
    return SampleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  task.reference,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(
                  color: pulseMint,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status,
                  style: const TextStyle(
                    color: pulseTeal,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            '${task.customer} · ${task.window}',
            style: const TextStyle(color: pulseMuted, fontSize: 11),
          ),
          const SizedBox(height: 15),
          RoutePair(from: task.pickup, to: task.destination, compact: true),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: LinearProgressIndicator(
                    value: (step + 1) / total,
                    minHeight: 6,
                    color: pulseTeal,
                    backgroundColor: const Color(0xFFE8EFEB),
                  ),
                ),
              ),
              const SizedBox(width: 9),
              Text(
                '${step + 1}/$total',
                style: const TextStyle(color: pulseMuted, fontSize: 10),
              ),
            ],
          ),
          const SizedBox(height: 13),
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonal(
              onPressed: onAdvance,
              child: Text(
                onAdvance == null && step < total - 1
                    ? 'Unavailable in preview'
                    : actionLabel,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
