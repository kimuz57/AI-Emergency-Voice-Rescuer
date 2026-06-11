import 'dart:async';
import 'package:flutter/material.dart';
import '../data/mock_data.dart' as mock;
import '../theme/app_theme.dart';
import '../widgets/ambient_background.dart';
import '../widgets/glass_card.dart';
import '../services/api_service.dart';
import '../models/patient.dart';

class DashboardScreen extends StatefulWidget {
  final VoidCallback onOpenEventDetails;
  final VoidCallback onOpenHistory;

  const DashboardScreen({
    super.key,
    required this.onOpenEventDetails,
    required this.onOpenHistory,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Patient> _patients = [];
  bool _isLoading = true;
  StreamSubscription? _alertSubscription;

  @override
  void initState() {
    super.initState();
    _fetchPatients();
    _setupRealtimeAlerts();
  }

  @override
  void dispose() {
    _alertSubscription?.cancel();
    ApiService.closeAlerts();
    super.dispose();
  }

  void _setupRealtimeAlerts() {
    final alertStream = ApiService.listenToAlerts();
    if (alertStream != null) {
      _alertSubscription = alertStream.listen((data) {
        if (data['type'] == 'new_alert') {
          final alertData = data['data'];
          // แจ้งเตือนผ่าน UI ทันที
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('🚨 ตรวจพบเสียงฉุกเฉินจากอุปกรณ์: ${alertData['device_mac']}'),
                backgroundColor: AppColors.critical,
                duration: const Duration(seconds: 5),
                action: SnackBarAction(
                  label: 'ดูรายละเอียด',
                  textColor: Colors.white,
                  onPressed: widget.onOpenEventDetails,
                ),
              ),
            );
            // โหลดข้อมูลผู้ป่วยใหม่เพื่ออัปเดตสถานะ
            _fetchPatients();
          }
        }
      });
    }
  }

  Future<void> _fetchPatients() async {
    setState(() => _isLoading = true);
    final patients = await ApiService.getPatients();
    if (mounted) {
      setState(() {
        _patients = patients;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // ในระยะแรก เรายังคงใช้ Critical Alert จาก Mock Data ไปก่อน
    final criticalPatient = mock.patientSummaries[0];

    return Scaffold(
      body: Stack(
        children: [
          const AmbientBackground(),
          SafeArea(
            child: Column(
              children: [
                // App bar
                _DashboardAppBar(),

                // Content
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _fetchPatients,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                      children: [
                        // Summary chips
                        _SummaryRow(patientCount: _patients.length),
                        const SizedBox(height: 20),

                        // Critical alert card
                        _CriticalCard(
                          patient: criticalPatient,
                          onTap: widget.onOpenEventDetails,
                        ),
                        const SizedBox(height: 16),

                        // Section header
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'ผู้ป่วยที่ดูแลอยู่ (จริง)',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.slate900,
                              ),
                            ),
                            GestureDetector(
                              onTap: widget.onOpenHistory,
                              child: const Text(
                                'ดูทั้งหมด',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // Patient cards
                        if (_isLoading)
                          const Center(
                            child: Padding(
                              padding: EdgeInsets.all(20.0),
                              child: CircularProgressIndicator(),
                            ),
                          )
                        else if (_patients.isEmpty)
                          const Center(
                            child: Padding(
                              padding: EdgeInsets.all(20.0),
                              child: Text('ไม่พบข้อมูลผู้ป่วยในระบบ'),
                            ),
                          )
                        else
                          ..._patients.map(
                            (p) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _RealPatientCard(patient: p),
                            ),
                          ),
                      ],
                    ),
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

class _RealPatientCard extends StatelessWidget {
  final Patient patient;
  const _RealPatientCard({required this.patient});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      borderRadius: BorderRadius.circular(22),
      backgroundColor: Colors.white.withOpacity(0.65),
      borderColor: AppColors.glassBorder,
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.primary.withOpacity(0.3),
                width: 1.5,
              ),
            ),
            child: Center(
              child: Text(
                patient.initials,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  color: AppColors.primary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  patient.name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'ห้อง: ${patient.roomNumber}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.slate500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  patient.medicalCondition,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.slate700,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),

          // Status badge (Static for now)
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppColors.success,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    'ปกติ',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── App Bar ────────────────────────────────────────────────────────────────

class _DashboardAppBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.75),
        border: const Border(
          bottom: BorderSide(color: AppColors.glassBorder, width: 1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'ผู้ป่วยของคุณ',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.slate900,
              ),
            ),
          ),
          Icon(Icons.search, color: AppColors.slate500, size: 22),
          const SizedBox(width: 16),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.85),
              borderRadius: BorderRadius.circular(50),
              border: Border.all(color: AppColors.slate200),
            ),
            child: const Center(
              child: Text(
                'GA',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Summary Row ─────────────────────────────────────────────────────────────

class _SummaryRow extends StatelessWidget {
  final int patientCount;
  const _SummaryRow({required this.patientCount});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _SummaryChip(label: '1 ฉุกเฉิน', color: AppColors.critical),
        const SizedBox(width: 8),
        _SummaryChip(label: '0 เฝ้าระวัง', color: AppColors.warning),
        const SizedBox(width: 8),
        _SummaryChip(label: '$patientCount ปกติ', color: AppColors.success),
      ],
    );
  }
}

class _SummaryChip extends StatelessWidget {
  final String label;
  final Color color;

  const _SummaryChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Critical Card ──────────────────────────────────────────────────────────

class _CriticalCard extends StatelessWidget {
  final mock.PatientSummary patient;
  final VoidCallback onTap;

  const _CriticalCard({required this.patient, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: GlassCard(
        borderRadius: BorderRadius.circular(26),
        backgroundColor: const Color(0xA8FFF1F1),
        borderColor: AppColors.criticalBorder,
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top row: avatar + info
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Avatar with badge
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.criticalBorder,
                          width: 2,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          patient.initials,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: AppColors.critical,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: -2,
                      right: -2,
                      child: Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color: AppColors.critical,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Icon(
                          Icons.priority_high,
                          color: Colors.white,
                          size: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 14),

                // Name + status
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        patient.name,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                          color: AppColors.slate900,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.critical,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Text(
                              'ฉุกเฉิน',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              patient.relativeTime,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.slate500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Note
            Text(
              patient.note,
              style: const TextStyle(fontSize: 13, color: AppColors.slate700),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 14),

            // Action button — full width
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: onTap,
                icon: const Icon(Icons.warning_amber_rounded, size: 16),
                label: const Text(
                  'ช่วยเหลือด่วน',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.critical,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
