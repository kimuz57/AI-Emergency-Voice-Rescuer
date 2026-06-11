import 'package:flutter/material.dart';
import 'theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/home_shell.dart';

void main() {
  runApp(const GuardianApp());
}

class GuardianApp extends StatelessWidget {
  const GuardianApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Guardian AI',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      home: const _AuthGate(),
    );
  }
}

enum _AuthState { login, register, home }

class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  _AuthState _state = _AuthState.login;

  @override
  Widget build(BuildContext context) {
    switch (_state) {
      case _AuthState.login:
        return LoginScreen(
          onLogin: () => setState(() => _state = _AuthState.home),
          onGoRegister: () => setState(() => _state = _AuthState.register),
        );
      case _AuthState.register:
        return RegisterScreen(
          onRegister: () => setState(() => _state = _AuthState.login),
          onGoLogin: () => setState(() => _state = _AuthState.login),
        );
      case _AuthState.home:
        return HomeShell(
          onLogout: () => setState(() => _state = _AuthState.login),
        );
    }
  }
}
