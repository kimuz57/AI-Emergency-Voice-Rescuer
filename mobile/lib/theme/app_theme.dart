import 'package:flutter/material.dart';

class AppColors {
  static const primary = Color(0xFF2563EB);
  static const primaryLight = Color(0xFF3B82F6);
  static const primaryBg = Color(0xFFEFF6FF);

  static const critical = Color(0xFFEF4444);
  static const criticalLight = Color(0xFFFEF2F2);
  static const criticalBorder = Color(0xFFFECACA);

  static const warning = Color(0xFFF59E0B);
  static const warningLight = Color(0xFFFFFBEB);
  static const warningBorder = Color(0xFFFDE68A);

  static const success = Color(0xFF10B981);
  static const successLight = Color(0xFFECFDF5);
  static const successBorder = Color(0xFFA7F3D0);

  static const slate900 = Color(0xFF0F172A);
  static const slate700 = Color(0xFF334155);
  static const slate500 = Color(0xFF64748B);
  static const slate400 = Color(0xFF94A3B8);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate100 = Color(0xFFF1F5F9);

  static const white = Color(0xFFFFFFFF);
  static const glassWhite = Color(0xCCFFFFFF);
  static const glassBorder = Color(0x66FFFFFF);

  // Ambient orb colors
  static const orb1 = Color(0x33BFDBFE); // blue
  static const orb2 = Color(0x33DDD6FE); // violet
  static const orb3 = Color(0x33BBF7D0); // emerald
}

class AppTheme {
  static ThemeData get theme {
    return ThemeData(
      useMaterial3: true,
      fontFamily: 'Sarabun',
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: Colors.transparent,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: TextStyle(
          color: AppColors.slate900,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
        iconTheme: IconThemeData(color: AppColors.primary),
      ),
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          color: AppColors.slate900,
          fontWeight: FontWeight.w900,
        ),
        bodyLarge: TextStyle(color: AppColors.slate900),
        bodyMedium: TextStyle(color: AppColors.slate700),
        bodySmall: TextStyle(color: AppColors.slate500),
      ),
    );
  }
}
