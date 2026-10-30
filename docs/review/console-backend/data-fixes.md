# Data completion review

All four review fixes are applied in `src/console-next`:

- Estimates retain ASCII `~7`/`~0` and literal `unknown`, using the shared regular
  text font and normal baseline in list rows, the Sources tab, band legends and
  ring numbers. No stored value or backend behavior changes.
- Source/pool pickers and Home's project menu no longer contain theme controls.
  The same shared account menu on the rail avatar switches theme on all screens;
  it remains reachable in phone navigation.
- At phone widths the band is a compact 2x2 of four rings, each showing only its
  number and label. Legends, headings, extra counts and footer lines are hidden.
  All ring segment/center filters remain active. Wider layouts retain legends.
- Sources Tables/Rows numbers align right under their headers. The status badge
  has intrinsic width and no longer fills its grid column.

Targeted verification: unchanged lint, strict typecheck and 48 console tests, plus
real-API browser assertions covering regular estimate fonts, numeric alignment,
compact band geometry, phone filtering and account theme switching. The browser
fixture uses PostgreSQL, SpiceDB and actual route projections/treatment writes;
no rendered responses are mocked. Full gate outcome is reported with delivery;
it runs once after the completed candidate commit, and any failure stops work.

| View | Capture |
| --- | --- |
| Entitlements, 390 light | [PNG](data-fixes-screenshots/data-entitlements-390-light.png) |
| Sources with picker open, 1440 light | [PNG](data-fixes-screenshots/data-sources-1440-light.png) |

[Browser evidence](data-fixes-screenshots/capture.json). This supersedes the
original review's theme-picker and phone legend differences. Other documented
real-data/backend constraints remain unchanged.
