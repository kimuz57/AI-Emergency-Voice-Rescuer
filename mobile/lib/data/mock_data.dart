enum PatientStatus { critical, risk, normal }

enum EventSeverity { critical, warning, normal }

class PatientSummary {
  final String id;
  final String name;
  final int age;
  final PatientStatus status;
  final String relativeTime;
  final String room;
  final String note;
  final String initials;
  final String accent; // red | blue | emerald | amber

  const PatientSummary({
    required this.id,
    required this.name,
    required this.age,
    required this.status,
    required this.relativeTime,
    required this.room,
    required this.note,
    required this.initials,
    required this.accent,
  });
}

class EventRecord {
  final String id;
  final String patientId;
  final String patientName;
  final String initials;
  final EventSeverity severity;
  final String severityLabel;
  final String relativeTime;
  final String timeLabel;
  final String location;
  final String device;
  final String transcript;
  final String description;
  final double confidence;

  const EventRecord({
    required this.id,
    required this.patientId,
    required this.patientName,
    required this.initials,
    required this.severity,
    required this.severityLabel,
    required this.relativeTime,
    required this.timeLabel,
    required this.location,
    required this.device,
    required this.transcript,
    required this.description,
    required this.confidence,
  });
}

class DeviceItem {
  final String id;
  final String code;
  final String name;
  final String patientName;
  final String room;
  final bool isOnline;
  final String lastSeen;

  const DeviceItem({
    required this.id,
    required this.code,
    required this.name,
    required this.patientName,
    required this.room,
    required this.isOnline,
    required this.lastSeen,
  });
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

final patientSummaries = <PatientSummary>[
  const PatientSummary(
    id: 'patient-prakhong',
    name: 'คุณยายประคอง',
    age: 82,
    status: PatientStatus.critical,
    relativeTime: 'อัปเดตล่าสุด 10 วินาทีที่แล้ว',
    room: 'ห้องรับแขก',
    note: 'ลุกไม่ไหวและร้องขอความช่วยเหลือ',
    initials: 'ป',
    accent: 'red',
  ),
  const PatientSummary(
    id: 'patient-somchai',
    name: 'คุณตาสมชาย',
    age: 76,
    status: PatientStatus.normal,
    relativeTime: '5 นาทีที่แล้ว',
    room: 'ห้องครัว',
    note: 'กิจกรรมปกติ ไม่มีเหตุผิดปกติ',
    initials: 'ส',
    accent: 'blue',
  ),
  const PatientSummary(
    id: 'patient-somsri',
    name: 'คุณยายสมศรี',
    age: 79,
    status: PatientStatus.normal,
    relativeTime: '12 นาทีที่แล้ว',
    room: 'ห้องอ่านหนังสือ',
    note: 'ตอบสนองตามปกติหลังตรวจเสียงล่าสุด',
    initials: 'ศ',
    accent: 'emerald',
  ),
  const PatientSummary(
    id: 'patient-weera',
    name: 'คุณตาวีระ',
    age: 81,
    status: PatientStatus.risk,
    relativeTime: '1 นาทีที่แล้ว',
    room: 'สวนหลังบ้าน',
    note: 'ตรวจพบคำขอความช่วยเหลือระดับเฝ้าระวัง',
    initials: 'ว',
    accent: 'amber',
  ),
];

final notificationEvents = <EventRecord>[
  const EventRecord(
    id: 'event-critical-help',
    patientId: 'GA-8829',
    patientName: 'คุณยายประคอง',
    initials: 'ป',
    severity: EventSeverity.critical,
    severityLabel: 'ฉุกเฉินสูงสุด',
    relativeTime: '10 วินาทีที่แล้ว',
    timeLabel: '10:42 น.',
    location: 'ห้องรับแขก',
    device: 'Hub 01',
    transcript: 'ช่วยด้วย... ช่วยด้วย... ลุกไม่ไหว',
    description: 'ตรวจพบเสียงขอความช่วยเหลือซ้ำหลายครั้ง',
    confidence: 0.96,
  ),
  const EventRecord(
    id: 'event-warning-medicine',
    patientId: 'GA-7714',
    patientName: 'คุณตาวีระ',
    initials: 'ว',
    severity: EventSeverity.warning,
    severityLabel: 'ระดับเฝ้าระวัง',
    relativeTime: '1 นาทีที่แล้ว',
    timeLabel: '10:41 น.',
    location: 'สวนหลังบ้าน',
    device: 'Hub 04',
    transcript: 'ต้องการยา... ปวดหัวมาก',
    description: 'ตรวจพบเสียงขอยาและอาการปวด',
    confidence: 0.78,
  ),
  const EventRecord(
    id: 'event-normal-call',
    patientId: 'GA-7210',
    patientName: 'คุณตาสมชาย',
    initials: 'ส',
    severity: EventSeverity.normal,
    severityLabel: 'ปกติ',
    relativeTime: '5 นาทีที่แล้ว',
    timeLabel: '10:37 น.',
    location: 'ห้องครัว',
    device: 'Hub 02',
    transcript: 'สวัสดี โอเค ไม่เป็นไร',
    description: 'ตรวจพบเสียงทักทายทั่วไป ไม่มีความเสี่ยง',
    confidence: 0.89,
  ),
  const EventRecord(
    id: 'event-normal-2',
    patientId: 'GA-5501',
    patientName: 'คุณยายสมศรี',
    initials: 'ศ',
    severity: EventSeverity.normal,
    severityLabel: 'ปกติ',
    relativeTime: '12 นาทีที่แล้ว',
    timeLabel: '10:30 น.',
    location: 'ห้องอ่านหนังสือ',
    device: 'Hub 03',
    transcript: 'โอเค ดีนะ ขอบคุณ',
    description: 'ตรวจสอบสม่ำเสมอ ไม่พบเหตุน่ากังวล',
    confidence: 0.92,
  ),
];

final mockDevices = <DeviceItem>[
  const DeviceItem(
    id: 'dev-01',
    code: 'HUB-001',
    name: 'Guardian Hub 01',
    patientName: 'คุณยายประคอง',
    room: 'ห้องรับแขก',
    isOnline: true,
    lastSeen: 'ออนไลน์อยู่',
  ),
  const DeviceItem(
    id: 'dev-02',
    code: 'HUB-002',
    name: 'Guardian Hub 02',
    patientName: 'คุณตาสมชาย',
    room: 'ห้องครัว',
    isOnline: true,
    lastSeen: 'ออนไลน์อยู่',
  ),
  const DeviceItem(
    id: 'dev-03',
    code: 'HUB-003',
    name: 'Guardian Hub 03',
    patientName: 'คุณยายสมศรี',
    room: 'ห้องอ่านหนังสือ',
    isOnline: false,
    lastSeen: '2 ชั่วโมงที่แล้ว',
  ),
  const DeviceItem(
    id: 'dev-04',
    code: 'HUB-004',
    name: 'Guardian Hub 04',
    patientName: 'คุณตาวีระ',
    room: 'สวนหลังบ้าน',
    isOnline: true,
    lastSeen: 'ออนไลน์อยู่',
  ),
];
