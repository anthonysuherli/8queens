FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY queens8 ./queens8
COPY config.yaml ./
RUN pip install --no-cache-dir '.[local]'
# Must contain ".queens8" — the api.main startup assertion rejects any other path.
ENV QUEENS8_DB_PATH=/data/.queens8.db
VOLUME /data
EXPOSE 8001
# api/main.main() binds 127.0.0.1 — the uvicorn CLI overrides host to 0.0.0.0:
CMD ["uvicorn", "queens8.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
