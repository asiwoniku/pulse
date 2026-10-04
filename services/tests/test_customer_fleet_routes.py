import unittest
from types import SimpleNamespace

from pulse_service.api import _customers_list, _vehicle_create, _vehicles_list
from pulse_service.support import ServiceError


BUSINESS_ID = "11111111-1111-4111-8111-111111111111"


class FakeDatabase:
    def __init__(self, *, customers=None, vehicles=None, inserted=None):
        self.customers = customers or []
        self.vehicles = vehicles or []
        self.inserted = inserted or []
        self.calls = []

    def select(self, table, query, token):
        self.calls.append(("select", table, query, token))
        if table == "customers":
            return self.customers
        if table == "vehicles":
            return self.vehicles
        raise AssertionError(f"Unexpected table: {table}")

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


class CustomerFleetRoutesTests(unittest.TestCase):
    def test_customers_are_workspace_filtered_searchable_and_paginated(self):
        db = FakeDatabase(customers=[{"id": "customer-1"}, {"id": "customer-2"}])

        status, payload = _customers_list(
            request(
                db,
                query={"business_id": BUSINESS_ID, "q": "Ada & Co", "limit": "1", "offset": "2"},
            )
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["customers"], [{"id": "customer-1"}])
        self.assertTrue(payload["has_more"])
        self.assertIn(f"business_id=eq.{BUSINESS_ID}", db.calls[0][2])
        self.assertIn("display_name.ilike.%2AAda%20%26%20Co%2A", db.calls[0][2])
        self.assertIn("limit=2&offset=2", db.calls[0][2])
        self.assertEqual(db.calls[0][3], "user-token")

    def test_customer_route_rejects_invalid_workspace_before_database_access(self):
        db = FakeDatabase()
        with self.assertRaises(ServiceError):
            _customers_list(request(db, query={"business_id": "other&select=*"}))
        self.assertEqual(db.calls, [])

    def test_vehicles_are_workspace_filtered_with_user_token(self):
        db = FakeDatabase(vehicles=[{"id": "vehicle-1"}])

        status, payload = _vehicles_list(request(db, query={"business_id": BUSINESS_ID}))

        self.assertEqual(status, 200)
        self.assertEqual(payload["vehicles"], [{"id": "vehicle-1"}])
        self.assertIn(f"business_id=eq.{BUSINESS_ID}", db.calls[0][2])
        self.assertEqual(db.calls[0][3], "user-token")

    def test_vehicle_create_only_sends_valid_workspace_owned_fields(self):
        vehicle = {"id": "vehicle-1", "label": "Van 04", "type": "van"}
        db = FakeDatabase(inserted=[vehicle])

        status, payload = _vehicle_create(
            request(
                db,
                body={
                    "business_id": BUSINESS_ID,
                    "label": "  Van 04 ",
                    "type": "van",
                    "registration": "  ABC 123 ",
                    "capacity_note": "",
                },
            )
        )

        self.assertEqual(status, 201)
        self.assertEqual(payload["vehicle"], vehicle)
        self.assertEqual(
            db.calls[0][2],
            {
                "business_id": BUSINESS_ID,
                "label": "Van 04",
                "type": "van",
                "registration": "ABC 123",
            },
        )
        self.assertEqual(db.calls[0][3], "user-token")

    def test_vehicle_create_rejects_invalid_values_and_unknown_fields(self):
        db = FakeDatabase()
        with self.assertRaises(ServiceError):
            _vehicle_create(request(db, body={"business_id": BUSINESS_ID, "label": "x"}))
        with self.assertRaises(ServiceError):
            _vehicle_create(
                request(
                    db,
                    body={
                        "business_id": BUSINESS_ID,
                        "label": "Van 04",
                        "type": "spaceship",
                    },
                )
            )
        with self.assertRaises(ServiceError):
            _vehicle_create(
                request(
                    db,
                    body={
                        "business_id": BUSINESS_ID,
                        "label": "Van 04",
                        "type": "van",
                        "is_active": False,
                    },
                )
            )
        self.assertEqual(db.calls, [])


if __name__ == "__main__":
    unittest.main()
