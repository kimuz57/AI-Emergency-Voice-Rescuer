import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/ambient_background.dart';
import '../widgets/glass_card.dart';

class SettingsScreen extends StatefulWidget {
  final VoidCallback onLogout;

  const SettingsScreen({super.key, required this.onLogout});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _pushNotifications = true;
  bool _criticalAlertSound = true;
  bool _emailNotifications = false;
  bool _lineNotify = true;

  @override
  Widget build(BuildContext context) {
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
                  child: const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'โปรไฟล์ & ตั้งค่า',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.slate900,
                      ),
                    ),
                  ),
                ),

                // Content
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
                    children: [
                      // Profile card
                      GlassCard(
                        borderRadius: BorderRadius.circular(24),
                        padding: const EdgeInsets.all(20),
                        child: Row(
                          children: [
                            Container(
                              width: 60,
                              height: 60,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    AppColors.primary,
                                    AppColors.primaryLight,
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: AppColors.primary.withOpacity(0.3),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: const Center(
                                child: Text(
                                  'GA',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Guardian Admin',
                                    style: TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.slate900,
                                    ),
                                  ),
                                  const Text(
                                    'admin@guardianai.com',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: AppColors.slate500,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.primaryBg,
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: const Text(
                                      'ผู้ดูแลระบบ',
                                      style: TextStyle(
                                        color: AppColors.primary,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            GestureDetector(
                              onTap: () {},
                              child: const Icon(
                                Icons.edit_outlined,
                                color: AppColors.primary,
                                size: 20,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Notifications section
                      _SectionHeader(label: 'การแจ้งเตือน'),
                      const SizedBox(height: 12),
                      GlassCard(
                        borderRadius: BorderRadius.circular(24),
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            _SwitchTile(
                              icon: Icons.notifications_outlined,
                              label: 'การแจ้งเตือน Push',
                              subtitle: 'รับการแจ้งเตือนบนมือถือ',
                              value: _pushNotifications,
                              onChanged: (v) =>
                                  setState(() => _pushNotifications = v),
                              isFirst: true,
                            ),
                            _Divider(),
                            _SwitchTile(
                              icon: Icons.volume_up_outlined,
                              label: 'เสียงแจ้งเตือนฉุกเฉิน',
                              subtitle: 'เปิดเสียงเมื่อพบเหตุฉุกเฉิน',
                              value: _criticalAlertSound,
                              onChanged: (v) =>
                                  setState(() => _criticalAlertSound = v),
                            ),
                            _Divider(),
                            _SwitchTile(
                              icon: Icons.mail_outline,
                              label: 'แจ้งเตือนทางอีเมล',
                              subtitle: 'ส่งรายงานทางอีเมล',
                              value: _emailNotifications,
                              onChanged: (v) =>
                                  setState(() => _emailNotifications = v),
                            ),
                            _Divider(),
                            _SwitchTile(
                              icon: Icons.chat_outlined,
                              label: 'LINE Notify',
                              subtitle: 'แจ้งเตือนผ่าน LINE',
                              value: _lineNotify,
                              onChanged: (v) => setState(() => _lineNotify = v),
                              isLast: true,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      // System section
                      _SectionHeader(label: 'ระบบ'),
                      const SizedBox(height: 12),
                      GlassCard(
                        borderRadius: BorderRadius.circular(24),
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            _NavTile(
                              icon: Icons.person_add_outlined,
                              label: 'เพิ่มผู้ป่วย',
                              isFirst: true,
                              onTap: () {},
                            ),
                            _Divider(),
                            _NavTile(
                              icon: Icons.sensors_outlined,
                              label: 'จัดการอุปกรณ์',
                              onTap: () {},
                            ),
                            _Divider(),
                            _NavTile(
                              icon: Icons.history_outlined,
                              label: 'ประวัติการแจ้งเตือน',
                              onTap: () {},
                              isLast: true,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      // App info
                      GlassCard(
                        borderRadius: BorderRadius.circular(20),
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: const [
                            Text(
                              'Guardian AI',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.slate700,
                              ),
                            ),
                            Text(
                              'v1.0.0',
                              style: TextStyle(
                                fontSize: 13,
                                color: AppColors.slate400,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Logout
                      SizedBox(
                        height: 52,
                        child: OutlinedButton.icon(
                          onPressed: widget.onLogout,
                          icon: const Icon(Icons.logout, size: 18),
                          label: const Text('ออกจากระบบ'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.critical,
                            side: const BorderSide(color: AppColors.critical),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
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

// ─── Sub-widgets ─────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String label;
  const _SectionHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: AppColors.slate500,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Divider(height: 1, thickness: 1, color: AppColors.slate100);
  }
}

class _SwitchTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool isFirst;
  final bool isLast;

  const _SwitchTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.isFirst = false,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(top: isFirst ? 4 : 0, bottom: isLast ? 4 : 0),
      child: ListTile(
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: AppColors.primaryBg,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: AppColors.primary, size: 18),
        ),
        title: Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.slate900,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 12, color: AppColors.slate500),
        ),
        trailing: Switch(
          value: value,
          onChanged: onChanged,
          activeThumbColor: AppColors.primary,
        ),
      ),
    );
  }
}

class _NavTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isFirst;
  final bool isLast;

  const _NavTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isFirst = false,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(top: isFirst ? 4 : 0, bottom: isLast ? 4 : 0),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: AppColors.primaryBg,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: AppColors.primary, size: 18),
        ),
        title: Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.slate900,
          ),
        ),
        trailing: const Icon(
          Icons.chevron_right,
          color: AppColors.slate400,
          size: 20,
        ),
      ),
    );
  }
}
