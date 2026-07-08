# ECS quickstart — self-build from the public repo

The fastest path to a live Alibaba Cloud deployment. Because the repo is public,
the ECS instance builds the image **on the box** — no local Docker, no Container
Registry (ACR) needed. (For the registry-based flow, use [`run.sh`](run.sh).)

## 0. Provision (once, in the Alibaba Cloud console)

- **ECS instance**, region **ap-southeast-1 (Singapore)** — matches Qwen-intl
  (dashscope-intl) for low latency. Ubuntu 22.04, ~2 vCPU / 4 GB, ~40 GB disk.
- **Security group**: allow inbound **TCP 80** (the app) and **22** (SSH).
  Do *not* expose any other port.
- Note the instance's **public IP**.

## 1. Deploy (SSH to the instance)

```bash
ssh root@<ECS_PUBLIC_IP>

# Docker, once:
command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)

# Build from the public repo:
git clone https://github.com/anthonysuherli/8queens.git
cd 8queens
docker build -t queens8:demo .

# Run (all secrets injected at runtime — nothing is baked into the image):
docker rm -f queens8 2>/dev/null || true
mkdir -p /data
docker run -d --name queens8 --restart unless-stopped -p 80:8001 -v /data:/data \
  -e AI_GATEWAY_API_KEY='<dashscope-key>' \
  -e AI_GATEWAY_BASE_URL='https://dashscope-intl.aliyuncs.com/compatible-mode/v1' \
  -e TAVILY_API_KEY='<tavily-key>' \
  -e QUEENS8_SOCIETY_SECRET='<a-long-random-string>' \
  queens8:demo
# QUEENS8_DB_PATH defaults to /data/.queens8.db inside the image (persisted on the volume).
```

## 2. Verify

```bash
docker ps --filter name=queens8            # STATUS = Up
docker logs --tail 20 queens8              # no AssertionError on boot
curl -s http://<ECS_PUBLIC_IP>/health      # {"status":"ok","backend":"sqlite"}

# The write route is secret-gated — this MUST be rejected:
curl -s -o /dev/null -w '%{http_code}\n' \
  http://<ECS_PUBLIC_IP>/api/projects/demo/kbs/demo/society/start -d '{"topic":"x"}'   # 401/403

# Authenticated start (shows outbound DashScope + Tavily calls in the logs):
curl -s -H "X-Society-Secret: <same-secret>" \
  http://<ECS_PUBLIC_IP>/api/projects/demo/kbs/demo/society/start \
  -d '{"topic":"What is the stablecoin regulatory landscape in 2026?"}'
docker logs --since 1m queens8 | grep -E 'dashscope|tavily'
```

**Security note.** `/society/start` is an unauthenticated-if-unset, quota-burning
POST. The `X-Society-Secret` gate is the only thing between the open internet and
your Qwen bill — set `QUEENS8_SOCIETY_SECRET` to a long random value and keep the
security group tight. Never expose the container without the secret set.

## 3. Redeploy after a push

```bash
cd 8queens && git pull && docker build -t queens8:demo . && \
docker rm -f queens8 && docker run -d --name queens8 --restart unless-stopped \
  -p 80:8001 -v /data:/data \
  -e AI_GATEWAY_API_KEY='…' -e TAVILY_API_KEY='…' -e QUEENS8_SOCIETY_SECRET='…' queens8:demo
```
