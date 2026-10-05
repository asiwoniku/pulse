import 'package:flutter/material.dart';

import '../data/models.dart';
import '../data/pulse_data.dart';
import 'live_app.dart';
import 'live_workspace_shell.dart';

/// The driver's day.
///
/// Everything here is an *assignment*: a driver acts on orders only through the
/// assignment handed to them, which is why this list joins `driver_assignments`
/// rather than `orders`. Price, payment and customer financials are absent by
/// design — `guard_order_columns` (0013) makes them unwritable by a driver, so
/// showing them would advertise a screen that cannot do anything.
class PulserHome extends StatefulWidget {
  const PulserHome({super.key, required this.data});
  final PulseData data;

  @override
  State<PulserHome> createState() => _PulserHomeState();
}

class _PulserHomeState extends State<PulserHome> {
  DriverProfile? _driver;
  List<Assignment> _jobs = <Assignment>[];
  bool _loading = true;
  String? _error;
  String? _message;

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
      final driver = await widget.data.currentDriver();
      if (driver == null) {
        // Signed in, but the partner has not issued this person a driver record.
        if (!mounted) return;
        setState(() {
          _driver = null;
          _jobs = <Assignment>[];
          _loading = false;
        });
        return;
      }
      final jobs = await widget.data.myAssignments(driver.id);
      if (!mounted) return;
      setState(() {
        _driver = driver;
        _jobs = jobs;
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

  Future<void> _run(Future<void> Function() action, String success) async {
    setState(() => _message = null);
    try {
      await action();
      await _load();
      if (mounted) setState(() => _message = success);
    } on PulseApiError catch (e) {
      // The database's own refusal, shown as-is.
      if (mounted) setState(() => _error = e.message);
    }
  }

@override
  Widget build(BuildContext context) {
    final driver = _driver;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pulser'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () => widget.data.signOut(),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : driver == null
              ? const EmptyView(
                  title: 'No driver account yet',
                  body: 'Your company has not issued you a driver account. Ask '
                      'them to add you from Team & permissions in Pulse.',
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: <Widget>[
                      _availabilityCard(driver),
                      if (_message != null) ...<Widget>[
                        const SizedBox(height: 12),
                        Text(_message!,
                            style: const TextStyle(color: Color(0xFF0F9D58))),
                      ],
                      if (_error != null) ...<Widget>[
                        const SizedBox(height: 12),
                        Text(_error!,
                            style: const TextStyle(color: Color(0xFFB3261E))),
                      ],
                      const SizedBox(height: 16),
                      const Text('Your jobs',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      if (_jobs.isEmpty)
                        const EmptyView(
                          title: 'Nothing assigned',
                          body: 'Jobs appear here the moment a dispatcher assigns '
                              'them to you.',
                        )
                      else
                        ..._jobs.map((Assignment a) => _JobCard(
                              assignment: a,
                              onAccept: () => _run(
                                () => widget.data.respondToAssignment(a.id, true),
                                'Job accepted.',
                              ),
                              onDecline: () => _run(
                                () => widget.data
                                    .respondToAssignment(a.id, false),
                                'Job declined.',
                              ),
                              onOpen: () => _openJob(a),
                            )),
                    ],
                  ),
                ),
    );
  }

  Widget _availabilityCard(DriverProfile driver) {
    final available = driver.isAvailable;
    return Card(
      child: ListTile(
        leading: Icon(available ? Icons.check_circle : Icons.pause_circle,
            color: available ? const Color(0xFF0F9D58) : Colors.grey),
        title: Text(available ? 'Available for jobs' : 'Not taking jobs'),
        subtitle: Text(available
            ? 'Dispatchers can assign you work.'
            : 'You will not be given new jobs.'),
        trailing: Switch(
          value: available,
          onChanged: PulseData.isDemoMode
              ? null
              : (bool on) => _run(
                    () => widget.data.setDriverAvailability(driver.id, on),
                    on ? 'You are available.' : 'You are off the board.',
                  ),
        ),
      ),
    );
  }

  void _openJob(Assignment a) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (BuildContext sheetContext) => _JobSheet(
        data: widget.data,
        assignment: a,
        onDone: _load,
      ),
    );
  }
}

/// One job. Pending work gets accept/decline; accepted work opens the sheet where
/// attempts and proof of delivery are recorded.
class _JobCard extends StatelessWidget {
  const _JobCard({
    required this.assignment,
    required this.onAccept,
    required this.onDecline,
    required this.onOpen,
  });

