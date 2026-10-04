import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pulse_mobile/main.dart';

void main() {
  testWidgets('opens an explicitly offline demo dashboard', (tester) async {
    await tester.pumpWidget(const PulseApp());
    await tester.pumpAndSettle();

    expect(find.text('Every handoff.\nIn sync.'), findsOneWidget);
    expect(find.text('Demo preview · all data is sample only'), findsOneWidget);
    expect(find.text('Today at a glance'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
  });

  testWidgets('search filters sample orders and opens order details', (
    tester,
  ) async {
    await tester.pumpWidget(const PulseApp());
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.receipt_long_outlined));
    await tester.pumpAndSettle();
    expect(find.text('ORD-2026-00184'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'Tunde');
    await tester.pumpAndSettle();
    expect(find.text('ORD-2026-00181'), findsOneWidget);
    expect(find.text('ORD-2026-00184'), findsNothing);

    await tester.tap(find.text('ORD-2026-00181'));
    await tester.pumpAndSettle();
    expect(
      find.text('Order details are not connected to a live workspace'),
      findsNothing,
    );
    expect(find.text('Tunde Adeyemi'), findsOneWidget);
    expect(
      find.text('Sample order · details are not connected to a live workspace'),
      findsOneWidget,
    );
  });

  testWidgets('adds a local sample shipment event without server access', (
    tester,
  ) async {
    await tester.pumpWidget(const PulseApp());
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.route_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('PLS-NG-00042'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add update'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add local sample event'));
    await tester.pumpAndSettle();

    expect(
      find.text('Sample event added locally · nothing was sent'),
      findsOneWidget,
    );
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();
    expect(find.text('4 updates'), findsOneWidget);
  });

  testWidgets('adapts to phone and tablet layouts without render errors', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 800);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const PulseApp());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    for (final icon in [
      Icons.receipt_long_outlined,
      Icons.route_outlined,
      Icons.hub_outlined,
      Icons.delivery_dining_outlined,
    ]) {
      await tester.tap(find.byIcon(icon));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    tester.view.physicalSize = const Size(1024, 900);
    await tester.pumpAndSettle();
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('release gate keeps sample records out of the live entry point', (
    tester,
  ) async {
    await tester.pumpWidget(const PulseBuildGate());

    expect(find.text('Pulse is not configured for live use'), findsOneWidget);
    expect(find.text('PLS-NG-00042'), findsNothing);
    expect(find.text('ORD-2026-00184'), findsNothing);
  });
}
