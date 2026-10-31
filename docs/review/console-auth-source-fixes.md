# Auth and source panel console fixes

This round changes console presentation only. No backend behavior, environment settings or governance checks changed.

- Held filings keep the existing identifier-only operator packet on the clipboard. Copy displays only **Copied · nothing sent**, removed after three seconds. The consequence paragraph, copied sentence, packet textarea and prose below the filing list are removed.
- Comparable cells show a chip only for a declared group containing this column and at least one other member. Isolated columns remain editable through **column actions → Comparable with…**. The subtitle reads **same value, same token, so agents can join**. Exact project-name confirmation and server refusals remain unchanged.
- Authentication screens use the filled three-bar brand artwork; ordinary icons retain their existing regular weight.
- Filing, party, table, column, row, decision, group and scan-progress counts use singular forms for one.

Targeted validation: strict typecheck, lint, console tests (115 passing tests in 11 files), and syntax check of the updated manual browser verification helper.

The screenshots use the updated console with real APIs from the retained packaged acceptance installation, synthetic fixture records and self-hosted Inter. This fix round does not claim a new archive installation.

| Approved image | Side-by-side screenshot | Remaining differences |
| --- | --- | --- |
| 22 | [Check email](console-auth-source-panel/fixes/22-check-email-comparison.png) | Synthetic owner email; existing shared heading scale and regular-weight functional icons. Filled brand mark is now present. |
| 27 | [Held filing after Copy](console-auth-source-panel/fixes/27-source-filings-after-copy-comparison.png) | Real fixture has one held filing and one party; absent landed-table statistics and other sample filings are hidden. Copy confirmation is transient. |
| 28 | [Comparable columns](console-auth-source-panel/fixes/28-declarations-comparison.png) | Actual table, source, pool, declarations and counts replace sample data; shared checkbox and focus tokens remain. Isolated cells are empty. |

The new full gate is run once on the completed committed tip. Its result and conditional merge are reported in the task response; the prior round's gate record is retained separately.
