# XQ integration brief

5.36 uses pinned jssdk-core 2.0.6 behind the infrastructure provider port. XQ escrows and releases K1 only; Opintel releases K2 and records the authoritative redemption. Live XQ conformance remains unverified until credentials arrive.

CheckApiKey is required. The optional dashboard check uses read-only GetCurrentBusiness with the dashboard access token. Safe authentication/failure results are separate; dashboard failure does not disable custody. Provider response bodies never leave the adapter or reach logs.

## Event contract to verify against a real tenant

Identify the FetchKey event fields that authoritatively bind locator, alias, time and origin. Verify timestamp units/zone, pagination, duplicates, ordering and event delay. The SDK leaves event rows untyped; no field mapping is assumed.

Until verified, XQ `redemptions()` returns `{status: 'unsupported'}`. Settings states “Corroboration: not available for XQ until verified”. First-hand K2 receipt events remain the source of truth. Fill the typed `ProviderRedemption`/`ProviderRedemptions` mapping once verified; local corroboration already exercises the receipt path.
