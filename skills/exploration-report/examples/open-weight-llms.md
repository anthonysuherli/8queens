## Executive Summary

As of mid-2026, the open-weight frontier is **overwhelmingly Chinese**, and no single model holds an uncontested crown. On **benchmarks**, leadership is metric-dependent: **GLM-5.2 (Z.AI/Zhipu)** is the current top open-weight model on the Artificial Analysis Intelligence Index (~51, per the June 2026 cut) and leads knowledge with **91.2% GPQA Diamond**, while **DeepSeek V4 Pro (Max)** leads agentic coding at **80.6% SWE-Bench Verified** and **Kimi K2-Thinking** leads math at **100% on AIME 2025** ([artificialanalysis.ai](https://artificialanalysis.ai/articles/glm-5-2-is-the-new-leading-open-weights-model-on-the-artificial-analysis-intelligence-index), [llm-stats.com](https://llm-stats.com/leaderboards/open-llm-leaderboard)). On **licensing**, the truly-permissive leaders are **Qwen3 (Apache-2.0, no caps)**, **DeepSeek-V3/R1 (MIT)**, and **GLM (plain MIT)**, which decisively out-permit the custom-restricted **Llama Community License** (700M-MAU cap) and **Gemma Terms of Use** (Prohibited Use Policy + unilateral termination) ([huggingface.co](https://huggingface.co/blog/daya-shankar/open-source-llms), [ai.google.dev](https://ai.google.dev/gemma/terms)). On **real-world adoption**, **DeepSeek** leads token volume — **14.37T cumulative tokens** served on OpenRouter (Nov 2024–Nov 2025), more than Qwen, Llama, and Mistral combined — while **Qwen** leads the fine-tuning ecosystem with a reported **~700M cumulative Hugging Face downloads** by January 2026 ([arxiv.org](https://arxiv.org/html/2601.10088v1), [english.news.cn](https://english.news.cn/20260113/004b0522f987475cbf83ffc3a8d009aa/c.html)). The single clearest structural fact across every source: the open-weight frontier more than doubled in one year and the West's only consistent top-tier entrant is Google's **Gemma 4**, joined recently by **NVIDIA's Nemotron 3 Ultra**.

## 1. Overall Landscape & Head-to-Head

The defining feature of the 2026 open-weight landscape is **Chinese dominance combined with a contested championship**. Every major aggregator agrees that the top tier is Chinese, but they disagree on the exact leader depending on metric and snapshot date.

The pecking order across the four leaderboards surveyed:

- **llm-stats.com Open LLM Leaderboard** ranks the top five open-weight models as all Chinese: **GLM-5.1 (Zhipu), Kimi K2.6 (Moonshot), DeepSeek-V4-Pro-Max, Qwen3.5-397B-A17B**, with **Gemma 4 31B (Google)** the highest Western entry at #5 ([llm-stats.com](https://llm-stats.com/leaderboards/open-llm-leaderboard)). The same source reports **18 of the top 30** open models come from Chinese labs.
- **BenchLM's Chinese-model leaderboard** (overall score, updated Jun 11 2026) places **DeepSeek V4 Pro (Max) first at 87**, then GLM-5 (Reasoning)/GLM-5.1/DeepSeek V4 Pro (High) at 83, Kimi K2.6 at 81, and Qwen3.5 397B (Reasoning) at 79 — a CONFIRMED snapshot ([benchlm.ai](https://benchlm.ai/blog/posts/best-chinese-llm)).
- **Artificial Analysis Intelligence Index** is where the conflict is sharpest (see Caveats §6): the **current (June 16/17 2026) cut makes GLM-5.2 the leading open-weight model at ~51**, with Kimi having dropped to ~43 ([artificialanalysis.ai](https://artificialanalysis.ai/articles/glm-5-2-is-the-new-leading-open-weights-model-on-the-artificial-analysis-intelligence-index)).

**The China-vs-West shift.** One year earlier (early 2025), the top open-weight model was **DeepSeek V3-0324 at ~22** on the AA Index, roughly 13 points below the then-best proprietary model — the open-weight frontier has **more than doubled in a year** ([artificialanalysis.ai](https://artificialanalysis.ai/articles/recent-open-weights-model-launches)). Outside China, the consistent top-tier names are **Gemma 4 31B (Google)** and **NVIDIA Nemotron** — and per the fact-check the current best US open model is **Nemotron 3 Ultra (~48)**, a genuine Western contender, not the "Super" variant the original digest named. The architecture cadence underscores the shift: Sebastian Raschka's survey catalogued **~10 distinct new open-weight architectures in Jan–Feb 2026 alone**, dominated by Chinese labs (Moonshot, Zhipu, Alibaba, Ant, StepFun) operating at the **200B–1T MoE frontier**, while Western permissive families (Gemma, Mistral, OLMo, Granite, Phi) cluster at smaller sizes ([sebastianraschka.com](https://magazine.sebastianraschka.com/p/a-dream-of-spring-for-open-weight)).

Open weights still trail the proprietary frontier, but the gap has narrowed to a few points (the exact margin is contested — see §6). The value story is the other half of the inflection: nine of 13 models on the AA Intelligence-to-Price Pareto frontier are reported to be open-weight, at one-half to one-sixth the cost of closed peers (UNVERIFIED ratio) ([artificialanalysis.ai](https://artificialanalysis.ai/articles/recent-open-weights-model-launches)).

## 2. Benchmarks

### Coding & Agentic Tool-Use

The strongest *primary-source-confirmed* 2025-era coding ranking on SWE-Bench Verified (single-attempt, official figures) is led by **GLM-4.7**. The 2026 successors push higher but, on agentic coding, the clearest confirmed leader is **DeepSeek V4 Pro (Max)** at **80.6% SWE-Bench Verified** (tied with the closed Gemini 3.1 Pro), and **MiniMax M3** tops the cleaner **SWE-Bench Pro at 59.0%** (vs DeepSeek's 55.4%) ([llm-stats.com](https://llm-stats.com/leaderboards/open-llm-leaderboard), [benchlm.ai](https://benchlm.ai/compare/deepseek-v4-pro-vs-minimax-m3)).

| Model (license) | SWE-Bench Verified | Terminal-Bench | LiveCodeBench v6 | τ²/Tau2 tool-use |
|---|---|---|---|---|
| GLM-4.7 (MIT) | **73.8** | 41.0 (TB 2.0) | 84.9 | **87.4** |
| Qwen3-Coder-480B-A35B (Apache-2.0) | 69.6 | — | — | — |
| GLM-4.6 (MIT) | 68.0 | 24.5 (TB 2.0) | 82.8 | 75.2 |
| DeepSeek-V3.2-Exp (MIT) | 67.8 | 37.7 | 74.1 | — |
| Kimi K2-Instruct (Modified MIT) | 65.8 (71.6 multi) | 30.0 / 25.0 | 53.7 | 64.3 |
| **DeepSeek V4 Pro (Max)** | **80.6** | — | — | — |
| **MiniMax M3** | — (59.0 SWE-Bench *Pro*) | — | — | — |

Sources: [huggingface.co/zai-org/GLM-4.7](https://huggingface.co/zai-org/GLM-4.7); [together.ai](https://www.together.ai/blog/qwen-3-coder); [huggingface.co/deepseek-ai/DeepSeek-V3.2-Exp](https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Exp); [huggingface.co/moonshotai/Kimi-K2-Instruct](https://huggingface.co/moonshotai/Kimi-K2-Instruct); [llm-stats.com](https://llm-stats.com/leaderboards/open-llm-leaderboard).

Two agentic findings stand out. **Qwen3-Coder-480B** beats Claude Sonnet 4 on two agentic axes (Tool-Use 68.7 vs 65.2; Browser-Use 49.9 vs 47.4) while trailing slightly on raw agentic coding ([together.ai](https://www.together.ai/blog/qwen-3-coder)). On tool-use (τ²-bench), **GLM-4.7 (87.4)** and **GLM-4.6 (75.2)** clearly outrank Kimi K2 (64.3). Note three caveats: Terminal-Bench figures are **not strictly apples-to-apples** (TB 2.0 vs Hard vs in-house variants — DISPUTED as a clean ranking); the original Qwen blog claims open-SOTA "without test-time scaling" but publishes no number on-page (the 69.6% comes only from Together AI's repost); and SWE-Bench Verified carries contamination concerns, with SWE-Bench Pro positioned as a cleaner successor ([kilo.ai](https://kilo.ai/open-source-models)).

### Reasoning & Math

Among models with **primary-source** benchmarks, **Kimi K2 Thinking** leads open-weight math and reasoning. Its official card reports **AIME 2025 = 94.5% (no tools) / 99.1% (with Python)**, **HMMT 2025 = 89.4% / 95.1%**, **GPQA Diamond = 84.5%**, **MMLU-Pro = 84.6%**, and the highest open HLE at **44.9% with tools** ([huggingface.co/moonshotai/Kimi-K2-Thinking](https://huggingface.co/moonshotai/Kimi-K2-Thinking)). On llm-stats' AIME-2025 board, **Kimi K2-Thinking-0905 scores a perfect 100%** ([llm-stats.com/benchmarks/aime-2025](https://llm-stats.com/benchmarks/aime-2025)).

| Model (license) | AIME 2025 | GPQA Diamond | HLE | MMLU-Pro/Redux |
|---|---|---|---|---|
| Kimi K2 Thinking (Mod. MIT) | 94.5 / 99.1 (tools) | 84.5 | **44.9** (w/ tools) | 84.6 (Pro) |
| GLM-5.2 (MIT) | — | **91.2** | — | — |
| DeepSeek-R1-0528 (MIT) | 87.5 | 81.0 | 17.7 | 85.0 / 93.4 |
| Qwen3-235B-A22B-Thinking-2507 (Apache-2.0) | 92.3 | 81.1 | — | — / 93.8 |

Sources: [huggingface.co/moonshotai/Kimi-K2-Thinking](https://huggingface.co/moonshotai/Kimi-K2-Thinking); [benchlm.ai/models/glm-5-2](https://benchlm.ai/models/glm-5-2); [huggingface.co/deepseek-ai/DeepSeek-R1-0528](https://huggingface.co/deepseek-ai/DeepSeek-R1-0528); [huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507](https://huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507).

Within tiers: **DeepSeek-R1-0528** leads the MIT-licensed tier (its release was a large jump over original R1 — AIME 2025 rose 70.0% → 87.5%, HLE 8.5% → 17.7%, on deeper ~23K-token reasoning), and **Qwen3-235B-Thinking-2507** leads the Apache-2.0 tier ([huggingface.co/deepseek-ai/DeepSeek-R1-0528](https://huggingface.co/deepseek-ai/DeepSeek-R1-0528)). For knowledge specifically, **GLM-5.2's 91.2% GPQA Diamond** is the highest confirmed open-weight figure ([benchlm.ai/models/glm-5-2](https://benchlm.ai/models/glm-5-2)). **Important hedge:** the claim that Kimi "leads open-weight reasoning on HLE" rests on the official *with-tools* 44.9%; independent Artificial Analysis measures only ~22.3% *no-tools* and ranks Kimi #4 overall (still #1 among open weights) — so the unqualified "HLE leader" framing is partly DISPUTED (see §6).

### Multilingual

**Qwen is the clear multilingual leader.** Qwen3 expanded coverage **from 29 languages (Qwen2.5) to 119 languages and dialects**, pre-trained on 36T tokens (CONFIRMED) ([arxiv.org](https://arxiv.org/abs/2505.09388)). On the llm-stats MMMLU leaderboard, the top three open performers are all Qwen: **Qwen3.5-397B-A17B at 0.885** (top open-weight), Qwen3.5-27B at 0.859, and Qwen3.5-35B-A3B at 0.852 ([llm-stats.com/benchmarks/mmmlu](https://llm-stats.com/benchmarks/mmmlu)) — though that 0.885 is the *open-weight-scoped* top; overall it ranks ~#17 behind closed Claude/Gemini/GPT models at ~0.927.

For Southeast Asian languages, AI Singapore's **SEA-LION v4** is the specialist suite, and it is built on *both* leading bases: **Gemma-SEA-LION-v4-27B-IT** (Gemma 3 27B base) ranks **#5 of 55 on SEA-HELM, #1 open under 200B** (Aug 2025), and **Qwen-SEA-LION-v4-32B-IT** (Qwen3-32B base) ranks **#6 of 59, #1 open under 200B** (Oct 2025) ([sea-lion.ai](https://sea-lion.ai/announcing-qwen-sea-lion-v4-advanced-reasoning-and-language-depth-for-southeast-asia/)). **Gemma 3** is the strongest Western open-weight multilingual base (natively multilingual, 140+ languages claimed). Note the base-model MMMLU figures originally cited for Qwen3-32B-Base were DISPUTED on independent re-fetch of the arXiv table (see §6).

## 3. Licensing

The central licensing distinction in 2026 is **genuinely permissive (Apache-2.0 / clean MIT, no caps)** versus **"open-weight but restricted" (custom community license with usage caps, acceptable-use policies, and unilateral termination)**. The Chinese frontier labs have largely consolidated on permissive licenses, a notable shift from earlier custom community terms; the restricted tier is now dominated by the two largest Western families.

| Family | License | Commercial-use terms / key restrictions | Tier |
|---|---|---|---|
| **Qwen3** (Alibaba) | **Apache-2.0** | No MAU cap, no acceptable-use rider; fully permissive (Qwen2-era "Tongyi Qianwen" custom license replaced in Qwen3 era) | Truly permissive |
| **DeepSeek-V3 / R1 weights** | **MIT** | Commercial use, modification, and **distillation explicitly permitted** | Truly permissive |
| **GLM / Z.AI (Zhipu)** | **Plain MIT** | No field-of-use or usage-based clauses — among the cleanest frontier licenses | Truly permissive |
| **Mistral (most models)** | **Apache-2.0** | Fully permissive | Truly permissive |
| **Mistral (some, e.g. Devstral 2)** | **Modified MIT** | Mirrors Apache-2.0 except companies **>$20M monthly revenue** must obtain a commercial license / use Mistral's platform | Permissive-with-rider |
| **Kimi K2 (Moonshot)** | **Modified MIT** | Permissive, but above ~**100M MAU / $20M monthly revenue** the product must prominently display "Kimi K2" branding (attribution rider) | Permissive-with-rider |
| **MiniMax (M2)** | **Modified MIT** (UNVERIFIED — single secondary source) | Reported usage riders vs plain MIT | Permissive-with-rider |
| **Llama (Meta)** | **Llama Community License** | Free **only under 700M MAU**; above that, a separately negotiated Meta license. AUP adds geo/modality limits (multimodal rights reportedly withheld from EU-domiciled entities — UNVERIFIED). Not OSI-open | Custom-restricted |
| **Gemma (Google)** | **Gemma Terms of Use** | Custom terms + separate **Prohibited Use Policy**, downstream flow-down obligations, Google's unilateral right to update/terminate. Not OSI-open | Custom-restricted |
| **Cohere Tiny Aya** | **CC-BY-NC (non-commercial)** | No commercial use permitted | Non-commercial |

Sources: [huggingface.co](https://huggingface.co/blog/daya-shankar/open-source-llms); [siliconangle.com](https://siliconangle.com/2025/03/24/deepseek-releases-improved-deepseek-v3-model-mit-license/); [github.com/deepseek-ai/DeepSeek-R1](https://github.com/deepseek-ai/DeepSeek-R1); [ai.google.dev/gemma/terms](https://ai.google.dev/gemma/terms); [wcr.legal](https://wcr.legal/google-gemma-license-risks/); [help.mistral.ai](https://help.mistral.ai/en/articles/347393-under-which-license-are-mistral-s-open-models-available); [techcrunch.com](https://techcrunch.com/2025/03/14/open-ai-model-licenses-often-carry-concerning-restrictions/); [huggingface.co/CohereLabs/tiny-aya-global](https://huggingface.co/CohereLabs/tiny-aya-global).

Two flow-down nuances matter for derivatives. First, **DeepSeek's older repos** (DeepSeek-Coder, -LLM, -MoE, -Math) ship under a **custom OpenRAIL-based license** with behavioral-use prohibitions — so "DeepSeek = MIT" holds only for the V3 (March 2025)/R1 weights, not the whole catalog ([deepseeklicense.github.io](https://deepseeklicense.github.io/)). Second, **R1 distilled models inherit their base license, not MIT**: the Qwen-2.5-based distills are Apache-2.0, but **DeepSeek-R1-Distill-Llama-8B carries the Llama 3.1 license** and **-Llama-70B the Llama 3.3 license** ([github.com/deepseek-ai/DeepSeek-R1](https://github.com/deepseek-ai/DeepSeek-R1)). Net: for clean, cap-free commercial deployment and fine-tuning, **Qwen3 (Apache-2.0), DeepSeek V3/R1, and GLM (MIT)** are the safest; **Llama and Gemma** require reading the policy.

## 4. Real-World Adoption

**Inference-provider availability.** **DeepInfra hosts the widest current open-weight catalog** and ranks among the cheapest per-token providers — covering Kimi K2, Qwen3.5, GLM-5, DeepSeek V4, MiniMax-M2, gpt-oss-120B, and NVIDIA Nemotron ([infrabase.ai](https://infrabase.ai/blog/ai-inference-api-providers-compared)). **Groq** carries gpt-oss-20B/120B, Llama 3.3 70B, Llama 4 Scout, Qwen3 32B, and Kimi K2; **Fireworks** differentiates on frontier MoEs Groq lacks (e.g., DeepSeek V4 Pro, Kimi K2.6) — though the specific Groq/Fireworks catalogs are UNVERIFIED (single source). Cross-provider economics on the *same* open model vary sharply: per-token price spreads ~6×, P50 latency 5–7×, and throughput up to 10× between commodity-H100 endpoints and specialty hardware (Groq LPU, Cerebras). gpt-oss-120B on DeepInfra now runs **~$0.05 per 1M blended tokens** (the live page corrected the earlier $0.08 figure — DISPUTED).

**Usage share (OpenRouter).** OpenRouter's "State of AI" study analyzed **~100 trillion tokens** over ~two years to November 2025 — the largest empirical usage dataset cited for the period ([arxiv.org](https://arxiv.org/html/2601.10088v1)). Key CONFIRMED findings:

- Open-weight models reached **~33% of total usage** by late 2025 (proprietary ~70% on average over the window).
- **DeepSeek led all open-weight authors with 14.37T cumulative tokens**, ahead of **Qwen 5.59T, Meta LLaMA 3.96T, Mistral 2.92T, and OpenAI's open contributions 1.65T**.
- Chinese open-weight models grew from a **negligible 1.2% weekly token share (late 2024) to nearly 30% in some weeks by mid-2025**, settling at a ~13.0% full-year average (Rest-of-World OSS ~13.7%).
- OSS de-clustered: early 2024 saw DeepSeek V3/R1 alone exceed 50% of all OSS tokens, but by late 2025 **no single model exceeded ~25%** — a 5–7 model "pluralistic mix."
- US-model token share **fell from ~70% to ~30% over the year to mid-2026**, corroborated across multiple outlets; an April 2026 snapshot put Chinese-provider traffic at **~51% of tokens** ([cryptobriefing.com](https://cryptobriefing.com/openrouter-us-models-token-share-collapse/), [digitalapplied.com](https://www.digitalapplied.com/blog/openrouter-rankings-april-2026-top-ai-models-data)).

**Download / fine-tuning ecosystem (Hugging Face).** **Qwen leads** here decisively: it reportedly surpassed **~700M cumulative downloads by January 2026**, the most-downloaded open model family — corroborated independently by Xinhua, SCMP, and Cryptopolitan, not just the HF blog ([english.news.cn](https://english.news.cn/20260113/004b0522f987475cbf83ffc3a8d009aa/c.html)). Reports that ~11 of the top-20 HF text-gen models are Qwen variants, and that Chinese models held five of the top ten slots in early 2026, remain UNVERIFIED (secondary only). Derivative-ecosystem velocity is high: **DeepSeek V4.1 Flash took the top HF trending slot within a week of release** in the June 2026 frontier wave (CONFIRMED across multiple trackers) ([presenc.ai](https://presenc.ai/research/huggingface-trending-models-june-2026)).

## 5. The China-vs-West Inflection

What changed 2025→2026 is best captured in three numbers. **First, the benchmark frontier doubled:** the top open-weight model went from DeepSeek V3-0324 at ~22 on the AA Index in early 2025 to GLM-5.2 at ~51 by June 2026 ([artificialanalysis.ai](https://artificialanalysis.ai/articles/recent-open-weights-model-launches)). **Second, usage flipped:** US-origin token share on OpenRouter collapsed from ~70% to ~30%, while Chinese open-weight share rose from a negligible 1.2% weekly to roughly half of tokens in some April 2026 snapshots ([cryptobriefing.com](https://cryptobriefing.com/openrouter-us-models-token-share-collapse/)). **Third, the release cadence concentrated in China:** ~10 new open-weight architectures shipped in Jan–Feb 2026 alone, dominated by Moonshot, Zhipu, Alibaba, Ant, and StepFun at the 200B–1T MoE frontier, followed by an April 2026 frontier wave (DeepSeek V4, Kimi K2.6, Qwen3.6, GLM-5.x) ([sebastianraschka.com](https://magazine.sebastianraschka.com/p/a-dream-of-spring-for-open-weight)).

The West's response has two prongs. **Google's Gemma 4 31B** is the lone consistent Western entry in any leaderboard top tier, and **NVIDIA's Nemotron 3 Ultra (~48)** is now a genuine Western contender — the strongest US open-weight model per the latest cut, even if China remains ahead ([theplanettools.ai](https://theplanettools.ai/blog/nvidia-nemotron-3-ultra-best-us-open-weights-model-china-still-ahead-june-2026)). Licensing reinforces the contrast: the Chinese frontier consolidated on Apache-2.0/MIT, while the two largest Western open families (Llama, Gemma) retained custom community licenses with caps and acceptable-use policies. The combined effect is that, on permissiveness *and* raw capability *and* usage, the open-weight center of gravity has moved to China — with the West leading mainly on Gemma's multilingual breadth and Nemotron's late-cycle catch-up.

## 6. Caveats & Contested Claims

The following were explicitly flagged DISPUTED or UNVERIFIED by the fact-checkers and must not be read as settled:

- **The AA Intelligence Index champion (DISPUTED).** The digest's original snapshot had **Kimi K2.6 and Xiaomi MiMo V2.5 Pro tied at 54** with DeepSeek V4 Pro at 52 — but that is an *earlier* cut. The **current (June 16/17 2026) AA v4.1 cut makes GLM-5.2 the #1 open-weight model at ~51, with Kimi dropped to ~43** ([artificialanalysis.ai](https://artificialanalysis.ai/articles/glm-5-2-is-the-new-leading-open-weights-model-on-the-artificial-analysis-intelligence-index), [implicator.ai](https://www.implicator.ai/glm-5-2-becomes-the-top-open-weight-model-on-artificial-analysis/)). Treat the 54 figures as stale.
- **Best Western model (DISPUTED).** The current top US open model is **Nemotron 3 Ultra (~48)**, not "Nemotron 3 Super (36)" ([artificialanalysis.ai](https://artificialanalysis.ai/articles/nvidia-nemotron-3-ultra-released)).
- **GPT-5.5 at 60 leading overall (DISPUTED).** No source shows 60; the proprietary top is ~57 (GPT-5.4 xhigh / Opus 4.7 / Gemini 3.1 Pro tied) ([benchlm.ai](https://benchlm.ai/benchmarks/artificialAnalysis)). The "open weights trail by 3–6 points" gap is therefore UNVERIFIED in its exact magnitude.
- **GLM-5.1 coding-arena "1,759" (DISPUTED).** Sources put GLM-5.1 at ~1,530 Elo on Code Arena (3rd); the 1,759 figure is uncorroborated ([buildfastwithai.com](https://www.buildfastwithai.com/blogs/glm-5-1-code-arena-open-source-2026)).
- **Kimi "leads open-weight reasoning on HLE" (DISPUTED framing).** The 44.9% is the official *with-tools* number; independent AA reports ~22.3% *no-tools* and ranks Kimi #4 overall (top among open only) ([artificialanalysis.ai](https://artificialanalysis.ai/articles/kimi-k2-thinking-everything-you-need-to-know)).
- **Qwen3-32B-Base multilingual figures (DISPUTED).** The digest's MMMLU 86.70 / MGSM 83.53 / INCLUDE 73.46 did not reconcile on an independent re-fetch of arXiv Table 4 (read as 83.83 / 83.06 / 67.87) — the per-scale figures appear row-shifted; treat the precise base-model numbers as unreliable ([arxiv.org](https://arxiv.org/html/2505.09388v1)). Qwen3.5-397B's 0.885 MMMLU is "top open-weight" *only when scoped to open weights* (overall ~#17, DISPUTED) ([llm-stats.com](https://llm-stats.com/benchmarks/mmmlu)).
- **SEA-LION "commercially permissive open license" (DISPUTED).** The Gemma variant is under Gemma's custom Terms of Use (with AUP), not Apache/MIT; only the Qwen variant is MIT — the "free for research and commercial use" wording over-generalizes ([huggingface.co](https://huggingface.co/aisingapore/Gemma-SEA-LION-v4-27B-IT)).
- **OpenRouter April vs June framing (DISPUTED).** The 46.4% Chinese / 35.7% US / DeepSeek 16.3% split is **June 2026** data (not April), and DeepSeek's individual share is reported 16.3–17.6% depending on snapshot ([pro.stockalarm.io](https://pro.stockalarm.io/blog/openrouter-llm-rankings-investor-analysis)).
- **gpt-oss-120B DeepInfra price (DISPUTED).** The live page now states ~$0.05/1M blended, not $0.08.
- **UNVERIFIED items:** the 9-of-13 AA Pareto-frontier ratio; DeepSeek V3-0324 at exactly 22 vs Claude 3.7 at 35 a year prior; MiniMax M3 GPQA ~93% and MiniMax-M2 "Modified MIT" (secondary only); Llama multimodal EU withholding; ~11-of-top-20 HF Qwen variants / Chinese 5-of-top-10; Groq/Fireworks per-model catalogs; the "comparable to Gemini-1.5-Pro" Gemma 3 claim (vendor self-report); and the full slate of April-2026 GLM-5/Qwen3.5/Kimi-K2.5 reasoning leader figures that appear only in SEO aggregators.
- **Version-numbering and dates.** Raschka's Feb 2026 survey named DeepSeek-V3.2 / GLM-5 / Qwen3.5 / Kimi K2.5; the higher numbers (DeepSeek **V4**, **K2.6**, **Qwen3.6**) are confirmed *later* (April 2026) releases with primary HF cards — not aggregator artifacts. Separately, Qwen3-235B's release date is Apr 28–29 2025 (not May 14), and DeepSeek-R1 is more precisely **685B total** (671B main + 14B MTP), not 671B.

## Sources

- [artificialanalysis.ai — recent open-weights launches](https://artificialanalysis.ai/articles/recent-open-weights-model-launches)
- [artificialanalysis.ai — GLM-5.2 new leading open-weights model](https://artificialanalysis.ai/articles/glm-5-2-is-the-new-leading-open-weights-model-on-the-artificial-analysis-intelligence-index)
- [artificialanalysis.ai — Nemotron 3 Ultra released](https://artificialanalysis.ai/articles/nvidia-nemotron-3-ultra-released)
- [artificialanalysis.ai — Kimi K2 Thinking explainer](https://artificialanalysis.ai/articles/kimi-k2-thinking-everything-you-need-to-know)
- [artificialanalysis.ai — Intelligence Index](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index)
- [artificialanalysis.ai — open-source models](https://artificialanalysis.ai/models/open-source)
- [artificialanalysis.ai — DeepSeek V3-0324](https://artificialanalysis.ai/models/deepseek-v3-0324)
- [x.com/ArtificialAnlys snapshot](https://x.com/ArtificialAnlys/status/2047799218828665093)
- [benchlm.ai — Artificial Analysis mirror](https://benchlm.ai/benchmarks/artificialAnalysis)
- [benchlm.ai — best Chinese LLM](https://benchlm.ai/blog/posts/best-chinese-llm)
- [benchlm.ai — best open-source LLM](https://benchlm.ai/blog/posts/best-open-source-llm)
- [benchlm.ai — GLM-5.2](https://benchlm.ai/models/glm-5-2)
- [benchlm.ai — DeepSeek V4 Pro vs MiniMax M3](https://benchlm.ai/compare/deepseek-v4-pro-vs-minimax-m3)
- [llm-stats.com — Open LLM Leaderboard](https://llm-stats.com/leaderboards/open-llm-leaderboard)
- [llm-stats.com — AIME 2025](https://llm-stats.com/benchmarks/aime-2025)
- [llm-stats.com — MMMLU](https://llm-stats.com/benchmarks/mmmlu)
- [implicator.ai — GLM-5.2 top open-weight model](https://www.implicator.ai/glm-5-2-becomes-the-top-open-weight-model-on-artificial-analysis/)
- [decrypt.co — NVIDIA Nemotron 3 Ultra](https://decrypt.co/369689/nvidia-open-ai-model-nemotron-3-ultra)
- [theplanettools.ai — Nemotron 3 Ultra, China still ahead](https://theplanettools.ai/blog/nvidia-nemotron-3-ultra-best-us-open-weights-model-china-still-ahead-june-2026)
- [morphllm.com — DeepSeek V4](https://www.morphllm.com/deepseek-v4)
- [morphllm.com — best open-source coding model 2026](https://www.morphllm.com/best-open-source-coding-model-2026)
- [buildfastwithai.com — GLM-5.1 Code Arena](https://www.buildfastwithai.com/blogs/glm-5-1-code-arena-open-source-2026)
- [arxiv.org — Kimi K2 technical report (HTML)](https://arxiv.org/html/2507.20534)
- [arxiv.org — Kimi K2 technical report (PDF)](https://arxiv.org/pdf/2507.20534)
- [together.ai — Qwen3-Coder](https://www.together.ai/blog/qwen-3-coder)
- [qwenlm.github.io — Qwen3-Coder blog](https://qwenlm.github.io/blog/qwen3-coder/)
- [qwenlm.github.io — Qwen3 blog](https://qwenlm.github.io/blog/qwen3/)
- [huggingface.co — DeepSeek-V3.2-Exp](https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Exp)
- [huggingface.co — DeepSeek-V3](https://huggingface.co/deepseek-ai/DeepSeek-V3)
- [huggingface.co — DeepSeek-V4-Pro](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro)
- [huggingface.co — GLM-4.7](https://huggingface.co/zai-org/GLM-4.7)
- [huggingface.co — GLM-4.6](https://huggingface.co/zai-org/GLM-4.6)
- [huggingface.co — Kimi-K2-Instruct](https://huggingface.co/moonshotai/Kimi-K2-Instruct)
- [huggingface.co — Kimi-K2-Thinking](https://huggingface.co/moonshotai/Kimi-K2-Thinking)
- [huggingface.co — DeepSeek-R1-0528](https://huggingface.co/deepseek-ai/DeepSeek-R1-0528)
- [huggingface.co — Qwen3-235B-A22B-Thinking-2507](https://huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507)
- [huggingface.co — Qwen3-235B-A22B](https://huggingface.co/Qwen/Qwen3-235B-A22B)
- [huggingface.co — open-source LLMs blog](https://huggingface.co/blog/daya-shankar/open-source-llms)
- [huggingface.co — Llama 4 release](https://huggingface.co/blog/llama4-release)
- [huggingface.co — Gemma-SEA-LION-v4-27B-IT](https://huggingface.co/aisingapore/Gemma-SEA-LION-v4-27B-IT)
- [huggingface.co — Cohere Tiny Aya](https://huggingface.co/CohereLabs/tiny-aya-global)
- [businesswire.com — Z.ai open-sources GLM-4.7](https://www.businesswire.com/news/home/20251223393714/en/Z.ai-Open-Sources-GLM-4.7-a-New-Generation-Large-Language-Model-Built-for-Real-Development-Workflows)
- [siliconangle.com — DeepSeek V3 MIT license](https://siliconangle.com/2025/03/24/deepseek-releases-improved-deepseek-v3-model-mit-license/)
- [github.com — DeepSeek-R1](https://github.com/deepseek-ai/DeepSeek-R1)
- [github.com — Qwen3](https://github.com/QwenLM/Qwen3)
- [deepseeklicense.github.io](https://deepseeklicense.github.io/)
- [techcrunch.com — open model license restrictions](https://techcrunch.com/2025/03/14/open-ai-model-licenses-often-carry-concerning-restrictions/)
- [acecloud.ai — best open-source LLMs](https://acecloud.ai/blog/best-open-source-llms/)
- [ai.google.dev — Gemma terms](https://ai.google.dev/gemma/terms)
- [wcr.legal — Google Gemma license risks](https://wcr.legal/google-gemma-license-risks/)
- [help.mistral.ai — Mistral open model licenses](https://help.mistral.ai/en/articles/347393-under-which-license-are-mistral-s-open-models-available)
- [arxiv.org — Qwen3 technical report (abs)](https://arxiv.org/abs/2505.09388)
- [arxiv.org — Qwen3 technical report (PDF)](https://arxiv.org/pdf/2505.09388)
- [arxiv.org — Qwen3 technical report (HTML)](https://arxiv.org/html/2505.09388v1)
- [arxiv.org — DeepSeek-R1 paper](https://arxiv.org/pdf/2501.12948)
- [sea-lion.ai — SEA-LION v4 multimodal](https://sea-lion.ai/blog/sea-lion-v4-multimodal/)
- [sea-lion.ai — Qwen-SEA-LION-v4 announcement](https://sea-lion.ai/announcing-qwen-sea-lion-v4-advanced-reasoning-and-language-depth-for-southeast-asia/)
- [Gemma 3 Technical Report (PDF)](https://storage.googleapis.com/deepmind-media/gemma/Gemma3Report.pdf)
- [marktechpost.com — SEA-LION v4](https://www.marktechpost.com/2025/08/25/sea-lion-v4-multimodal-language-modeling-for-southeast-asia/)
- [marktechpost.com — GLM-4.5 series](https://www.marktechpost.com/2025/07/28/zhipu-ai-just-released-glm-4-5-series-redefining-open-source-agentic-ai-with-hybrid-reasoning/)
- [venturebeat.com — Qwen3-235B-Thinking-2507](https://venturebeat.com/ai/its-qwens-summer-new-open-source-qwen3-235b-a22b-thinking-2507-tops-openai-gemini-reasoning-models-on-key-benchmarks)
- [sebastianraschka.com — A Dream of Spring for open-weight models](https://magazine.sebastianraschka.com/p/a-dream-of-spring-for-open-weight)
- [turingpost.com — Chinese models 2025](https://www.turingpost.com/p/chinesemodels)
- [ai.meta.com — Llama 4 multimodal intelligence](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [deeplearning.ai — Kimi K2.6 / Qwen3.6 / DeepSeek V4 batch](https://www.deeplearning.ai/the-batch/kimi-k2-6-matches-open-qwen3-6-max-anddeepseek-v4-falls-just-behind-top-closed-models)
- [openrouter.ai — State of AI](https://openrouter.ai/state-of-ai)
- [arxiv.org — OpenRouter 100T-token study (abs)](https://arxiv.org/abs/2601.10088)
- [arxiv.org — OpenRouter 100T-token study (HTML)](https://arxiv.org/html/2601.10088v1)
- [officechai.com — US model share collapse](https://officechai.com/ai/share-of-us-models-being-used-on-openrouter-has-collapsed-from-70-to-30-over-the-past-year/)
- [cryptobriefing.com — OpenRouter US share collapse](https://cryptobriefing.com/openrouter-us-models-token-share-collapse/)
- [pro.stockalarm.io — OpenRouter rankings investor analysis](https://pro.stockalarm.io/blog/openrouter-llm-rankings-investor-analysis)
- [digitalapplied.com — OpenRouter rankings April 2026](https://www.digitalapplied.com/blog/openrouter-rankings-april-2026-top-ai-models-data)
- [english.news.cn — Qwen 700M downloads](https://english.news.cn/20260113/004b0522f987475cbf83ffc3a8d009aa/c.html)
- [blog.imseankim.com — HF January 2026 rankings](https://blog.imseankim.com/hugging-face-january-2026-open-model-rankings-deepseek-qwen-leaderboard/)
- [infrabase.ai — inference providers compared](https://infrabase.ai/blog/ai-inference-api-providers-compared)
- [kilo.ai — open-source models](https://kilo.ai/open-source-models)
- [presenc.ai — HF trending models June 2026](https://presenc.ai/research/huggingface-trending-models-june-2026)
- [mywrittenword.com — open-source LLM rankings April 2026](https://mywrittenword.com/2026/04/26/open-source-llm-rankings-april-2026-deepseek-qwen-glm-kimi-benchmarks/)
- [codesota.com — open models](https://www.codesota.com/llm/open-models)
- [vellum.ai — open LLM leaderboard](https://www.vellum.ai/open-llm-leaderboard)
- [computingforgeeks.com — open-source LLM comparison](https://computingforgeeks.com/open-source-llm-comparison/)
