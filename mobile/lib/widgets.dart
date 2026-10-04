import 'package:flutter/material.dart';

import 'demo_data.dart';
import 'theme.dart';

class DemoBadge extends StatelessWidget {
  const DemoBadge({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 9 : 11, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF2D8),
        borderRadius: BorderRadius.circular(30),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.wifi_off_rounded,
            size: 14,
            color: Color(0xFF98600B),
          ),
          if (!compact) ...[
            const SizedBox(width: 6),
            const Text(
              'OFFLINE SAMPLE DATA',
              style: TextStyle(
                color: Color(0xFF81540B),
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: .45,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class DemoNotice extends StatelessWidget {
  const DemoNotice({
    super.key,
    this.message = 'Demo preview · all data is sample only',
  });

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8E9),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: const Color(0xFFF5E8C8)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.info_outline_rounded,
            color: Color(0xFF9B680F),
            size: 18,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 12,
                color: Color(0xFF765615),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ScreenBody extends StatelessWidget {
  const ScreenBody({
    super.key,
    required this.children,
    this.padding = const EdgeInsets.fromLTRB(18, 10, 18, 28),
  });

  final List<Widget> children;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: padding,
      children: children
          .expand((child) => [child, const SizedBox(height: 16)])
          .toList(growable: false),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.subtitle, this.trailing});

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final subtitleWidget = subtitle == null
        ? null
        : Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Text(
              subtitle!,
              style: const TextStyle(color: pulseMuted, fontSize: 13),
            ),
          );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.5,
                ),
              ),
              ?subtitleWidget,
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});

  final PulseOrderStatus status;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (status) {
      PulseOrderStatus.requested => (
        const Color(0xFFEAF0FA),
        const Color(0xFF466294),
      ),
      PulseOrderStatus.assigned => (
        const Color(0xFFF0EAFE),
        const Color(0xFF7455A8),
      ),
      PulseOrderStatus.inTransit => (
        const Color(0xFFE0F3EC),
        const Color(0xFF24745D),
      ),
      PulseOrderStatus.delivered => (
        const Color(0xFFE7F4E4),
        const Color(0xFF4A7842),
      ),
      PulseOrderStatus.delayed => (
        const Color(0xFFFFE9E2),
        const Color(0xFFB1563B),
      ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          color: foreground,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class RoutePair extends StatelessWidget {
  const RoutePair({
    super.key,
    required this.from,
    required this.to,
    this.compact = false,
  });

  final String from;
  final String to;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Column(
            children: [
              const Icon(
                Icons.radio_button_checked_rounded,
                size: 13,
                color: pulseTeal,
              ),
              Container(
                width: 1,
                height: compact ? 17 : 21,
                margin: const EdgeInsets.symmetric(vertical: 2),
                color: const Color(0xFFD7E3DD),
              ),
              const Icon(
                Icons.location_on_rounded,
                size: 14,
                color: Color(0xFFE07C56),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(from, maxLines: 1, overflow: TextOverflow.ellipsis),
              SizedBox(height: compact ? 8 : 11),
              Text(to, maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ],
    );
  }
}

class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.tone = pulseMint,
    this.detail,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tone;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: tone,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, color: pulseTeal, size: 19),
            ),
            const SizedBox(height: 14),
            Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(color: pulseMuted, fontSize: 12),
            ),
            if (detail != null) ...[
              const SizedBox(height: 6),
              Text(
                detail!,
                style: const TextStyle(
                  color: pulseTeal,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class SampleCard extends StatelessWidget {
  const SampleCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(15),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(padding: padding, child: child),
    );
  }
}

class DemoActionButton extends StatelessWidget {
  const DemoActionButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 17),
      label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
      style: OutlinedButton.styleFrom(
        foregroundColor: pulseInk,
        side: const BorderSide(color: Color(0xFFDCE7E1)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      ),
    );
  }
}

class EmptyHint extends StatelessWidget {
  const EmptyHint({super.key, required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return SampleCard(
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded, color: pulseMuted, size: 30),
          const SizedBox(height: 8),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 3),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: pulseMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class PageTitle extends StatelessWidget {
  const PageTitle({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.subtitle,
  });

  final String eyebrow;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow.toUpperCase(),
          style: const TextStyle(
            color: pulseTeal,
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -.7,
          ),
        ),
        const SizedBox(height: 3),
        Text(subtitle, style: const TextStyle(color: pulseMuted, fontSize: 13)),
      ],
    );
  }
}

class CountDot extends StatelessWidget {
  const CountDot(this.count, {super.key});

  final String count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: const BoxDecoration(color: pulseMint, shape: BoxShape.circle),
      child: Text(
        count,
        style: const TextStyle(
          color: pulseTeal,
          fontWeight: FontWeight.w800,
          fontSize: 11,
        ),
      ),
    );
  }
}

class ScreenMaxWidth extends StatelessWidget {
  const ScreenMaxWidth({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1050),
        child: child,
      ),
    );
  }
}
