FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code@latest

RUN pip install --no-cache-dir requests psutil flask

RUN useradd -m -s /bin/bash pipeline && \
    mkdir -p /home/pipeline/.claude && \
    chown -R pipeline:pipeline /home/pipeline

WORKDIR /workspace

ENV PYTHONPATH=/workspace/.claude/jobs/services:/workspace/.claude/jobs
ENV HOME=/home/pipeline

USER pipeline

CMD ["python", ".claude/jobs/pipeline-watcher.py"]
