# Session 37 Summary — Phase 2 Validation Bugfix (2026-03-04)

Session 37 was a short continuation session focused on completing the Phase 2 Explorer Core validation. The primary accomplishment was fixing the JSON export bug in the Chronicler API and correcting documentation errors in the validation walkthrough.

The JSON export bug was a POST body vs query parameter routing issue: the `format` parameter was defined as a FastAPI query param but callers sent it in the POST JSON body. The `QueryRequest` Pydantic model lacked a `format` field, so the body value was silently ignored and exports always defaulted to CSV. The fix was clean — add `format` to the model, remove the redundant query param, and use `body.format` as the single source of truth. This is the canonical REST pattern for POST endpoints.

Three documentation corrections were also applied to the validation walkthrough: the R3 regression SQL query used `deity` as the JSONB key but the actual key in the structures table is `deity_hf_id` (4 temples have deity data); and art form URLs used `form_type=musical_form` but the actual DB values are `dance`, `musical`, `poetic` (without `_form` suffix).

With this fix, the Phase 2 validation stands at 50/50 items passing. The enhancement validation agent was interrupted and needs a re-run in the next session for formal verification before declaring Phase 2 COMPLETE and proceeding to Phase 3 (Narrative Engine).