  final Assignment assignment;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final a = assignment;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(a.orderReference ?? a.orderId,
                      style: const TextStyle(
                          fontFamily: 'monospace', fontWeight: FontWeight.bold)),
                ),
                StatusChip(status: a.status),
              ],
            ),
            const SizedBox(height: 8),
            _stop('Pickup', a.pickupText),
            _stop('Drop off', a.destinationText),
            if (a.scheduledStart != null) ...<Widget>[
              const SizedBox(height: 4),
              Text('Scheduled ${a.scheduledStart!.toLocal()}',
                  style: Theme.of(context).textTheme.bodySmall),
            ],
            if (a.requiresOtp == true) ...<Widget>[
              const SizedBox(height: 6),
              const Row(
                children: <Widget>[
                  Icon(Icons.lock_person, size: 14),
                  SizedBox(width: 4),
                  Text('Code required at the door',
                      style: TextStyle(fontSize: 12)),
                ],
              ),
            ],
            if (a.notes != null && a.notes!.isNotEmpty) ...<Widget>[
              const SizedBox(height: 6),
              Text(a.notes!, style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 8),
            Row(
              children: <Widget>[
                if (a.isPending) ...<Widget>[
                  FilledButton(onPressed: onAccept, child: const Text('Accept')),
                  const SizedBox(width: 8),
                  OutlinedButton(
                      onPressed: onDecline, child: const Text('Decline')),
                ] else
                  FilledButton.tonal(
                      onPressed: onOpen, child: const Text('Open job')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _stop(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text('$label: ${value ?? 'not recorded'}',
          style: const TextStyle(fontSize: 13)),
    );
  }
}

/// The working screen for one accepted job.
///
/// Attempts and proof of delivery both go through guarded database functions. A
/// failed attempt is a legitimate outcome — it raises a real exception case
/// instead of destroying the primary status — and proof is refused unless the
/// order actually reached `delivered` and any required code was given.
class _JobSheet extends StatefulWidget {
  const _JobSheet({
    required this.data,
    required this.assignment,
    required this.onDone,
  });

  final PulseData data;
  final Assignment assignment;
  final VoidCallback onDone;

  @override
  State<_JobSheet> createState() => _JobSheetState();
}

class _JobSheetState extends State<_JobSheet> {
  final _recipient = TextEditingController();
  final _otp = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _recipient.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _attempt(String event) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.data.recordDeliveryAttempt(widget.assignment.orderId, event);
      widget.onDone();
      if (mounted) Navigator.of(context).pop();
    } on PulseApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _proof() async {
    if (_recipient.text.trim().length < 2) {
      setState(() => _error = 'Enter who received the delivery.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.data.captureProofOfDelivery(
        widget.assignment.orderId,
        recipientName: _recipient.text.trim(),
        otp: _otp.text.trim().isEmpty ? null : _otp.text.trim(),
      );
      widget.onDone();
      if (mounted) Navigator.of(context).pop();
    } on PulseApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(widget.assignment.orderReference ?? 'Job',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('Pickup: ${widget.assignment.pickupText ?? '—'}'),
            Text('Drop off: ${widget.assignment.destinationText ?? '—'}'),
            const Divider(height: 28),
            if (_error != null) ...<Widget>[
              Text(_error!, style: const TextStyle(color: Color(0xFFB3261E))),
              const SizedBox(height: 12),
            ],
            const Text('Record an attempt',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                OutlinedButton(
                    onPressed: _busy ? null : () => _attempt('attempted'),
                    child: const Text('Attempted')),
                OutlinedButton(
                    onPressed: _busy ? null : () => _attempt('picked_up'),
                    child: const Text('Picked up')),
                OutlinedButton(
                    onPressed: _busy ? null : () => _attempt('failed'),
                    child: const Text('Failed')),
              ],
            ),
            const Divider(height: 28),
            const Text('Proof of delivery',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(
              controller: _recipient,
              decoration: const InputDecoration(
                  labelText: 'Who received it', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            if (widget.assignment.requiresOtp == true)
              TextField(
                controller: _otp,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Code from the recipient',
                    border: OutlineInputBorder()),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _proof,
              child: const Text('Record proof of delivery'),
            ),
            if (PulseData.isDemoMode) ...<Widget>[
              const SizedBox(height: 12),
              const Text(
                'Demo mode: writes are refused, so no record actually changes.',
                style: TextStyle(fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }
}