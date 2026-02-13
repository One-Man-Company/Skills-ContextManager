---
name: dspy-ai-apps
description: Comprehensive guide for building AI applications using the DSPy framework with Google's Gemini API. This skill enforces strict rate limit management for the 'gemini-3-flash-preview' model (20 RPD) and provides best practices for "Intent-Oriented Programming", decomposition, agents, and optimization. Use this skill when you need to: (1) Create new DSPy programs, (2) Integrate Gemini with DSPy, (3) Optimize DSPy signatures for Google models, (4) Build Agents/RAG/Tools, or (5) Debug DSPy pipelines.
---

# DSPy AI Applications with Gemini

This skill guides you through building robust, self-optimizing AI applications using **DSPy** (Declarative Self-improving Python) and the **Gemini API**. It emphasizes **Intent-Oriented Programming**: defining *what* you want (Signatures) rather than *how* to prompt it.

> [!WARNING]
> **STRICT RATE LIMITS**: The `gemini-3-flash-preview` model has extremely strict rate limits:
> - **5 Requests Per Minute (RPM)**
> - **20 Requests Per Day (RPD)**
> - **250,000 Tokens Per Minute (TPM)**
>
> You MUST enable caching and use "Dry Runs" to avoid exhaustion.

## 1. Core Philosophy: Intent-Oriented Programming

DSPy shifts focus from "hand-crafting prompts" to "programming architectures".

1.  **Decomposition**: Break complex tasks (Translation, RAG, Agents) into small, optimizable specific programs. Do not build monolithic "God Prompts".
2.  **Signatures**: Declare input/output specs (including types like `list[dict]`, `float`, `Pydantic`).
3.  **Optimization**: Use data (synthetic or real) to compiling programs into effective prompts automatically.
4.  **Modularity**: Swap backends (e.g., Gemini -> Local) or optimization strategies without rewriting code.

## 2. Quick Start (Safe Mode)

To start a new project without hitting rate limits immediately:

1.  **Install Dependencies**:
    ```bash
    pip install dspy-ai google-generativeai
    ```

2.  **Use the Safe Boilerplate**:
    Always start with the provided boilerplate which includes caching and rate limit handling.
    See [assets/boilerplate.py](assets/boilerplate.py).

3.  **Configure Environment**:
    Ensure `GOOGLE_API_KEY` is set in your environment variables.

## 3. Workflow

### Step 1: Define Typed Signatures
Define explicit intents. Be specific with types.
*See [references/cheat_sheet.md](references/cheat_sheet.md) for examples (Invoice Parsing, Entity Extraction).*

### Step 2: Build Modular Programs
Connect modules like `dspy.Predict`, `dspy.ChainOfThought`, or `dspy.ReAct`.
For Agents, expose these programs as tools.

### Step 3: Run Once & Cache
Run your module on a single example.
- **ALWAYS** use `dspy.configure(experimental=True)` or standard settings to enable file-based caching.
- Verify the cache file was created before proceeding.

### Step 4: Synthetic Data & Optimization (Advanced)
**CRITICAL WARNING**: Optimization loops (BootstrapFewShot, MIPRO) consume massive RPD.
- **Strategy**: Use a "Teacher" model (stronger/different quota) to generate synthetic data if possible.
- **Micro-Optimization**: If you must optimize on Gemini Flash, use a tiny trainset (2-3 examples) and `BootstrapFewShot` with `max_bootstrapped_demos=1`.

## 4. Advanced Patterns

### A. Agents & MCP
DSPy programs can be exposed as MCP (Model Context Protocol) tools.
1. Define a `dspy.Signature` for the tool.
2. Wrap it in a `dspy.Predict`.
3. Serve it via an MCP server (e.g., using `mcp2py`).

### B. Fine-Tuning Flow
1. Define Signature.
2. Optimize a Teacher program (strong model) to get high-quality traces.
3. Generate synthetic data.
4. Fine-tune a smaller Student model (e.g., Gemma 2B) using `BootstrapFinetune`.

### C. RAG (Retrieval Augmented Generation)
Combine `dspy.Retrieve` (e.g., ColBERTv2, VectorDB) with `dspy.ChainOfThought`.
Optimize the *entire pipeline* to improve retrieval queries and answer generation simultaneously.

## 5. Troubleshooting

- **429 Errors**: You hit the rate limit. Stop immediately.
- **Empty Responses**: Check API key and safety settings.
- **"Context too long"**: Use `dspy.Retrieve` or decompose the task.

## 6. Artifacts & Resources

- `assets/boilerplate.py`: **MANDATORY** starting point (includes Pydantic/Typed examples).
- `references/cheat_sheet.md`: Signatures for Invoice Parser, RAG, Agents, Entities.
