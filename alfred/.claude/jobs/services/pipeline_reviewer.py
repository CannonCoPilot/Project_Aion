#!/usr/bin/env python3
"""
pipeline_reviewer.py — Phase 1.1 Pipeline-Reviewer Service Stub (design §6.6)

Architectural shift: replaces the cron-scheduled `pipeline-review` job with an
event-driven service that subscribes to Pulse events and invokes the
pipeline-reviewer Tier A persona on demand.

Phase 1.1 scope (stub):
  • Event subscription scaffold (poll-based for Phase 1.1; WebSocket for Phase 2)
  • Persona spec loading from filesystem
  • Claude Code headless invocation OR ollama fallback
  • decision_events emission with actor='persona:pipeline-reviewer'

Phase 2 follow-on:
  • Switch scheduled job in registry.yaml from cron → disabled (this service supersedes it)
  • Subscribe to /api/v1/socket events instead of polling
  • Richer event taxonomy (pipeline.health.degraded, pipeline.health.recovered,
    persona.misroute, etc.)
  • Telegram + dashboard alerts on critical findings
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from _shared import call_ollama, pulse_get, pulse_post  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [pipeline-reviewer] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("pipeline-reviewer")

PERSONAS_DIR = Path(os.environ.get("PERSONAS_DIR", "/Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/personas"))
PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")

# Phase 1.1 polling interval (Phase 2 → WebSocket subscription)
POLL_INTERVAL_SECONDS = int(os.environ.get("PIPELINE_REVIEWER_POLL_SECONDS", "300"))  # 5 min

# Event types this service subscribes to
SUBSCRIBED_EVENT_TYPES = {
    "pipeline.health.degraded",
    "pipeline.health.recovered",
    "persona.misroute",
}


def load_persona_spec(persona_name: str = "pipeline-reviewer") -> Dict[str, Any]:
    """Load persona prompt + config from filesystem."""
    pdir = PERSONAS_DIR / persona_name
    if not pdir.exists():
        raise FileNotFoundError(f"persona dir not found: {pdir}")
    prompt = (pdir / "prompt.md").read_text() if (pdir / "prompt.md").exists() else ""
    config_text = (pdir / "config.yaml").read_text() if (pdir / "config.yaml").exists() else ""
    methodology_text = (pdir / "methodology.yaml").read_text() if (pdir / "methodology.yaml").exists() else ""
    return {
        "persona": persona_name,
        "prompt": prompt,
        "config_text": config_text,
        "methodology_text": methodology_text,
    }


def fetch_pending_events() -> List[Dict[str, Any]]:
    """Phase 1.1 poll: fetch recent audit_log events of subscribed types."""
    events_payload = pulse_get("/audit/events?limit=200") or {}
    events = events_payload.get("events", [])
    pending = []
    for ev in events:
        ev_type = ev.get("event_type", "")
        if ev_type in SUBSCRIBED_EVENT_TYPES:
            pending.append(ev)
    return pending


def invoke_persona(spec: Dict[str, Any], event: Dict[str, Any]) -> Optional[str]:
    """Invoke the persona with the event payload as context.

    Two backends supported:
      1. Claude Code headless via `claude` CLI (preferred when available)
      2. Ollama qwen3:32b fallback via _shared.call_ollama

    Phase 1.1: ollama fallback only. Phase 2 will detect `claude` CLI and prefer it.
    """
    context_block = json.dumps({
        "event_id": event.get("id"),
        "event_type": event.get("event_type"),
        "ts": event.get("ts"),
        "payload": event.get("payload"),
    }, indent=2)
    composed = f"""{spec['prompt']}

---
CONTEXT EVENT (you are responding to this):
{context_block}
---

Provide your analysis and recommendation as plain text. No markdown headers."""
    response = call_ollama(composed, model="qwen3:32b")
    return response


def emit_decision(event: Dict[str, Any], persona: str, output: str, outcome: str = "review_complete") -> None:
    """Emit a decision_event row capturing the persona's analysis."""
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "thread_id": f"pipeline-reviewer-{event.get('id', 'unknown')}",
        "actor": f"persona:{persona}",
        "decision_type": "pipeline_review",
        "outcome": outcome,
        "alternatives": None,
        "signals_matched": {"event_id": event.get("id"), "event_type": event.get("event_type")},
        "confidence": 0.5,  # Phase 1.1 default; Phase 2 will derive from response analysis
        "rationale": (output or "")[:2000],
        "downstream_effect": None,
    }
    pulse_post("/audit/decisions", payload)


def process_event(event: Dict[str, Any], spec: Dict[str, Any]) -> None:
    log.info("processing event id=%s type=%s", event.get("id"), event.get("event_type"))
    output = invoke_persona(spec, event)
    if output is None:
        log.warning("persona invocation returned None for event %s", event.get("id"))
        emit_decision(event, spec["persona"], "(no response from llm backend)", outcome="invocation_failed")
        return
    emit_decision(event, spec["persona"], output, outcome="review_complete")


def main_loop(spec: Dict[str, Any]) -> None:
    log.info("pipeline-reviewer service stub starting; poll every %ds", POLL_INTERVAL_SECONDS)
    log.info("subscribed to event types: %s", SUBSCRIBED_EVENT_TYPES)
    seen_event_ids: set = set()
    while True:
        try:
            events = fetch_pending_events()
            new_events = [ev for ev in events if ev.get("id") not in seen_event_ids]
            if new_events:
                log.info("found %d new events", len(new_events))
            for ev in new_events:
                process_event(ev, spec)
                seen_event_ids.add(ev.get("id"))
        except Exception as exc:  # noqa: BLE001 — service must survive single-tick failures
            log.error("poll failed: %s", exc)
        time.sleep(POLL_INTERVAL_SECONDS)


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 1.1 Pipeline-Reviewer Service Stub")
    parser.add_argument("--once", action="store_true", help="process pending events once and exit")
    parser.add_argument("--daemon", action="store_true", help="run continuous poll loop")
    parser.add_argument("--persona", default="pipeline-reviewer")
    args = parser.parse_args()
    spec = load_persona_spec(args.persona)
    log.info("loaded persona '%s' (prompt %d chars)", args.persona, len(spec["prompt"]))
    if args.once:
        events = fetch_pending_events()
        log.info("found %d pending events", len(events))
        for ev in events:
            process_event(ev, spec)
        return 0
    if args.daemon:
        main_loop(spec)
        return 0
    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
