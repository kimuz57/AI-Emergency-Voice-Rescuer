class Patient {
  final int id;
  final String name;
  final int age;
  final String gender;
  final String roomNumber;
  final String medicalCondition;
  final int userId;
  final String? status; // สำหรับแสดงสถานะจำลอง (ปกติ/ฉุกเฉิน) ในอนาคตจะดึงจาก logs

  Patient({
    required this.id,
    required this.name,
    required this.age,
    required this.gender,
    required this.roomNumber,
    required this.medicalCondition,
    required this.userId,
    this.status,
  });

  factory Patient.fromJson(Map<String, dynamic> json) {
    return Patient(
      id: json['ID'] ?? 0,
      name: json['Name'] ?? '',
      age: json['Age'] ?? 0,
      gender: json['Gender'] ?? '',
      roomNumber: json['RoomNumber'] ?? '',
      medicalCondition: json['MedicalCondition'] ?? '',
      userId: json['user_id'] ?? 0,
      status: 'ปกติ', // ค่าเริ่มต้น
    );
  }

  // ตัวย่อสำหรับ Avatar
  String get initials => name.isNotEmpty ? name[0] : '?';
}
