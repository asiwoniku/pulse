import 'package:flutter_test/flutter_test.dart';
import 'package:pulse_mobile/data/models.dart';

void main() {
  test('order OTP requirement reads the database column name', () {
    final order = OrderRow.fromJson(<String, dynamic>{
      'id': 'order-1',
      'reference': 'ORD-2026-00001',
      'status': 'assigned',
      'delivery_otp_required': true,
    });

    expect(order.requiresOtp, isTrue);
  });

  test('driver assignment reads nested order OTP requirement', () {
    final assignment = Assignment.fromJson(<String, dynamic>{
      'id': 'assignment-1',
      'order_id': 'order-1',
      'status': 'pending',
      'order': <String, dynamic>{
        'reference': 'ORD-2026-00001',
        'delivery_otp_required': true,
      },
    });

    expect(assignment.orderReference, 'ORD-2026-00001');
    expect(assignment.requiresOtp, isTrue);
  });
}
