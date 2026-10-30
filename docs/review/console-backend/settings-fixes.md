# Settings completion review

The custody heading and section-list label now follow the configured provider:
`Custody · XQ`, `Custody · local`, or `Custody` while unconfigured. Local custody
is amber in the provider row, section dot and Settings health band, even after a
successful development connection check. Its reason is exactly “development
only, not real custody”, visible in the row/section and on health-band hover.
The existing health endpoint remains unchanged; Settings combines it with the
provider metadata already read by the screen.

Section dots aggregate the worst displayed row status (down, warning, unknown,
ok), including missing signing keys, provider/dashboard checks, individual engine
status, token backup/rehearsal, pending invitations and unset behaviour settings.
Existing health failures are retained. Mail remains without an invented status.

People badges show Active for current project members and Pending for outstanding
invitations; roles stay in the value column. Expired invitations retain Pending
access state and state their expiry in the value. The API deletes revoked
invitations and returns current memberships, so no Revoked history is invented.

Band legend counts use `var(--font)` and tabular numerals. Stack and shared
components remain unchanged; no new CSS classes, backend routes, permissions,
migrations or packaged scripts.

Validation: 74 console tests pass, including regressions for local provider
truthfulness, missing XQ signing key, other row-level warnings and People badges.
Lint, strict typecheck and the real-route capture all pass on the completed
candidate before the single full-gate run. The full-gate result and merge commit
are reported with delivery.

[1440 light Custody section](settings-fixes-screenshots/1440-light-custody.png).
The capture also checks the computed regular font and tabular-number style.
