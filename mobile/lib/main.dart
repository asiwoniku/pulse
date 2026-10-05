import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'screens/dashboard_screen.dart';
import 'screens/driver_screen.dart';
import 'screens/network_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/shipments_screen.dart';
import 'screens/configuration_screen.dart';
import 'screens/live_app.dart';
import 'theme.dart';
import 'widgets.dart';
import 'data/pulse_data.dart';

void main() {
  runApp(kReleaseMode ? const PulseBuildGate() : const PulseApp());
}

/// Decides, once, which app to show.
///
/// Three outcomes, and the order matters:
///  1. Release build -> the existing gate (unchanged).
///  2. Configured    -> `LivePulseApp`, which talks to Postgres.
///  3. Not configured -> the configuration screen, which names the missing flags.
///
/// The point of (3) is that the app never falls back to sample rows while claiming
/// to be live. `PulseApp` below is the existing offline preview and stays reachable
/// through an explicit button on the configuration screen, clearly labelled — so the
/// demo can be reviewed on a device, but never by accident.
class PulseBootstrap extends StatefulWidget {
  const PulseBootstrap({super.key});

  @override
  State<PulseBootstrap> createState() => _PulseBootstrapState();
}

class _PulseBootstrapState extends State<PulseBootstrap> {
  late Future<PulseData?> _future = PulseData.bootstrap();

  void _retry() => setState(() => _future = PulseData.bootstrap());

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PulseData?>(
      future: _future,
      builder: (BuildContext context, AsyncSnapshot<PulseData?> snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const MaterialApp(
            debugShowCheckedModeBanner: false,
            home: Scaffold(body: Center(child: CircularProgressIndicator())),
          );
        }
        if (snapshot.hasError) {
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            home: Scaffold(
              body: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'Pulse could not start:\n${snapshot.error}',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          );
        }

        final data = snapshot.data;
        if (data == null) {
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            home: ConfigurationScreen(onRetry: _retry),
          );
        }
        return PulseWorkspaceApp(data: data);
      },
    );
  }
}

class PulseApp extends StatelessWidget {
  const PulseApp({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: pulseTeal,
      brightness: Brightness.light,
      primary: pulseTeal,
      surface: Colors.white,
    );
    return MaterialApp(
      title: 'Pulse Logistics',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: colorScheme,
        scaffoldBackgroundColor: pulseCanvas,
        appBarTheme: const AppBarTheme(
          backgroundColor: pulseCanvas,
          foregroundColor: pulseInk,
          elevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(
            color: pulseInk,
            fontSize: 19,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
          ),
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: Color(0xFFE6ECE8)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 13,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: const BorderSide(color: Color(0xFFE2EAE5)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: const BorderSide(color: Color(0xFFE2EAE5)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: const BorderSide(color: pulseTeal, width: 1.5),
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: Colors.white,
          indicatorColor: pulseMint,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            return TextStyle(
              fontSize: 11,
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w500,
            );
          }),
        ),
        textTheme: ThemeData.light().textTheme.apply(
          bodyColor: pulseInk,
          displayColor: pulseInk,
        ),
      ),
      home: const PulseShell(),
    );
  }
}

class PulseShell extends StatefulWidget {
  const PulseShell({super.key});

  @override
  State<PulseShell> createState() => _PulseShellState();
}

