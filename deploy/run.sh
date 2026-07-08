#!/usr/bin/env bash
# deploy/run.sh — 8queens → Alibaba Cloud ECS (Singapore, ap-southeast-1).
# Usage:
#   ACR=<registry>/queens8 TAG=demo \
#   ECS_IP=<public-ip> ECS_USER=root \
#   DASHSCOPE_API_KEY=... TAVILY_API_KEY=... QUEENS8_SOCIETY_SECRET=... \
#   QUEENS8_CORS_ORIGINS=<frontend/ECS origin or *> \   # optional; defaults to '*'
#   bash deploy/run.sh all          # build → push → deploy
#   bash deploy/run.sh build        # local linux/amd64 image only
#   bash deploy/run.sh push         # docker login + push to ACR
#   bash deploy/run.sh deploy       # ssh ECS: pull + run
set -euo pipefail

ACR="${ACR:?set ACR=<registry>/queens8}"
TAG="${TAG:-demo}"
IMAGE="${ACR}:${TAG}"
GATEWAY_BASE_URL="${AI_GATEWAY_BASE_URL:-https://dashscope-intl.aliyuncs.com/compatible-mode/v1}"
# Browser→ECS is cross-origin; the deployed frontend origin (or '*' for the demo)
# must reach the FastAPI CORS allow-list. main.py reads it from QUEENS8_CORS_ORIGINS.
CORS_ORIGINS="${QUEENS8_CORS_ORIGINS:-*}"

build() {
  docker buildx build --platform linux/amd64 -t "${IMAGE}" --load .
}

push() {
  : "${ACR_USER:?set ACR_USER}" "${ACR_PASSWORD:?set ACR_PASSWORD}"
  echo "${ACR_PASSWORD}" | docker login "${ACR%%/*}" -u "${ACR_USER}" --password-stdin
  docker push "${IMAGE}"
}

deploy() {
  : "${ECS_IP:?set ECS_IP}" "${ECS_USER:?set ECS_USER}"
  : "${DASHSCOPE_API_KEY:?set DASHSCOPE_API_KEY}" "${TAVILY_API_KEY:?set TAVILY_API_KEY}"
  : "${QUEENS8_SOCIETY_SECRET:?set QUEENS8_SOCIETY_SECRET}"
  ssh "${ECS_USER}@${ECS_IP}" bash -s <<EOF
set -euo pipefail
docker pull "${IMAGE}"
docker rm -f queens8 2>/dev/null || true
mkdir -p /data
docker run -d --name queens8 -p 80:8001 -v /data:/data \\
  -e AI_GATEWAY_API_KEY="${DASHSCOPE_API_KEY}" \\
  -e AI_GATEWAY_BASE_URL="${GATEWAY_BASE_URL}" \\
  -e TAVILY_API_KEY="${TAVILY_API_KEY}" \\
  -e QUEENS8_DB_PATH=/data/.queens8.db \\
  -e QUEENS8_SOCIETY_SECRET="${QUEENS8_SOCIETY_SECRET}" \\
  -e QUEENS8_CORS_ORIGINS="${CORS_ORIGINS}" \\
  "${IMAGE}"
sleep 3
docker ps --filter name=queens8
EOF
}

# selfbuild — no local Docker / ACR: the ECS box clones the public repo and
# builds on-box. Needs only ECS_IP, ECS_USER + the three runtime secrets.
selfbuild() {
  : "${ECS_IP:?set ECS_IP}" "${ECS_USER:?set ECS_USER}"
  : "${DASHSCOPE_API_KEY:?set DASHSCOPE_API_KEY}" "${TAVILY_API_KEY:?set TAVILY_API_KEY}"
  : "${QUEENS8_SOCIETY_SECRET:?set QUEENS8_SOCIETY_SECRET}"
  ssh "${ECS_USER}@${ECS_IP}" bash -s <<EOF
set -euo pipefail
command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)
if [ -d 8queens ]; then cd 8queens && git pull; else git clone https://github.com/anthonysuherli/8queens.git && cd 8queens; fi
docker build -t queens8:demo .
docker rm -f queens8 2>/dev/null || true
mkdir -p /data
docker run -d --name queens8 --restart unless-stopped -p 80:8001 -v /data:/data \\
  -e AI_GATEWAY_API_KEY="${DASHSCOPE_API_KEY}" \\
  -e AI_GATEWAY_BASE_URL="${GATEWAY_BASE_URL}" \\
  -e TAVILY_API_KEY="${TAVILY_API_KEY}" \\
  -e QUEENS8_SOCIETY_SECRET="${QUEENS8_SOCIETY_SECRET}" \\
  -e QUEENS8_CORS_ORIGINS="${CORS_ORIGINS}" \\
  queens8:demo
sleep 5
docker ps --filter name=queens8
curl -sS http://localhost/health && echo
EOF
}

case "${1:-}" in
  build) build ;;
  push) push ;;
  deploy) deploy ;;
  selfbuild) selfbuild ;;
  all) build; push; deploy ;;
  *) echo "usage: run.sh build|push|deploy|selfbuild|all" >&2; exit 2 ;;
esac
