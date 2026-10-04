import unittest
from types import SimpleNamespace

from pulse_service.api import (
    _audit_logs,
    _documents,
    _moving_request_create,
    _moving_requests,
    _notifications,
    _order_feedback,
    _payment_attempts,
)
from pulse_service.support import ServiceError


BUSINESS_ID = "11111111-1111-4111-8111-111111111111"
SHIPMENT_ID = "22222222-2222-4222-8222-222222222222"
ORDER_ID = "33333333-3333-4333-8333-333333333333"


class FakeDatabase:
    def __init__(self, *, rows=None, inserted=None):
        self.rows = rows or {}
        self.inserted = inserted or []
        self.calls = []

    def select(self, table, query, token):
        self.calls.append(("select", table, query, token))
        return self.rows.get(table, [])

    def insert_row(self, table, payload, token):
        self.calls.append(("insert", table, payload, token))
        return self.inserted


def request(db, *, query=None, body=None, token="user-token"):
    return SimpleNamespace(
        query=query or {},
        body=body or {},
        need_token=lambda: token,
        db=lambda: db,
    )


class WorkspaceRecordRoutesTests(unittest.TestCase):
    def test_moving_requests_join_real_items_under_user_token(self):
        moving = {"id": "moving-1"}
        item = {"id": "item-1", "moving_request_id": "moving-1"}
        db = FakeDatabase(rows={"moving_requests": [moving], "moving_items": [item]})

        status, payload = _moving_requests(
            request(db, query={"business_id": BUSINESS_ID})
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["moving_requests"][0]["items"], [item])
        self.assertEqual([call[3] for call in db.calls], ["user-token", "user-token"])
        self.assertIn(f"business_id=eq.{BUSINESS_ID}", db.calls[0][2])

    def test_moving_request_create_sends_only_validated_fields(self):
        row = {"id": "moving-1", "status": "request_submitted"}
        db = FakeDatabase(inserted=[row])

        status, payload = _moving_request_create(
            request(
                db,
                body={
                    "business_id": BUSINESS_ID,
                    "origin_text": "  Lagos  ",
                    "destination_text": "  Abuja ",
                    "preferred_date": "2026-10-12",
                    "requires_packing": "yes",
                    "currency": "ngn",
                    "status": "completed",
                },
            )
        )

        self.assertEqual(status, 201)
        self.assertEqual(payload["moving_request"], row)
        self.assertEqual(
            db.calls[0][2],
            {
                "business_id": BUSINESS_ID,
                "origin_text": "Lagos",
                "destination_text": "Abuja",
                "preferred_date": "2026-10-12",
                "requires_packing": "yes",
                "currency": "NGN",
            },
        )
        self.assertEqual(db.calls[0][3], "user-token")

    def test_moving_request_create_rejects_invalid_input_without_writing(self):
        db = FakeDatabase()
        invalid_bodies = [
            {"business_id": "invalid", "origin_text": "Lagos", "destination_text": "Abuja"},
            {"business_id": BUSINESS_ID, "origin_text": "x", "destination_text": "Abuja"},
            {
                "business_id": BUSINESS_ID,
                "origin_text": "Lagos",
                "destination_text": "Abuja",
                "preferred_date": "next Tuesday",
            },
            {
                "business_id": BUSINESS_ID,
                "origin_text": "Lagos",
                "destination_text": "Abuja",
                "requires_packing": "maybe",
            },
        ]
        for body in invalid_bodies:
            with self.subTest(body=body), self.assertRaises(ServiceError):
                _moving_request_create(request(db, body=body))
        self.assertEqual(db.calls, [])

    def test_workspace_records_reject_invalid_business_before_read(self):
        db = FakeDatabase()
        for handler in (
            _moving_requests,
            _payment_attempts,
            _notifications,
            _audit_logs,
            _order_feedback,
            _documents,
        ):
            with self.subTest(handler=handler.__name__), self.assertRaises(ServiceError):
                handler(request(db, query={"business_id": "x&select=*"}))
        self.assertEqual(db.calls, [])

    def test_payment_records_join_references_without_payload(self):
        attempt = {"id": "payment-1", "order_id": ORDER_ID}
        order = {"id": ORDER_ID, "reference": "ORD-1"}
        db = FakeDatabase(rows={"payment_attempts": [attempt], "orders": [order]})

        status, payload = _payment_attempts(
            request(db, query={"business_id": BUSINESS_ID})
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["payment_attempts"][0]["order"], order)
        self.assertNotIn("provider_payload", db.calls[0][2])
        self.assertEqual(db.calls[1][3], "user-token")

    def test_document_index_returns_only_recorded_proof_events(self):
        shipment = {"id": SHIPMENT_ID, "pulse_shipment_id": "PLS-001"}
        event = {
            "event_id": "event-1",
            "shipment_id": SHIPMENT_ID,
            "event_type": "proof_of_delivery_uploaded",
        }
        db = FakeDatabase(rows={"pulse_shipments": [shipment], "pulse_shipment_events": [event]})

        status, payload = _documents(
            request(db, query={"business_id": BUSINESS_ID})
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["documents"][0]["shipment"], shipment)
        self.assertIn("originator_business_id", db.calls[0][2])
        self.assertEqual(db.calls[1][3], "user-token")


if __name__ == "__main__":
    unittest.main()
