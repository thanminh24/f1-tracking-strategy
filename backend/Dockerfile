FROM python:3.12-slim AS live-core

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    F1_RUNTIME_PROFILE=live-core \
    F1_ENABLE_ARCHIVE=0 \
    F1_ENABLE_WHATIF=0 \
    F1_PREDICTIONS=0 \
    F1_DATA_DIR=/data \
    HF_HOME=/opt/hf-cache

WORKDIR /app

RUN useradd --create-home --shell /bin/bash appuser

RUN pip install --no-cache-dir \
    fastapi \
    httpx \
    pydantic \
    pydantic-settings \
    "uvicorn[standard]" \
    websockets \
    requests \
    livef1 \
    faster-whisper

# Bake the team-radio ASR model into the image so the first auto-transcribe is
# instant and needs no runtime network. Cache is world-readable for appuser.
RUN mkdir -p /opt/hf-cache \
    && python -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8')" \
    && chmod -R a+rX /opt/hf-cache

# Model is already baked above — run fully offline so huggingface_hub never tries
# to refresh (and write to) the read-only cache at runtime.
ENV HF_HUB_OFFLINE=1

COPY backend/src ./src

# livef1 writes livef1.log into the working dir; run from appuser's writable
# home so the schedule fetch doesn't hit a permission error (imports use the
# absolute PYTHONPATH=/app/src, so CWD does not affect module resolution).
WORKDIR /home/appuser

USER appuser

EXPOSE 8000

CMD ["uvicorn", "f1_strategy.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
