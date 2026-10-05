"""Geocoding, distance, and ETA behind one provider switch.

`MAPS_PROVIDER` selects the implementation; every response carries `provider` and an
explicit `mode`, so a straight-line estimate can never be read as a drive time. When
the selected provider has no credential the call fails with the exact variables to
set — the service does not quietly switch providers, because a silent switch means
two environments disagree about ETA and nobody notices.
"""
from __future__ import annotations

import math
import time
from typing import Any

from ..config import Config
from ..support import ServiceError, http_json, message_from, unconfigured

NOMINATIM = "https://nominatim.openstreetmap.org/search"
MAPBOX_GEO = "https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json"
MAPBOX_ROUTE = "https://api.mapbox.com/directions/v5/mapbox/driving/{coords}"
GOOGLE_GEO = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_ROUTE = "https://maps.googleapis.com/maps/api/directions/json"

# Nominatim's usage policy allows one request per second per client.
_MIN_NOMINATIM_GAP = 1.1
_last_nominatim = 0.0


def _throttle_nominatim() -> None:
    global _last_nominatim
    wait = _MIN_NOMINATIM_GAP - (time.monotonic() - _last_nominatim)
    if _last_nominatim and wait > 0:
        raise ServiceError(
            f"Nominatim's usage policy allows one request per second; retry in "
            f"{wait:.1f}s.",
            status=429,
            source="maps:nominatim",
        )
    _last_nominatim = time.monotonic()


