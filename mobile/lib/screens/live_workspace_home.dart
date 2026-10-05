import 'package:flutter/material.dart';

import '../data/models.dart';
import '../data/pulse_data.dart';
import 'live_app.dart';
import 'live_workspace_shell.dart';

/// Signed in: the workspaces this account belongs to, and — when there are none —
/// the two real ways forward. Being in no company is a real state with a real next
/// action; it is never filled with a sample company.
class WorkspaceHome extends StatefulWidget {
  const WorkspaceHome({super.key, required this.data});
  final PulseData data;

  @override
  State<WorkspaceHome> createState() => _WorkspaceHomeState();
}

class _WorkspaceHomeState extends State<WorkspaceHome> {
  List<Workspace> _workspaces = <Workspace>[];
  String? _error;
  bool _loading = true;
  bool _busy = false;

  final _name = TextEditingController();
  final _city = TextEditingController();
  final _code = TextEditingController();

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
      final rows = await widget.data.workspaces();
      final saved = await widget.data.activeBusinessId();
      // The first workspace is a convenience, persisted immediately so every later
      // query is explicit rather than guessed from whichever row came first.
      if (rows.isNotEmpty) {
        await widget.data.selectBusiness(saved ?? rows.first.id);
      }
      if (!mounted) return;
      setState(() {
        _workspaces = rows;
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

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      await _load();
    } on PulseApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null && _workspaces.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Pulse')),
        body: ErrorView(message: _error!, onRetry: _load),
      );
    }
    return _workspaces.isEmpty ? _noWorkspace() : _list();
  }

  AppBar _bar() => AppBar(
        title: const Text('Pulse'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () => widget.data.signOut(),
          ),
        ],
      );

  Widget _noWorkspace() => Scaffold(
        appBar: _bar(),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            const Text('You are not a member of a company yet.',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text(
              'Nothing is invented to fill this screen. Create a workspace, or redeem '
              'an invitation code an owner sent you.'),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: Color(0xFFB3261E))),
            ],
            const SizedBox(height: 28),
            const Text('Create a workspace',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(
              controller: _name,
              decoration: const InputDecoration(
                  labelText: 'Company name', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _city,
              decoration: const InputDecoration(
                  labelText: 'City (optional)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy || _name.text.trim().length < 2
                  ? null
                  : () => _run(() => widget.data.createBusiness(
                      name: _name.text, city: _city.text)),
              child: const Text('Create workspace'),
            ),
            const SizedBox(height: 32),
            const Text('Join with a code',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(
              controller: _code,
              decoration: const InputDecoration(
                  labelText: 'Invitation code', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: _busy || _code.text.trim().isEmpty
                  ? null
                  : () => _run(() async {
                        await widget.data.acceptInvitation(_code.text);
                        _code.clear();
                      }),
              child: const Text('Accept invitation'),
            ),
          ],
        ),
      );

  Widget _list() => Scaffold(
        appBar: _bar(),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: _workspaces
              .map((Workspace w) => Card(
                    child: ListTile(
                      leading: Icon(w.isVendor
                          ? Icons.storefront
                          : Icons.local_shipping),
                      title: Text(w.name),
                      subtitle: Text(<String?>[
                        w.isVendor ? 'Vendor' : 'Carrier',
                        w.city,
                        w.currency,
                      ].whereType<String>().join(' · ')),
                      onTap: () async {
                        await widget.data.selectBusiness(w.id);
                        if (!context.mounted) return;
                        await Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) =>
                              WorkspaceShell(data: widget.data, workspace: w),
                        ));
                      },
                    ),
                  ))
              .toList(),
        ),
      );
}