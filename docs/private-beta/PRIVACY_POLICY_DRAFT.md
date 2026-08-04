# BetterMTA private-beta privacy policy — draft

**Status:** Draft for owner/legal review; not published and not an active policy.
**Draft date:** 2026-08-04
**Scope:** Hosted private beta only. No accounts, profiles, payments, advertising, or
enabled feedback transport.

Before publication, the owner must set an effective date and private support contact,
confirm the operational-log retention setting, name any activated geocoder/error
tracking provider, and verify this text against the deployed configuration.

## What BetterMTA processes

BetterMTA processes the origin, destination, selected subway lines, and requested trip
time needed to calculate a route. An origin or destination may be a subway station,
browser-provided coordinate, address, or point of interest when the address/POI feature
is enabled.

The application also processes short-lived operational data such as a request ID,
response status, latency, data-freshness state, result counts, selected-line count,
coarsened proximity cell, and place-search text length. The application does not
intentionally write raw addresses, raw place-search text, stable place-query hashes, precise
coordinates, geocoder vendor IDs, encrypted geocode PlaceRefs, authentication headers,
or cookies to normal application logs.

Network providers necessarily process IP addresses to deliver requests. The BetterMTA
application uses a client address transiently for rate limiting but does not intentionally
write it to application logs. The hosting provider may process network metadata under its
own terms.

## How BetterMTA uses this data

- Calculate and rank subway routes, including preferred-line satisfaction.
- Resolve addresses or points of interest when that optional feature is enabled.
- Enforce rate limits and protect service availability.
- Diagnose failures, stale transit data, invalid route reports, and performance issues.
- Measure aggregate service health without building rider profiles.

BetterMTA does not sell personal information, serve behavioral advertising, or use trip
inputs to train a user-profile or recommendation model.

## Short-lived caches and PlaceRefs

Route responses are cached in process for about 30 seconds by default. Geocoder query
results are cached in process for about 60 seconds. Address/POI results use an encrypted,
authenticated `pl_geo_v1.*` reference that expires after about 15 minutes by default and
is resolvable only by compatible API replicas holding the deployment key. These caches
are operational and are not a durable trip-history or analytics store.

## Service providers

- **Hosting and network:** Fly.io is the accepted hosted-beta platform, once activated.
- **Transit data:** public MTA static and realtime feeds provide service information.
- **Address/POI search:** a configured Nominatim-compatible provider receives search
  text and optional proximity only when address/POI search is enabled. Attribution is
  shown with provider-backed results.
- **Error tracking:** optional and disabled unless the owner configures a provider after
  verifying its data-scrubbing and retention settings.

The final published policy must name the providers actually active in production and
link to their privacy terms.

## Retention

BetterMTA has no account or durable rider-history database in the private-beta scope.
The proposed launch limit for ordinary operational logs is **14 days**; security or
incident evidence may be retained for up to **30 days** when needed to investigate a
specific event. These are launch requirements, not claims about an unactivated backend.
`READY_FOR_PRIVATE_BETA` requires evidence that the deployed log store enforces the
approved limits.

Aggregate counters may be retained longer when they contain no raw trip input, precise
coordinate, IP address, encrypted PlaceRef, or rider identifier.

## Rider choices and requests

Riders may use station search without enabling browser location. Address/POI search can
be disabled operationally while station routing remains available. Because the beta has
no accounts or durable trip history, BetterMTA generally has no profile to access or
delete. A rider may contact the private support channel to ask whether incident material
associated with a request ID is still retained and request deletion where practicable.

Do not send full home/work addresses, precise coordinates, screenshots containing them,
access tokens, or other sensitive data in a support report.

## Security and changes

A hosted private-beta launch must use HTTPS at the edge, secret-managed deployment keys,
bounded input validation, rate limiting, privacy-safe logging, and an explicit rollback
path. No system is perfectly secure. A privacy or security incident stops cohort
expansion and follows the private-beta incident workflow.

Material policy changes must be dated and communicated to the private-beta cohort before
they take effect. The owner-approved support contact will be inserted here before
publication.
