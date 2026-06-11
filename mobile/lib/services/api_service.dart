import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter/foundation.dart';

import '../models/patient.dart';

class ApiService {
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:8080/api';
    if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:8080/api';
    return 'http://localhost:8080/api';
  }

  static String get wsUrl {
    if (kIsWeb) return 'ws://localhost:8080/ws/alerts';
    if (defaultTargetPlatform == TargetPlatform.android) return 'ws://10.0.2.2:8080/ws/alerts';
    return 'ws://localhost:8080/ws/alerts';
  }

  static WebSocketChannel? _channel;

  static Stream<dynamic>? listenToAlerts() {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      return _channel!.stream.map((message) => jsonDecode(message));
    } catch (e) {
      print('WebSocket connection error: $e');
      return null;
    }
  }

  static void closeAlerts() {
    _channel?.sink.close();
  }

  static Future<String?> login(String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email,
          'password': password,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final token = data['token'];
        
        // บันทึก Token ลงเครื่อง
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('jwt_token', token);
        
        return null; // สำเร็จ (ไม่มี error message)
      } else {
        final data = jsonDecode(response.body);
        return data['error'] ?? 'เข้าสู่ระบบล้มเหลว';
      }
    } catch (e) {
      return 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
    }
  }

  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('jwt_token');
  }

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('jwt_token');
  }

  static Future<List<Patient>> getPatients() async {
    try {
      final token = await getToken();
      final response = await http.get(
        Uri.parse('$baseUrl/patients'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        return data.map((item) => Patient.fromJson(item)).toList();
      } else {
        return [];
      }
    } catch (e) {
      return [];
    }
  }
}
