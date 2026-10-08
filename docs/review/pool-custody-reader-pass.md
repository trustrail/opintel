# Pool detail and Token key reader pass

Pool detail retains one Pool keys card and the Agents section. Expired-key
impact is inside the keys card, identified by prefix rather than a UUID
paragraph. Full key-version IDs remain available in prefix tooltips. Connected
and previously seen disconnected agents stay distinct; a zero connected count
has one inline explanation, without an empty list or repeated count heading.
The rotation/revocation dialogs retain their existing impact and confirmation.

Token key leads with one shared FindingCard: affected-version count, a concise
reason and consequence per version, and Rehearse now. Current-key failures lead
and state that new source connections are refused. Retained-key failures retain
their historical-token consequence. The general custody caution is one line,
not a warning card. No duplicate rehearsal button remains while the finding is
present; after successful verification the action returns to Current version.
Rotate and restore behavior, permission checks and exact confirmation remain.

No stylesheet additions or classes were needed. Pools list and Access are
unchanged. Existing vstats number typography is reused inside the shared card.

Validation: 16 affected functional cases pass, including ready/loading/error/
empty states, 390/900/1440 layouts, zero and nonzero impact, copy-once keys,
rotation/revocation, restore authorization and rehearsal failure/success. Axe
and unchanged control/mark-placement conformance pass (partial route coverage:
5/53). Typecheck and lint pass. No visual project or baseline regeneration.
