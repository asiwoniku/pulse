import unittest
from types import SimpleNamespace

from pulse_service.api import _shipment_detail, _shipments
from pulse_service.support import ServiceError


class FakeDatabase:
    def __init__(self, *, shipments=None, orders=None, events=None):
        self.shipments = shipments or []
        self.orders = orders or []
        self.events = events or []
        self.calls = []

    def select(self, table, query, token):
        self.calls.append((table, query, token))
        if table == "pulse_shipments":
            return self.shipments
        if table == "orders":
            return self.orders
        if table == "pulse_shipment_events":
            return self.events
        raise AssertionError(f"Unexpected table: {table}")


def request(db, *, query=None, params=None, token="user-token"):
    return SimpleNamespace(
        query=query or {},
        params=params or {},
        need_token=lambda: token,
        db=lambda: db,
    )


class ShipmentRoutesTests(unittest.TestCase):
    def test_list_uses_workspace_filter_and_returns_joined_orders(self):
        business_id = "11111111-1111-4111-8111-111111111111"
        shipment = {
            "id": "22222222-2222-4222-8222-222222222222",
            "order_id": "33333333-3333-4333-8333-333333333333",
        }
        order = {"id": shipment["order_id"], "reference": "ORD-2026-00001"}
        db = FakeDatabase(shipments=[shipment], orders=[order])

        status, payload = _shipments(
            request(
                db,
                query={
                    "business_id": business_id,
                    "limit": "10",
                    "offset": "5",
                    "q": "PLS-NG-7",
                    "status": "in_transit",
                },
            )
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["shipments"][0]["order"], order)
        self.assertFalse(payload["has_more"])
        self.assertIn(f"business_id.eq.{business_id}", db.calls[0][1])
        self.assertIn(f"originator_business_id.eq.{business_id}", db.calls[0][1])
        self.assertIn("pulse_shipment_id=ilike.%2APLS-NG-7%2A", db.calls[0][1])
        self.assertIn("limit=11&offset=5", db.calls[0][1])
        self.assertEqual(db.calls[0][2], "user-token")

    def test_list_rejects_non_uuid_workspace_before_database_access(self):
        db = FakeDatabase()
        with self.assertRaises(ServiceError):
            _shipments(request(db, query={"business_id": "id.eq.anything"}))
        self.assertEqual(db.calls, [])

    def test_detail_returns_latest_capped_events_in_chronological_order(self):
        shipment_id = "22222222-2222-4222-8222-222222222222"
        order_id = "33333333-3333-4333-8333-333333333333"
        events = [
            {"event_id": str(index), "occurred_at": index}
            for index in range(500, -1, -1)
        ]
        db = FakeDatabase(
            shipments=[{"id": shipment_id, "order_id": order_id}],
            orders=[{"id": order_id, "reference": "ORD-2026-00001"}],
            events=events,
        )

        status, payload = _shipment_detail(
            request(db, params={"shipment_id": shipment_id})
        )

        self.assertEqual(status, 200)
        self.assertTrue(payload["events_truncated"])
        self.assertEqual(len(payload["events"]), 500)
        self.assertEqual(payload["events"][0]["event_id"], "1")
        self.assertEqual(payload["events"][-1]["event_id"], "500")
        self.assertEqual(db.calls[-1][2], "user-token")
        self.assertNotIn("actor_user_id", db.calls[-1][1])
        self.assertNotIn("idempotency_key", db.calls[-1][1])

    def test_detail_rejects_non_uuid_before_database_access(self):
        db = FakeDatabase()
        with self.assertRaises(ServiceError):
            _shipment_detail(request(db, params={"shipment_id": "x&select=*"}))
        self.assertEqual(db.calls, [])


if __name__ == "__main__":
    unittest.main()
