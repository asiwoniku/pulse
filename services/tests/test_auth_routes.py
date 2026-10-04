import unittest
import urllib.parse

from pulse_service.api import handle
from pulse_service.config import Config
from pulse_service.support import ServiceError


class OAuthRouteTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config(
            env={
                "SUPABASE_URL": "https://pulse-test.supabase.co",
                "SUPABASE_ANON_KEY": "public-anon-key",
            }
        )
        self.headers = {
            "HTTP_ORIGIN": "http://127.0.0.1:8000",
            "HTTP_HOST": "127.0.0.1:8000",
        }

    def test_google_maps_to_supabase_google_provider(self):
        status, payload = handle(
            self.cfg,
            "POST",
            "/api/auth/oauth/google",
            headers=self.headers,
        )

        self.assertEqual(status, 200)
        parsed = urllib.parse.urlsplit(payload["authorization_url"])
        self.assertEqual(parsed.netloc, "pulse-test.supabase.co")
        query = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(query["provider"], ["google"])
        self.assertEqual(query["redirect_to"], ["http://127.0.0.1:8000/"])
        self.assertEqual(query["apikey"], ["public-anon-key"])

    def test_microsoft_maps_to_supabase_azure_provider(self):
        _, payload = handle(
            self.cfg,
            "POST",
            "/api/auth/oauth/microsoft",
            headers=self.headers,
        )
        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(payload["authorization_url"]).query
        )
        self.assertEqual(query["provider"], ["azure"])
        self.assertEqual(query["scopes"], ["email"])

    def test_rejects_unapproved_origin_and_provider(self):
        with self.assertRaises(ServiceError):
            handle(
                self.cfg,
                "POST",
                "/api/auth/oauth/google",
                headers={
                    "HTTP_ORIGIN": "https://attacker.example",
                    "HTTP_HOST": "127.0.0.1:8000",
                },
            )
        with self.assertRaises(ServiceError):
            handle(
                self.cfg,
                "POST",
                "/api/auth/oauth/facebook",
                headers=self.headers,
            )

    def test_social_auth_requires_supabase_configuration(self):
        unconfigured = Config(env={})
        with self.assertRaises(ServiceError):
            handle(
                unconfigured,
                "POST",
                "/api/auth/oauth/google",
                headers=self.headers,
            )


if __name__ == "__main__":
    unittest.main()
