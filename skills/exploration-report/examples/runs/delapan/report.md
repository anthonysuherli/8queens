_From the delapan knowledge-engine / ai-tooling-landscape KB_

## Licensing Terms

- **Open-Source LLM Licensing Terms Summary** — MIT: GLM-5.1, DeepSeek-R1 (unrestricted, full modification). Apache 2.0: Gemma 4, Qwen 3.5/3.6, Mistral Small 4 (unrestricted, patent grant). Meta Llama: Llama 4 (conditional, >700M MAU restricted). Custom: DeepSeek V4 (most uses allowed, some use-case limits).

## Benchmark Performance

- **DeepSeek Models SWE-Bench Verified Performance (2026)** — DeepSeek-V4-Pro-Max 0.806 (1.6T); DeepSeek-V4-Flash-Max 0.790 (284B); DeepSeek-V3.2 0.731 (685B); MiniMax M3 0.805; MiniMax M2.5 0.802 (230B); Kimi K2.6 0.802 (1.0T); GLM-5 0.778 (744B); GLM-4.7 0.738; Mistral Medium 3.5 0.776 (128B).
- **Head-to-Head Benchmark Comparison (April 2026)** — GLM-5.1 58.4% SWE-Bench Pro; Qwen 3.6-35B-A3B 73.4% SWE-bench Verified, 92.7% AIME 2026; Gemma 4 31B 89.2% AIME 2026; DeepSeek V4 ~80-85% SWE-bench; GPT-5.4 (proprietary ref) 57.7% SWE-Bench Pro; Claude Opus 4.6 (ref) 57.3%.
- **Open Source LLM Leaderboard Benchmarks (June 2026)** — Kimi K2.5: 87.6 GPQA, 76.8 SWE-Bench, 96.1 AIME 2025. Kimi K2 Thinking: 84.5 GPQA, 71.3 SWE-Bench, 99.1 AIME 2025, 44.9 HLE. DeepSeek R1: 71.5 GPQA, 49.2 SWE-Bench. Llama 4 Maverick: 69.8 GPQA, 65.0 SWE. Llama 4 Scout: 73.7 GPQA, 68.0 SWE. Nemotron Ultra 253B: 76.0 GPQA, 72.5 AIME.
- **Alibaba Cloud / Qwen Team SWE-Bench Verified (2026)** — Qwen3.7 Max 0.804; Qwen3.6 Plus 0.788; Qwen3.7-Plus 0.777; Qwen3.6-27B 0.772 (28B); Qwen3.5-397B-A17B 0.764; Qwen3.6-35B-A3B 0.734; Qwen3.5-27B 0.724; Qwen3.5-122B-A10B 0.720.
- **DeepSeek-R1-Distill-Llama-70B Benchmark Performance** — DeepSeek-R1-Distill-Llama-70B. LiveCodeBench 51.8%, MMLU-Pro 71.2%. Strengths: balanced performance, resource efficiency.
- **Qwen3-235B-A22B Benchmark Performance** — Qwen3-235B-A22B, Alibaba. LiveCodeBench 69.5%, MMLU-Pro 80.6%. Strengths: coding, software development, general knowledge, reasoning.
- **Qwen3.5-27B LiveCodeBench Performance** — Qwen3.5-27B, Q5_K_XL quantization, LiveCodeBench overall score 77.8%.
- **SWE-Bench Verified Saturation and Flaws** — SWE-Bench Verified pass-rate ceiling 97%. Models memorizing specific GitHub PRs rather than reasoning; ~60% of the hardest problems effectively unsolvable as written. Industry pivoting to SWE-Bench Pro for realistic cross-file refactors.

## Licensing

- **2026 Open-Source LLM Licensing Terms** — Qwen 3: Apache 2.0 (no usage-scale or commercial restrictions). DeepSeek V3.2: MIT (all V3 variants since March 2025; fully permissive). Llama 4: Community License (commercial OK, requires Meta permission above 700M MAU).
- **Open Source LLM Licensing Types in 2026** — MIT: unrestricted commercial use, fine-tuning, redistribution. Apache 2.0: same, with attribution. Llama License: commercial under 700M users, Meta approval above. Gemma License: commercial OK, prohibits uses that harm Google products.
- **2025-2026 Open-Source LLM Licensing Landscape** — Apache 2.0: Qwen 3/3.5, Mistral Large 3, Mistral Small 4, Grok-1. MIT: DeepSeek V3/V3.2/R1, Phi-4, GLM-5. Custom caps: Llama 4 Community (700M MAU, EU multimodal), TII Falcon 2.0 (10% royalty >$1M). Non-commercial: Command R+/A (CC-BY-NC).

## Model Release

