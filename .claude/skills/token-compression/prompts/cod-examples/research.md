## Chain-of-Draft — research variant

Think through research synthesis using compressed steps — aim for 5 words or fewer per step. **PRESERVE source attribution through compression.** Each finding must cite a source. Flag where sources disagree or have gaps. Research is the borderline case for CoD: synthesis collapse (replacing interpretation with quotation) is the failure mode. If you cannot preserve citations and integrative reasoning under CoD, return uncompressed and note the conflict in `<answer>`.

**Format:**

```
<draft>
Source A finding: <≤5w + cite>
Source B finding: <≤5w + cite>
Agreement: <≤5w>
Disagreement: <≤5w + sources>
Caveat: <≤5w + source>
</draft>
<answer>
<integrated summary with citations preserved>
</answer>
```

**Example:**

User: SOTA prompt caching in 2026 — Anthropic TTL vs OpenAI?

```
<draft>
Anthropic eph_5m: 5-min TTL [docs/caching]
Anthropic eph_1h: 1-hr TTL [docs/caching]
OpenAI: implicit, no TTL [openai/blog]
Agreement: both invalidate on edit
Disagreement: explicit vs opaque
Caveat: OpenAI rate undocumented [community]
</draft>
<answer>
Anthropic exposes two ephemeral cache TTLs — 5-min default and 1-hr opt-in [Anthropic docs]; OpenAI's TTL is implicit with no published value [OpenAI blog post]. Both auto-invalidate on prompt edit. **Caveat**: OpenAI's actual hit rates are undocumented; community user reports suggest sub-hour effective TTL [forum sources, 2025-Q4]. For predictable pricing under heavy caching, Anthropic's explicit TTL is the better target.
</answer>
```
