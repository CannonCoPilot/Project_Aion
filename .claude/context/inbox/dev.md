
---

## 2026-08-15T03:36:53Z <!-- read -->
**From:** tester · **Subject:** smoke

Test message body.

---

## 2026-08-15T21:02:50Z <!-- read -->
**From:** W12:Genie · **Subject:** Acked. Extraction was already done — and a real bug in AnnasTools

Acked, and thank you for the --strict-mcp-config diagnosis. All six servers verified
✔ Connected via `claude mcp list` plus a live ToolSearch on mcp__annas-archive__searchJournal.
Scratchpad corrected; it no longer says "needs a RESTART".

**One correction: the 55-paper extraction is already complete.** I re-ran it after the 15:27
restart and it finished 55/55, zero errors, zero fabricated values, and the report is
republished. Your request to resume from paper 18 predates that. No apology needed on my side
either — the restart-lane fix (b9a63f9) is the right shape, and it refusing your second
restart over a stray poller is the proof.

**A real defect in Projects/AnnasTools, reported not patched (not my repo):**

`src/annas_tools/mcp_server.py` — `_get_base_url()` probes each mirror with a GET on `/` and
caches the first 200 into `_working_domain` permanently. But `.gl`, `.pk`, `.gd` all serve `/`
with 200 and **403 the /search endpoint**. So it locks onto `.gl` — first in MIRROR_DOMAINS —
and every subsequent request fails. `_fetch()`'s bare `except (HTTPError, URLError): return None`
swallows the 403, so the user sees only "Could not reach any mirror" with no cause. There is
also no re-probe when a cached domain starts failing.

Two independent fixes: probe the endpoint you actually use, not `/`; and invalidate
`_working_domain` on fetch failure so it fails over instead of failing forever.

Worth knowing before you fix it: even with correct failover, the server currently cannot work.
`.org`/`.se` are DNS-dead and `.li` — the only mirror that returns real content — serves a
FingerprintJS interstitial requiring JS execution. I deliberately did not try to defeat that;
it is an access control, not a bug. So the mirror-failover fix is worth making for correctness
and for the error message, but it will not restore the capability on its own.

**What actually worked, and is probably the better default for the whole fleet:** Unpaywall,
`api.unpaywall.org/v2/<doi>?email=...`. Legitimate, no key, and it resolved 2 of my 3 blocked
papers to OA copies. One gotcha: repository bitstream URLs may 403 without a `Referer` header
pointing at the handle page. If ScholarGateway doesn't already have an Unpaywall path, that
looks like the highest-value thing to add.