- **Gemma 4 (Google DeepMind) Specifications** — Gemma 4, Google DeepMind, West, April 2 2026. Variants E2B (2.3B), E4B (4B), 26B MoE (3.8B active), 31B Dense. AIME 2026 89.2% (31B). Context 128K-256K. License Apache 2.0. Native function calling via gemma-mcp.
- **Qwen 3 and 3.5 Series by Alibaba** — Qwen 3.5 397B-A17B / 122B-A10B / 27B (Feb 2026); Qwen 3 235B / 32B / 8B (Apr 2025). AIME-24 85.7%, GPQA Diamond 77.2%, MMLU-Pro 83.6% (Qwen3 235B). Apache 2.0. 256K context, 201 languages, agentic coding, toggleable thinking. China (Alibaba).
- **GLM-5 by Z.ai** — GLM-5, 2026, 744B total / 40B active MoE, MIT, China (Z.ai). SWE-bench Verified 77.8%, HLE 50.4%. 205K context, multimodal. Trained on 100,000 Huawei Ascend 910B chips (no US-manufactured hardware). Feb 2026.
- **Google Gemma 3 Series** — Gemma 3 27B/12B/4B (Mar 2025), FunctionGemma 270M (Dec 2025). MMLU 78.6%, MATH-500 50.0%, Chatbot Arena 1338 Elo (27B). License Gemma (permissive, requires agreement). 4B uses 4.2GB RAM; multimodal. West (Google).
- **DeepSeek R1 and V3 0324 (2025)** — DeepSeek R1 (Jan 2025), V3 0324 (Mar 2025), China, MIT. 671B/37B (R1), 685B/37B (V3 0324). SWE-bench 49.2%/42.0%, GPQA 71.5%/59.1%, AIME 74.0%/58.1%. R1 training under $6M. Distilled variants 1.5B-70B. Unsloth, Thunder Compute.
- **Meta Llama 4 Maverick and Scout (2025)** — Llama 4, Apr 2025, West, Llama 4 Community License (free <700M MAU). MoE: Maverick 400B/17B, Scout 109B/17B. SWE-bench 65.0%/68.0%, GPQA 69.8%/73.7%, MMMLU 84.6%. Context 1M (Maverick)/192K (Scout). Ollama, Unsloth.
- **Qwen3.6-35B-A3B by Alibaba** — Qwen3.6-35B-A3B, 2026, 35B total / 3B active, 262K context (to ~1M), Apache 2.0. Repo-level/local coding focus. China (Alibaba). Strong single-server candidate with quantization (L40S, A100, H100).
- **Meta Llama 4 Scout and Maverick** — Llama 4 Scout 109B / Maverick 400B (Apr 2025). MMLU 85.5% (Maverick), 79.6% (Scout). Llama 4 Community (free <700M MAU; EU multimodal restrictions). Scout 10M context; Maverick 1M, 128 experts. Natively multimodal. West (Meta).
- **DeepSeek V3, V3.2, and R1 Models** — DeepSeek V3.2 (Dec 2025), R1 (Jan 2025), V3 (Jan 2025). MATH-500 97.3% (R1), MMLU-Pro 84.0% (R1). Gold at IMO 2025, IOI 2025, ICPC World Finals (V3.2-Speciale). MIT. 671B/37B MoE. V3.2 integrates thinking into tool-use.
- **Kimi K2 and K2.5 by Moonshot AI (2025-2026)** — Kimi/Moonshot, China, Modified MIT (broad commercial use). MoE 1T total / 32B active. SWE-bench 76.8% (K2.5)/71.3% (K2 Thinking), GPQA 87.6%/84.5%, AIME 96.1%/99.1%. K2 Thinking: 200-300 consecutive tool calls. K2.5 native multimodal, 15T tokens.
- **Qwen 3.6 (Alibaba) Efficiency and Benchmarks** — Qwen 3.6-35B-A3B, Alibaba, China, April 14 2026, 35B/3B MoE. SWE-bench Verified 73.4%, AIME 2026 92.7%. 262K context (to 1M). Apache 2.0. Free on OpenRouter during preview. Works with Claude Code and OpenClaw.
- **GLM-5.1 (Zhipu AI) Release and Capabilities** — GLM-5.1, Zhipu AI, China, April 7 2026, 754B total MoE / ~32B active. SWE-Bench Pro 58.4% (#1 globally), NL2Repo 42.7%. MIT. Autonomous coding up to 8 hours, 6,000+ tool calls per session. 4-8x A100/H100 for full precision.
- **Llama 4 (Meta) Multimodal Models** — Llama 4, Meta, West. Scout (109B/17B), Maverick (400B). 10M token context (Scout). Meta Llama License (<700M MAU). Native image + video understanding. Function calling via tool_use; LangChain, CrewAI.
- **Sarvam 30B and 105B** — Sarvam 30B (2.4B active) and 105B+ MoE, 2026, Apache 2.0. India-focused reasoning, Indian-language chat, code-mixed inputs. India (Sarvam). Server-centric India-focused deployment.
- **NVIDIA Nemotron Ultra 253B (2025)** — NVIDIA Nemotron, Apr 2025, West, NVIDIA Open Model License (commercial). Dense 253B (from Llama 3.1-405B via NAS). GPQA 76.0%, AIME 72.5%, MATH-500 >97% with reasoning. Single 8x H100 FP8; vLLM.
- **Microsoft Phi-4 Series** — Phi-4 Reasoning Vision 15B (Mar 2026), Phi-4 14B (Jan 2025), Phi-4 Mini 3.8B (Jan 2025). MIT. Mini 128K context. Reasoning Vision 15B up to 3,600 visual tokens for GUI grounding. West (Microsoft).
- **Mistral Small 4 and Large 3** — Mistral Small 4 (Mar 2026), Large 3 (Dec 2025). Apache 2.0. Small 4 (119B/6B) combines Magistral, Pixtral, Devstral, 256K context. Large 3 (675B/41B) supports 80+ languages. West (Mistral AI).
- **Mistral Small 4 Unified Model** — Mistral Small 4, Mistral AI, West, March 16 2026, 119B total / ~6B active MoE. Apache 2.0. Instruct, reasoning, multimodal vision, agentic coding. Configurable reasoning effort for agent tasks.