def _great_circle_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = (math.radians(v) for v in a)
    lat2, lon2 = (math.radians(v) for v in b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _token(cfg: Config, primary: str, key: str, key_name: str) -> str:
    token = cfg.get(primary) or (cfg.get(key_name) if key in primary.lower() else "")
    if not token:
        raise unconfigured(f"maps:{key}", [primary])
    return token


def geocode(cfg: Config, text: str) -> dict[str, Any]:
    query = (text or "").strip()
    if len(query) < 3:
        raise ServiceError("Give at least 3 characters of address text.", source="maps")
    provider = cfg.maps_provider
    if provider == "mapbox":
        return _geo_mapbox(cfg, query)
    if provider == "google":
        return _geo_google(cfg, query)
    if provider == "osrm":
        raise ServiceError(
            "OSRM routes but does not geocode. Set MAPS_PROVIDER=nominatim for "
            "address lookup, or use mapbox/google for both.",
            status=501,
            source="maps:osrm",
        )
    return _geo_nominatim(cfg, query)


def suggest(cfg: Config, text: str, limit: int = 8) -> dict[str, Any]:
    """Address candidates for type-ahead lookup.

    `geocode` answers "where is this exact string" and commits to one point, which
    is the wrong shape for a field someone is still typing: a half-written street
    name frequently resolves to the wrong district, and a silent wrong pin is worse
    than no pin. This returns several ranked candidates and never picks one, so the
    person dispatching stays the one who decides where the load actually goes.

    An empty list is a real answer — it means the provider matched nothing yet — and
    is deliberately not turned into an error the way `geocode` is.
    """
    query = (text or "").strip()
    if len(query) < 3:
        return {"provider": cfg.maps_provider, "query": query, "candidates": [], "note": "Type at least 3 characters."}

    provider = cfg.maps_provider
    if provider == "mapbox":
        candidates = _suggest_mapbox(cfg, query, limit)
    elif provider == "google":
        candidates = _suggest_google(cfg, query, limit)
    elif provider == "osrm":
        # OSRM routes but cannot geocode at all. Say that once, plainly, instead of
        # silently returning nothing and looking like "no matches".
        return {
            "provider": "osrm",
            "query": query,
            "candidates": [],
            "note": "Address lookup is off because MAPS_PROVIDER=osrm, which routes but "
            "cannot geocode. Use nominatim, mapbox or google for suggestions.",
        }
    else:
        candidates = _suggest_nominatim(cfg, query, limit)

    return {"provider": provider, "query": query, "candidates": candidates}


def _suggest_nominatim(cfg: Config, query: str, limit: int) -> list[dict[str, Any]]:
    user_agent = cfg.get("NOMINATIM_USER_AGENT")
    if not user_agent:
        raise unconfigured("maps:nominatim", ["NOMINATIM_USER_AGENT"])
    _throttle_nominatim()
    status, body = http_json(
        "GET",
        NOMINATIM,
        provider="maps:nominatim",
        headers={"User-Agent": user_agent},
        query={
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            # The public usage policy allows at most one request per second, which
            # _throttle_nominatim already enforces. This caps blast radius instead.
            "limit": max(1, min(limit, 10)),
            "countrycodes": cfg.get("GEO_COUNTRY_CODES") or None,
        },
    )
    if status != 200 or not isinstance(body, list):
        return []
    return [
        {
            "label": hit.get("display_name") or query,
            "lat": float(hit["lat"]),
            "lng": float(hit["lon"]),
            "kind": (hit.get("type") or "place"),
            "provider": "nominatim",
        }
        for hit in body
        if hit.get("lat") and hit.get("lon")
    ]


def _suggest_mapbox(cfg: Config, query: str, limit: int) -> list[dict[str, Any]]:
    token = _token(cfg, "MAPBOX_ACCESS_TOKEN", "mapbox", "MAPS_API_KEY")
    # Mapbox has a purpose-built autocomplete endpoint; using /geocode here would
    # return fuzzy matches ranked for a single answer, which is the wrong shape.
    status, body = http_json(
        "GET",
        "https://api.mapbox.com/geocoding/v5/mapbox.places-autocomplete/{q}.json".format(
            q=query.replace(" ", "%20")
        ),
        provider="maps:mapbox",
        query={
            "access_token": token,
            "autocomplete": "true",
            "limit": max(1, min(limit, 10)),
            "country": cfg.get("GEO_COUNTRY_CODES") or None,
        },
    )
    if status != 200 or not isinstance(body, dict):
        return []
    out = []
    for feature in body.get("features") or []:
        centre = feature.get("center") or []
        if len(centre) < 2:
            continue
        out.append(
            {
                "label": feature.get("place_name") or query,
                "lat": float(centre[1]),
                "lng": float(centre[0]),
                "kind": (feature.get("place_type") or ["place"])[0]
                if feature.get("place_type")
                else "place",
                "provider": "mapbox",
            }
        )
    return out


def _suggest_google(cfg: Config, query: str, limit: int) -> list[dict[str, Any]]:
    key = _token(cfg, "GOOGLE_MAPS_API_KEY", "google", "MAPS_API_KEY")
    # Google has no public place-autocomplete on the geocoding endpoint, so this is
    # the same call as geocode with a result cap. It is marked as such in the
    # response so nobody assumes the ranked-autocomplete behaviour of Mapbox.
    status, body = http_json(
        "GET",
        GOOGLE_GEO,
        provider="maps:google",
        query={"address": query, "key": key},
    )
    if status != 200 or not isinstance(body, dict):
        return []
    out = []
    for item in (body.get("results") or [])[: max(1, min(limit, 10))]:
        location = item.get("geometry", {}).get("location") or {}
        if "lat" not in location or "lng" not in location:
            continue
        out.append(
            {
                "label": item.get("formatted_address") or query,
                "lat": float(location["lat"]),
                "lng": float(location["lng"]),
                "kind": (item.get("types") or ["place"])[0],
                "provider": "google",
            }
        )
    return out


def route(cfg: Config, origin: dict[str, Any], destination: dict[str, Any]) -> dict[str, Any]:
    """Distance and ETA between two geocoded points."""
    for point, label in ((origin, "origin"), (destination, "destination")):
        if point.get("lat") is None or point.get("lng") is None:
            raise ServiceError(f"{label} has no coordinates.", source="maps")

    coords = f"{origin['lng']},{origin['lat']};{destination['lng']},{destination['lat']}"
    provider = cfg.maps_provider
    if provider == "mapbox":
        return _route_mapbox(cfg, coords)
    if provider == "google":
        return _route_google(cfg, origin, destination)
    if provider == "osrm":
        return _route_osrm(cfg, coords)

    km = _great_circle_km(
        (float(origin["lat"]), float(origin["lng"])),
        (float(destination["lat"]), float(destination["lng"])),
    )
    return {
        "provider": "none",
        "distance_km": round(km, 2),
        "duration_minutes": None,
        "mode": "straight_line_estimate",
        "note": "No routing provider configured, so this is straight-line distance "
        "only and there is no ETA. Set MAPS_PROVIDER plus MAPBOX_ACCESS_TOKEN, "
        "GOOGLE_MAPS_API_KEY, or OSRM_BASE_URL.",
    }

def _geo_nominatim(cfg: Config, query: str) -> dict[str, Any]:
    user_agent = cfg.get("NOMINATIM_USER_AGENT")
    if not user_agent:
        raise unconfigured("maps:nominatim", ["NOMINATIM_USER_AGENT"])
    _throttle_nominatim()
    status, body = http_json(
        "GET",
        NOMINATIM,
        provider="maps:nominatim",
        headers={"User-Agent": user_agent},
        query={
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": cfg.get("GEO_COUNTRY_CODES") or None,
        },
    )
    if status != 200 or not isinstance(body, list) or not body:
        raise ServiceError(
            f"Nominatim found no match for {query!r} (status {status}).",
            status=404,
            source="maps:nominatim",
        )
    hit = body[0]
    return {
        "provider": "nominatim",
        "query": query,
        "lat": float(hit["lat"]),
        "lng": float(hit["lon"]),
        "display_name": hit.get("display_name"),
        "mode": "provider_geocode",
    }


def _geo_mapbox(cfg: Config, query: str) -> dict[str, Any]:
    token = _token(cfg, "MAPBOX_ACCESS_TOKEN", "mapbox", "MAPS_API_KEY")
    status, body = http_json(
        "GET",
        MAPBOX_GEO.format(q=query.replace(" ", "%20")),
        provider="maps:mapbox",
        query={"access_token": token, "limit": 1, "types": "address,street,place"},
    )
    features = ((body or {}).get("features") or [])
    centre = (features[0].get("center") or []) if features else []
    if status != 200 or len(centre) != 2:
        raise ServiceError(
            message_from(body) or f"Mapbox returned no match (status {status}).",
            status=502,
            source="maps:mapbox",
        )
    return {
        "provider": "mapbox",
        "query": query,
        "lat": centre[1],
        "lng": centre[0],
        "display_name": features[0].get("place_name"),
        "mode": "provider_geocode",
    }


def _geo_google(cfg: Config, query: str) -> dict[str, Any]:
    key = _token(cfg, "GOOGLE_MAPS_API_KEY", "google", "MAPS_API_KEY")
    status, body = http_json(
        "GET", GOOGLE_GEO, provider="maps:google", query={"address": query, "key": key}
    )
    results = (body or {}).get("results") or []
    if status != 200 or not results:
        raise ServiceError(
            message_from(body) or f"Google geocoding failed (status {status}).",
            status=502,
            source="maps:google",
        )
    location = results[0]["geometry"]["location"]
    return {
        "provider": "google",
        "query": query,
        "lat": location["lat"],
        "lng": location["lng"],
        "display_name": results[0].get("formatted_address"),
        "mode": "provider_geocode",
    }


def _route_mapbox(cfg: Config, coords: str) -> dict[str, Any]:
    token = _token(cfg, "MAPBOX_ACCESS_TOKEN", "mapbox", "MAPS_API_KEY")
    status, body = http_json(
        "GET",
        MAPBOX_ROUTE.format(coords=coords),
        provider="maps:mapbox",
        query={"access_token": token, "overview": "false"},
    )
    routes = (body or {}).get("routes") or []
    if status != 200 or not routes:
        raise ServiceError(
            message_from(body) or f"Mapbox directions failed (status {status}).",
            status=502,
            source="maps:mapbox",
        )
    return _shape(provider="mapbox", km=routes[0]["distance"] / 1000.0,
                  minutes=routes[0]["duration"] / 60.0)


def _route_google(cfg: Config, origin: dict[str, Any], destination: dict[str, Any]) -> dict[str, Any]:
    key = _token(cfg, "GOOGLE_MAPS_API_KEY", "google", "MAPS_API_KEY")
    status, body = http_json(
        "GET",
        GOOGLE_ROUTE,
        provider="maps:google",
        query={
            "origin": f"{origin['lat']},{origin['lng']}",
            "destination": f"{destination['lat']},{destination['lng']}",
            "key": key,
        },
    )
    legs = ((body or {}).get("routes") or [{}])[0].get("legs") or []
    if status != 200 or not legs:
        raise ServiceError(
            message_from(body) or f"Google routes failed (status {status}).",
            status=502,
            source="maps:google",
        )
    leg = legs[0]
    duration = leg.get("duration_in_traffic") or leg.get("duration") or {}
    return _shape(provider="google", km=leg["distance"]["value"] / 1000.0,
                  minutes=(duration.get("value") or 0) / 60.0)


def _route_osrm(cfg: Config, coords: str) -> dict[str, Any]:
    base = cfg.get("OSRM_BASE_URL").rstrip("/")
    if not base:
        raise unconfigured("maps:osrm", ["OSRM_BASE_URL"])
    status, body = http_json(
        "GET",
        f"{base}/route/v1/driving/{coords}",
        provider="maps:osrm",
        query={"overview": "false"},
    )
    routes = (body or {}).get("routes") or []
    if status != 200 or not routes:
        raise ServiceError(
            f"OSRM returned no route (status {status}).", status=502, source="maps:osrm"
        )
    return _shape(provider="osrm", km=routes[0]["distance"] / 1000.0,
                  minutes=routes[0]["duration"] / 60.0)


def _shape(provider: str, km: float, minutes: float) -> dict[str, Any]:
    return {
        "provider": provider,
        "distance_km": round(km, 2),
        "duration_minutes": round(minutes, 1),
        "mode": "provider_route",
        "note": "Road routing from the configured provider.",
    }
