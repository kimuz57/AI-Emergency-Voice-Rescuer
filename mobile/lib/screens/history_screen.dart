import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../theme/app_theme.dart';
import '../widgets/ambient_background.dart';
import '../widgets/glass_card.dart';

class HistoryScreen extends StatefulWidget {
  final ValueChanged<EventRecord> onOpenEvent;

  const HistoryScreen({super.key, required this.onOpenEvent});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

enum _Filter { all, critical, warning, normal }

class _HistoryScreenState extends State<HistoryScreen> {
  _Filter _filter = _Filter.all;
  String _query = '';

  List<EventRecord> get _visibleEvents {
    return notificationEvents.where((e) {
      final matchesFilter =
          _filter == _Filter.all ||
          (_filter == _Filter.critical &&
              e.severity == EventSeverity.critical) ||
          (_filter == _Filter.warning && e.severity == EventSeverity.warning) ||
          (_filter == _Filter.normal && e.severity == EventSeverity.normal);
      final q = _query.trim().toLowerCase();
      final matchesQuery =
          q.isEmpty ||
          e.patientName.toLowerCase().contains(q) ||
          e.description.toLowerCase().contains(q) ||
          e.transcript.toLowerCase().contains(q) ||
          e.location.toLowerCase().contains(q);
      return matchesFilter && matchesQuery;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final events = _visibleEvents;

    return Scaffold(
      body: Stack(
        children: [
          const AmbientBackground(),
          SafeArea(
            child: Column(
              children: [
                // App bar
                Container(
                  height: 64,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.75),
                    border: const Border(
                      bottom: BorderSide(
                        color: AppColors.glassBorder,
                        width: 1,
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'ประวัติการแจ้งเตือน',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.slate900,
                          ),
                        ),
                      ),
                      Text(
                        '${events.length} รายการ',
                        style: const TextStyle(
                          color: AppColors.slate400,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),

                // Content
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                    children: [
                      // Search + filter card
                      GlassCard(
                        borderRadius: BorderRadius.circular(24),
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            // Search box
                            Container(
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.7),
                                borderRadius: BorderRadius.circular(50),
                                border: Border.all(color: AppColors.slate200),
                              ),
                              child: TextField(
                                onChanged: (v) => setState(() => _query = v),
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: AppColors.slate900,
                                ),
                                decoration: const InputDecoration(
                                  hintText:
                                      'ค้นหาชื่อผู้ป่วย, สถานที่, หรือข้อความ',
                                  hintStyle: TextStyle(
                                    color: AppColors.slate400,
                                    fontSize: 13,
                                  ),
                                  prefixIcon: Icon(
                                    Icons.search,
                                    color: AppColors.slate400,
                                    size: 20,
                                  ),
                                  border: InputBorder.none,
                                  contentPadding: EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 14,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),

                            // Filter chips
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: [
                                  _FilterChip(
                                    label: 'ทั้งหมด',
                                    isActive: _filter == _Filter.all,
                                    onTap: () =>
                                        setState(() => _filter = _Filter.all),
                                  ),
                                  const SizedBox(width: 8),
                                  _FilterChip(
                                    label: 'ฉุกเฉิน',
                                    isActive: _filter == _Filter.critical,
                                    activeColor: AppColors.critical,
                                    onTap: () => setState(
                                      () => _filter = _Filter.critical,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  _FilterChip(
                                    label: 'ติดตาม',
                                    isActive: _filter == _Filter.warning,
                                    activeColor: AppColors.warning,
                                    onTap: () => setState(
                                      () => _filter = _Filter.warning,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  _FilterChip(
                                    label: 'ปกติ',
                                    isActive: _filter == _Filter.normal,
                                    activeColor: AppColors.success,
                                    onTap: () => setState(
                                      () => _filter = _Filter.normal,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Event list
                      if (events.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 40),
                          child: Center(
                            child: Text(
                              'ไม่พบรายการที่ค้นหา',
                              style: TextStyle(
                                color: AppColors.slate400,
                                fontSize: 15,
                              ),
                            ),
                          ),
                        )
                      else
                        ...events.map(
                          (e) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _EventCard(
                              event: e,
                              onTap: () => widget.onOpenEvent(e),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Filter Chip ─────────────────────────────────────────────────────────────

class _FilterChip extends StatelessWidget {
  final String label;
  final bool isActive;
  final Color activeColor;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.isActive,
    this.activeColor = AppColors.primary,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? activeColor : Colors.white.withOpacity(0.6),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isActive ? activeColor : AppColors.slate200,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isActive ? Colors.white : _slate600,
          ),
        ),
      ),
    );
  }
}

// ─── Event Card ──────────────────────────────────────────────────────────────

class _EventCard extends StatelessWidget {
  final EventRecord event;
  final VoidCallback onTap;

  const _EventCard({required this.event, required this.onTap});

  Color get _severityColor {
    switch (event.severity) {
      case EventSeverity.critical:
        return AppColors.critical;
      case EventSeverity.warning:
        return AppColors.warning;
      case EventSeverity.normal:
        return AppColors.success;
    }
  }

  Color get _cardBg {
    switch (event.severity) {
      case EventSeverity.critical:
        return const Color(0xA8FFF1F1);
      case EventSeverity.warning:
        return const Color(0xA8FFFBEB);
      case EventSeverity.normal:
        return Colors.white.withOpacity(0.65);
    }
  }

  Color get _cardBorder {
    switch (event.severity) {
      case EventSeverity.critical:
        return AppColors.criticalBorder;
      case EventSeverity.warning:
        return AppColors.warningBorder;
      case EventSeverity.normal:
        return AppColors.glassBorder;
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: GlassCard(
        borderRadius: BorderRadius.circular(22),
        backgroundColor: _cardBg,
        borderColor: _cardBorder,
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: _severityColor.withOpacity(0.12),
                shape: BoxShape.circle,
                border: Border.all(
                  color: _severityColor.withOpacity(0.3),
                  width: 1.5,
                ),
              ),
              child: Center(
                child: Text(
                  event.initials,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: _severityColor,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        event.patientName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.slate900,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: _severityColor,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          event.severityLabel,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '"${event.transcript}"',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: _severityColor,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        size: 12,
                        color: AppColors.slate400,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        event.location,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.slate500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Time
            Text(
              event.relativeTime,
              style: const TextStyle(fontSize: 10, color: AppColors.slate400),
              textAlign: TextAlign.right,
            ),
          ],
        ),
      ),
    );
  }
}

// slate600 used only in this file
const _slate600 = Color(0xFF475569);