class PulseBuildGate extends StatelessWidget {
  const PulseBuildGate({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pulse Logistics',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: pulseTeal),
      ),
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.lock_outline_rounded,
                    size: 38,
                    color: pulseTeal,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Pulse is not configured for live use',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 9),
                  const Text(
                    'This release build has no connected authentication or data service. '
                    'Offline sample workflows are available only in a debug build.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PulseShellState extends State<PulseShell> {
  int _selectedIndex = 0;

  static const _destinations = [
    NavigationDestination(
      icon: Icon(Icons.space_dashboard_outlined),
      selectedIcon: Icon(Icons.space_dashboard_rounded),
      label: 'Home',
    ),
    NavigationDestination(
      icon: Icon(Icons.receipt_long_outlined),
      selectedIcon: Icon(Icons.receipt_long_rounded),
      label: 'Orders',
    ),
    NavigationDestination(
      icon: Icon(Icons.route_outlined),
      selectedIcon: Icon(Icons.route_rounded),
      label: 'Shipments',
    ),
    NavigationDestination(
      icon: Icon(Icons.hub_outlined),
      selectedIcon: Icon(Icons.hub_rounded),
      label: 'Network',
    ),
    NavigationDestination(
      icon: Icon(Icons.delivery_dining_outlined),
      selectedIcon: Icon(Icons.delivery_dining_rounded),
      label: 'Driver',
    ),
  ];

  late final List<Widget> _pages = [
    DashboardScreen(onNavigate: _selectPage),
    const OrdersScreen(),
    const ShipmentsScreen(),
    const NetworkScreen(),
    const DriverScreen(),
  ];

  void _selectPage(int index) {
    setState(() => _selectedIndex = index);
  }

  void _showPreviewInfo() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => const SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(22, 8, 22, 28),
          child: _PreviewAbout(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 900;
        return Scaffold(
          appBar: AppBar(
            titleSpacing: 18,
            title: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: pulseInk,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: const Icon(
                    Icons.bolt_rounded,
                    color: Colors.white,
                    size: 21,
                  ),
                ),
                const SizedBox(width: 10),
                const Text('Pulse'),
              ],
            ),
            actions: [
              if (constraints.maxWidth > 430) const DemoBadge(compact: true),
              IconButton(
                onPressed: _showPreviewInfo,
                tooltip: 'About this preview',
                icon: const Icon(Icons.info_outline_rounded),
              ),
              const SizedBox(width: 8),
            ],
          ),
          body: SafeArea(
            top: false,
            child: Row(
              children: [
                if (wide)
                  NavigationRail(
                    selectedIndex: _selectedIndex,
                    onDestinationSelected: _selectPage,
                    labelType: NavigationRailLabelType.all,
                    backgroundColor: Colors.white,
                    destinations: const [
                      NavigationRailDestination(
                        icon: Icon(Icons.space_dashboard_outlined),
                        selectedIcon: Icon(Icons.space_dashboard_rounded),
                        label: Text('Home'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.receipt_long_outlined),
                        selectedIcon: Icon(Icons.receipt_long_rounded),
                        label: Text('Orders'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.route_outlined),
                        selectedIcon: Icon(Icons.route_rounded),
                        label: Text('Shipments'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.hub_outlined),
                        selectedIcon: Icon(Icons.hub_rounded),
                        label: Text('Network'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.delivery_dining_outlined),
                        selectedIcon: Icon(Icons.delivery_dining_rounded),
                        label: Text('Driver'),
                      ),
                    ],
                  ),
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1180),
                      child: IndexedStack(
                        index: _selectedIndex,
                        children: _pages,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: wide
              ? null
              : NavigationBar(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: _selectPage,
                  destinations: _destinations,
                ),
        );
      },
    );
  }
}

class _PreviewAbout extends StatelessWidget {
  const _PreviewAbout();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const DemoBadge(),
        const SizedBox(height: 14),
        Text(
          'Pulse mobile preview',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        const Text(
          'This Flutter build is an offline product preview. Orders, shipments, '
          'carriers, events and driver tasks are invented sample records. Nothing '
          'is signed in, sent to a server, or saved to a live workspace.',
        ),
        const SizedBox(height: 10),
        const Text(
          'Supabase credentials and production authentication are not connected yet. '
          'Use this preview to explore the intended mobile workflows.',
          style: TextStyle(color: pulseMuted),
        ),
        const SizedBox(height: 18),
        FilledButton.tonal(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Got it'),
        ),
      ],
    );
  }
}
