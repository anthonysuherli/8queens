# Proof-of-Deployment Recording Script (D5)

Single-take screen recording (~5 min). Each beat must appear in the final cut.

## Beat 1 — ECS Console
- Show Alibaba Cloud ECS console, region **ap-southeast-1** (Singapore).
- Highlight the instance with its **public IP** visible.

## Beat 2 — Container Running
- SSH into ECS (or show terminal already connected).
- Run: `docker ps --filter name=qwen8`
- Show container status `Up`.
- Run: `docker logs -f qwen8` — leave streaming in background.

## Beat 3 — Health Check (unauthenticated read route)
- `curl -s http://<ECS_PUBLIC_IP>/health`
- Expected: `{"status":"ok","backend":"sqlite"}`

## Beat 4 — Secret Gate Rejection
- `curl -s -o /dev/null -w '%{http_code}\n' http://<ECS_PUBLIC_IP>/api/projects/demo/kbs/demo/society/start -d '{"topic":"x"}'`
- Expected: `401` or `403` (no `X-Society-Secret` header → rejected).

## Beat 5 — Authenticated Start + Outbound Calls
- `curl -s -H 'X-Society-Secret: <secret>' http://<ECS_PUBLIC_IP>/api/projects/demo/kbs/demo/society/start -d '{"topic":"What is the stablecoin regulatory landscape in 2026?"}'`
- Tail logs: `docker logs --since 1m qwen8`
- Must show: outbound call to `dashscope-intl.aliyuncs.com` **and** a Tavily search/extract call.

## Beat 6 — Browser (optional)
- Open `http://<ECS_PUBLIC_IP>` in browser.
- Show the sigma.js dashboard connecting to the live ECS backend.

---

*This stub is fleshed out with exact commands + expected output in Task D5.*
