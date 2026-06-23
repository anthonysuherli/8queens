/**
 * Society SSE client. Mirrors client.ts's explore consumer but for the NAMED
 * event protocol (Section 8.2): each frame is `event: <name>\ndata: <json>`.
 * The `event:` line becomes the discriminant on SocietyEvent.
 *
 *   UI ──▶ startSociety / streamSociety ──▶ live fetch (VITE_API_BASE)
 *                                       └──▶ mockApi (live unreachable)
 */

import { getApiMode } from "./client";
import { mockApi } from "./mock";
import { ApiError, type SocietyEvent, type StartSocietyResponse } from "./types";

const env = import.meta.env as Record<string, string | undefined>;
const BASE = env.VITE_API_BASE ?? "http://127.0.0.1:8001";
const SECRET = env.VITE_SOCIETY_SECRET ?? "";

const kbPath = (project: string, kb: string) =>
  `/api/projects/${encodeURIComponent(project)}/kbs/${encodeURIComponent(kb)}`;

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export async function startSociety(
  project: string,
  kb: string,
  body: { topic: string; n_researchers?: number; max_rounds?: number },
): Promise<StartSocietyResponse> {
  if (getApiMode() === "mock") return mockApi.startSociety(project, kb, body);
  try {
    const res = await fetch(`${BASE}${kbPath(project, kb)}/society/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Society-Secret": SECRET },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, detail.slice(0, 300));
    }
    return (await res.json()) as StartSocietyResponse;
  } catch (err) {
    if (isNetworkError(err)) return mockApi.startSociety(project, kb, body);
    throw err;
  }
}

/** Parse a buffer of SSE text into named SocietyEvents. */
function parseFrame(frame: string): SocietyEvent | null {
  let name = "";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  const data = dataLines.join("\n");
  if (!name || !data) return null;
  try {
    return { event: name, ...(JSON.parse(data) as object) } as SocietyEvent;
  } catch {
    return null; // skip malformed frames rather than aborting the stream
  }
}

async function* liveStream(
  project: string,
  kb: string,
  runId: string,
): AsyncGenerator<SocietyEvent> {
  const res = await fetch(`${BASE}${kbPath(project, kb)}/society/stream?run_id=${encodeURIComponent(runId)}`);
  if (!res.ok || !res.body) throw new ApiError(res.status, res.statusText);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const evt = parseFrame(frame);
      if (evt) yield evt;
    }
  }
}

export async function* streamSociety(
  project: string,
  kb: string,
  runId: string,
): AsyncGenerator<SocietyEvent> {
  if (getApiMode() === "mock") {
    yield* mockApi.streamSociety(project, kb, runId);
    return;
  }
  let stream: AsyncGenerator<SocietyEvent>;
  try {
    stream = liveStream(project, kb, runId);
    const first = await stream.next();
    if (first.done) return;
    yield first.value;
  } catch (err) {
    if (isNetworkError(err)) {
      yield* mockApi.streamSociety(project, kb, runId);
      return;
    }
    throw err;
  }
  yield* stream;
}
