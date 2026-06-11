import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Renders the soft ambient gradient blobs in the background — matching
/// the web AmbientOrbs component.
class AmbientBackground extends StatelessWidget {
  const AmbientBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Base gradient
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFF0F7FF), Color(0xFFF5F3FF), Color(0xFFF0FDF4)],
            ),
          ),
        ),
        // Orb top-right (blue)
        Positioned(
          top: -80,
          right: -80,
          child: _Orb(size: 300, color: AppColors.orb1),
        ),
        // Orb top-left (violet)
        Positioned(
          top: 120,
          left: -60,
          child: _Orb(size: 220, color: AppColors.orb2),
        ),
        // Orb bottom-right (emerald)
        Positioned(
          bottom: 100,
          right: 20,
          child: _Orb(size: 180, color: AppColors.orb3),
        ),
      ],
    );
  }
}

class _Orb extends StatelessWidget {
  final double size;
  final Color color;

  const _Orb({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}
