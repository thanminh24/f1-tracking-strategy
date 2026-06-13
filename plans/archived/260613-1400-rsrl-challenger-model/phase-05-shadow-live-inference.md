# Phase 05: Shadow Live Inference

## Context Links

- Parent plan: [plan.md](plan.md)
- Depends on: Phase 04
- Current serving: `backend/src/f1_strategy/strategy/prediction_service.py`
- Current UI stats: `frontend/components/stats/rl-model-summary.tsx`

## Overview

Date: 2026-06-13  
Priority: P2  
Implementation status: complete for plumbing  
Review status: verified by lint/tests

Serve RSRL in shadow mode alongside current PPO/MC. Do not switch user-facing recommendation until promotion decision.

## Key Insights

- Live serving must never block websocket race state updates.
- RSRL can be exposed as "challenger" model in stats before becoming primary.
- Current `PredictionSet.meta.model_versions` can carry model identities.

## Requirements

- Add `RsrLPolicy` inference wrapper.
- Add optional challenger output fields without breaking frontend.
- Keep current PPO action as default primary.
- Record disagreement between PPO and RSRL.
- Measure inference latency continuously.
- If RSRL checkpoint missing, degrade silently.

## Architecture

`PredictionService -> PPO primary + RSRL challenger + MC outcomes -> PredictionSet v2`

Frontend:

`Model Outlook -> primary action + challenger action + disagreement badge + latency`

## Related Code Files

- Create: `backend/src/f1_strategy/strategy/rsrl_agent/policy.py`
- Modify: `backend/src/f1_strategy/strategy/prediction_schema.py`
- Modify: `backend/src/f1_strategy/strategy/prediction_service.py`
- Modify: `frontend/lib/prediction-types.ts`
- Modify: `frontend/components/stats/rl-model-summary.tsx`
- Test: backend prediction schema compatibility and frontend compile.

## Implementation Steps

1. Add RSRL inference wrapper:
   - load `.pt`
   - maintain per-car sequence state
   - produce Q-values/action probabilities
2. Extend schema carefully:
   - `model_recommendations?: Record<string, ModelRecommendation>`
   - preserve existing `recommended_action` for backward compatibility
3. Add env var:
   - `F1_RSRL_SHADOW=1`
4. Add latency tracking:
   - p50/p95 in logs and metadata
5. Add frontend model comparison panel:
   - PPO primary
   - RSRL challenger
   - agreement/disagreement
   - action probability bars
6. Add tests:
   - missing RSRL checkpoint does not break predictions
   - schema remains backward compatible

## Todo List

- [x] Add RSRL policy wrapper.
- [x] Extend prediction schema.
- [x] Add shadow-mode feature flag.
- [x] Add frontend comparison display.
- [x] Add missing-checkpoint degradation tests.

## Success Criteria

- Live/archive websocket stream continues if RSRL fails.
- User can see challenger predictions in stats.
- P95 RSRL inference <= 50ms full field.
- No frontend compile/type regressions.

## Risk Assessment

- Recurrent live sequence state can desync across reconnects. Mitigation: reset sequence on session switch and warm up from available history where possible.
- Schema changes can break UI. Mitigation: optional fields only.

## Security Considerations

- No user data. Avoid logging raw environment variables.

## Next Steps

- Add explainability and promotion decision in Phase 06.

Unresolved questions:
- Current implementation starts from live/shadow sequence state; archive-history warmup remains a follow-up.
