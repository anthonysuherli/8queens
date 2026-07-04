### Leading Models on Benchmarks
- **LongJudgeBench** is a benchmark that evaluates models on five real-world scenarios: deep research, scientific survey, creative writing, long-chain analysis, and systematic review. The average output length for this benchmark is 9,249.7 tokens (finding_id: fdae1afe76f742d7b73cf271ca6c5db1, finding_id: e83ea435e1f449f48fd19e3cfaa1ded0).
- **Medmarks** includes 30 fully open-source benchmarks across verifiable (Medmarks-V), open-ended (Medmarks-OE), and agentic tasks, covering areas such as question answering, information extraction, medical calculations, and clinical reasoning (finding_id: 64c7174940ce48309dbb0e1702d7b758).
- **TeleSWEBench** is a benchmark with 734 questions, divided into easy, medium, and difficult tiers, sourced from the srsRAN 5G repository (finding_id: e506331736454ac5a36505786762885a, finding_id: 14fa04b3c9f8453d854d93640a842616, finding_id: 1998bfacff3b4af79957a7f63c49a0c9).
- **SEC-bench Pro** contains 183 validated vulnerabilities across V8 and SpiderMonkey, with a cumulative V8 bounty award of $1,540,750 (finding_id: 63eee106ac174263b401dc69ce5a1f57).

### Licensing Trends
- **Apache 2.0 License**: Qwen3 (Alibaba/Qwen) and Devstral (Mistral AI + All Hands AI) are released under the Apache 2.0 license, which allows commercial use, modification, and distribution without requiring attribution (finding_id: b4ba44b0aa604f4183d1039babbac90f, finding_id: 6b0d0d48fa9445debb26d9cbe71781a6, finding_id: ea4575238c234ed3806247385f5aaf63).
- **MIT License**: Phi-4-mini (Microsoft) and DeepSeek-V4 Flash and Pro (DeepSeek AI) are released under the MIT license, which also allows commercial use, modification, and distribution without requiring attribution (finding_id: d414d65d5b8348d8919fd9c3ffb476c8, finding_id: c6ba94bc79c0496ea0d124659d245f1b, finding_id: 09e1175a559c4ac996e440128859c6e0, finding_id: a76cf56083f745999f363245742f74a2).
- **Modified MIT License**: Kimi K2.6 (Moonshot AI) is released under a Modified MIT license, which requires attribution but allows commercial use and modification (finding_id: 0d964b48e82645038bd1a05d73c839b9, finding_id: 6cdf0553aa4f48c49418a74de153f147).
- **Gemma Terms of Use License**: Gemma 3 (Google DeepMind) is released under a proprietary Gemma Terms of Use license (finding_id: 3250267403864bdbba831d3e6e798c4c).
- **Llama 4 Community License**: Llama 4 Scout (Meta) is released under the Llama 4 Community License, which has specific user limits and restrictions (finding_id: 1e558eb5a4ea45ccadda92bb7f2f4d19).
- **Stability AI Community License**: Stable Diffusion 3.5 Large (Stability AI) is released under the Stability AI Community License, which has revenue thresholds and enterprise licensing requirements (finding_id: 8b2fcb67608944e1a10404e60c6ebf53).

### Real-World Adoption
- **Qwen3** (Alibaba/Qwen) is available in multiple parameter sizes (1.7B to 235B) and is best suited for general assistant, coding, reasoning, multilingual apps, and agents (finding_id: b4ba44b0aa604f4183d1039babbac90f).
- **gpt-oss-20b and gpt-oss-120b** (OpenAI) are designed for private reasoning workflows, agentic tasks, internal enterprise assistants, and research (finding_id: 2d2459c438df4360bba34377b334502b).
- **Gemma 3** (Google DeepMind) is optimized for multimodal tasks, summarization, and general reasoning, targeting single GPU setups (finding_id: 3250267403864bdbba831d3e6e798c4c).
- **Phi-4-mini** (Microsoft) is designed for low-resource machines, students, and CPU/GPU constrained environments (finding_id: d414d65d5b8348d8919fd9c3ffb476c8).
- **Devstral** (Mistral AI + All Hands AI) is tailored for software engineering, local codebase work, and agent workflows (finding_id: 6b0d0d48fa9445debb26d9cbe71781a6).
- **Llama 4 Scout** (Meta) is ideal for long-context RAG, document analysis, and multimodal workloads, with a 10 million token context window (finding_id: 1e558eb5a4ea45ccadda92bb7f2f4d19).
- **DeepSeek-V4 Flash and Pro** (DeepSeek AI) are designed for frontier-level code generation, agentic workflows, and long-context reasoning, with high parameter counts (finding_id: c6ba94bc79c0496ea0d124659d245f1b, finding_id: a76cf56083f745999f363245742f74a2).
- **Kimi K2.6** (Moonshot AI) is suitable for agentic coding, UI generation, and long multi-step tasks, though it is not practical for most individual developers (finding_id: 0d964b48e82645debb26d9cbe71781a6, finding_id: 6cdf0553aa4f48c49418a74de153f147).

### Proportional Evaluation Approaches (PE1–PE4)
- **PE1**: Evaluate without system-level safeguards. 38% of 37 OWM families report PE1 compliance (finding_id: 88b6b172b20543c0a7446dad0dac21fc).
- **PE2**: Assess robustness to modifications designed to undo model-level safeguards. Only 4 of 37 OWM families (11%) report PE2 implementation (finding_id: ef45be1574de4ebfabce675165fe0162).
- **PE3**: Assess selective capability amplification via fine-tuning and tool use. Only 1 of 37 OWM families (3%) — OpenAI’s GPT-OSS — reports PE3 implementation (finding_id: b642f8a37c3e4017b240e16c12c19ada).
- **PE4**: Proxy worst-case feasible misuse assuming irreversible release. Only 1 of 37 OWM families (3%) — OpenAI’s GPT-OSS — reports PE4 implementation (finding_id: 23205700925d4a27bff41599abcc9119).
- **OpenAI’s GPT-OSS** is the only OWM family fulfilling all four proportional evaluation approaches (PE1–PE4) (finding_id: 7aae46a340254715832897c9cc7e9ef8).
