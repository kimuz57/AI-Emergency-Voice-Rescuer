import 'package:flutter_test/flutter_test.dart';

import 'package:guardian_ai/main.dart';

void main() {
  testWidgets('GuardianApp smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const GuardianApp());

    // Verify that the app renders without errors.
    expect(find.byType(GuardianApp), findsOneWidget);
  });
}
