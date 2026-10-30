# Activity completion review

All requested corrections are in the parallel console:

- The refusal map is exhaustive for the 23 canonical EvidenceFinish ErrorCode
  values, plus the legacy memory_exhausted code already handled by the receipt
  reader. Every value has one plain sentence. New unknown codes retain the
  recorded safe message; missing messages say Reason not captured. Codes are
  secondary text. Withheld/undecided column names and join candidate names are
  shown only when recorded for that context, alongside recorded table chips.
  No column is guessed from SQL or the current catalogue.
- Outcome selection is through the band and active-filter chip. The outcome
  dropdown is removed. Today clears a selected time bucket and retains the
  other filters.
- Ready receipts have no subtitle. Dialog title accessibility remains; long
  refusal reasons can scroll inside their fixed-height row.
- Custody has one chip, e.g. 1 release · granted. The number retains the earlier
  scope's count of recorded release events; it is not a count of decrypted values
  or unique grants. The suffix is the latest recorded granted/revoked/expired
  lifecycle event in API order. Share-release/provider corroboration events are
  not relabelled as grant/revoke/expiry. If no such lifecycle fact exists, the
  unavailable suffix is omitted. The chip's hover explains the count and state.
- Phone request cards are 88 px tall with exactly two lines: outcome/pool/table/
  rows, then agent/marks/time. Full chip names remain available on hover and
  treatment marks scroll when needed.
- Picker context is Activity · today; the Right now footer is names are
  self-declared. Shared component defaults on other screens are unchanged.

Verification: console tests, unchanged lint, strict typecheck and real-API browser
captures. The capture asserts the reason sentence and recorded column, secondary
code, removed selector/subtitle, Today/picker labels, exact phone height/two-line
layout, visible focus and live completion refresh. No new backend endpoint,
permission, migration or evidence mutation. The full gate runs once after the
candidate commit; its outcome and merge commit are reported with delivery.

| View | Screenshot |
| --- | --- |
| Refused receipt, 1440 light | [PNG](activity-fixes-screenshots/activity-refused-1440-light.png) |
| List, 390 light | [PNG](activity-fixes-screenshots/activity-list-390-light.png) |

[Browser evidence](activity-fixes-screenshots/capture.json). This review supersedes
the original Activity capture's controls, reason presentation and phone geometry.
