FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY qwen8 ./qwen8
COPY config.yaml ./
RUN pip install --no-cache-dir '.[local]'
ENV QWEN8_DB_PATH=/data/qwen8.db
VOLUME /data
EXPOSE 8001
# api/main.main() binds 127.0.0.1 — the uvicorn CLI overrides host to 0.0.0.0:
CMD ["uvicorn", "qwen8.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
