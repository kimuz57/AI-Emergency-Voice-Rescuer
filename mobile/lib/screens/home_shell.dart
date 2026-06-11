import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../widgets/bottom_nav.dart';
import 'dashboard_screen.dart';
import 'history_screen.dart';
import 'devices_screen.dart';
import 'settings_screen.dart';
import 'event_details_screen.dart';

/// Main shell that holds the bottom navigation and swaps between tabs.
class HomeShell extends StatefulWidget {
  final VoidCallback onLogout;

  const HomeShell({super.key, required this.onLogout});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tabIndex = 0;
  EventRecord? _openEvent;

  void _openEventDetails(EventRecord e) => setState(() => _openEvent = e);
  void _closeEventDetails() => setState(() => _openEvent = null);

  @override
  Widget build(BuildContext context) {
    // Event Details is a full-screen overlay, not a tab
    if (_openEvent != null) {
      return EventDetailsScreen(event: _openEvent!, onBack: _closeEventDetails);
    }

    final tabs = <Widget>[
      DashboardScreen(
        onOpenEventDetails: () => _openEventDetails(notificationEvents[0]),
        onOpenHistory: () => setState(() => _tabIndex = 1),
      ),
      HistoryScreen(onOpenEvent: _openEventDetails),
      const DevicesScreen(),
      SettingsScreen(onLogout: widget.onLogout),
    ];

    return Scaffold(
      body: IndexedStack(index: _tabIndex, children: tabs),
      bottomNavigationBar: BottomNav(
        currentIndex: _tabIndex,
        onTap: (i) => setState(() => _tabIndex = i),
      ),
    );
  }
}
