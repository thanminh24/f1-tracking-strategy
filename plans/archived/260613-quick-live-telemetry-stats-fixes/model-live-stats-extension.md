# Model Live Stats Extension

Status: complete

Scope:
- Make live sessions resolve model artifacts from current/recent live schedule when archive metadata is absent.
- Surface full prediction payload in stats: RL action distribution, pit window, next compound, outcome, safety-car, model versions.
- Add focused tests for live resolver and prediction display helpers.

Validation:
- Targeted backend pytest and ruff for prediction service and schedule helper.
- Targeted frontend lint, production compile, plus pure helper assertions.
- Full backend pytest.

Unresolved questions:
- None.
