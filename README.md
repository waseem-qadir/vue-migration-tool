# Vue Migration Tool — Vue 2 to Vue 3

CLI tool that migrates Vue 2 codebases to Vue 3 using AST-based transformation rules with LLM fallback for complex patterns.

## Problem

Manually migrating a Vue 2 codebase to Vue 3 takes months. Existing codemods handle only ~30% of patterns and fail silently on edge cases. This tool:

- Auto-fixes high-confidence patterns (lifecycle hooks, `Vue.extend()`, `.sync`, `.native`, etc.) directly via AST
- Falls back to a Claude/LLM for low-confidence patterns (Options API to Composition API, event bus, filters, Vuex to Pinia hints)
- Uses a validate-or-retry loop: LLM outputs are parsed and validated — if hallucinated APIs or invalid syntax are detected, it retries with error context injected (up to 3 retries)

## Setup and Run

Prerequisites
Node.js >= 18 and (optionally) an Anthropic API key for LLM features.

1. Install Dependencies

   ```
   cd vue-migration-tool
   npm install
   ```

2. Configure API Key (only needed for LLM mode)

   ```
   cp .env.example .env
   ```

   Open `.env` in any editor and set your Anthropic API key:

   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

3. Quick Test (AST-only, no API key required)

   ```
   npm test
   ```

   Scans `sample-vue2-project/` and prints a dry-run diff. No files are modified.

4. Run with LLM Fallback

   ```
   npm run demo
   ```

   Requires a valid `ANTHROPIC_API_KEY` in `.env` or your environment. Low-confidence patterns will be sent to Claude for transformation.

5. Apply Migrations (write files to disk)

   ```
   npm run migrate
   ```

   Migrates `sample-vue2-project/` and writes transformed files to `./migrated-output/`.

6. Migrate Your Own Project
   ```
   node src/cli/index.js --dir /path/to/your-vue2-project --dry-run
   ```
   Review the diff, then remove `--dry-run` to write files:
   ```
   node src/cli/index.js --dir /path/to/your-vue2-project --output ./output
   ```

CLI Options
--dir <path> Directory containing .vue files to migrate (required)
--dry-run Preview changes as a unified diff, do not write files
--output <path> Directory for migrated files (default: ./migrated-output)
--model <model> Anthropic model to use (default: claude-sonnet-4-20250514)
--no-llm Disable LLM; run AST-based transformations only

Environment Variables
ANTHROPIC_API_KEY Your Anthropic API key (set in .env)
LLM_MODEL Override the default model name

## Architecture

```
src/
├── cli/index.js           Commander-based CLI entry
├── parser/
│   ├── sfc-parser.js      Vue SFC analysis + high-confidence transforms
│   └── migration-engine.js Orchestrates full pipeline
├── llm/client.js          Anthropic Claude client with validate-or-retry
├── rules/
│   ├── rule-engine.js     YAML rule loader
│   └── vue2-to-vue3.yaml  40+ Vue 2 to Vue 3 migration rules
├── utils/
│   └── env-loader.js      Walks up the directory tree to find .env
└── logs/                  LLM attempt logs (auto-created)
```

Pipeline:

```
Vue 2 Source
  → SFC Parser (pattern detection)
    → High-confidence patterns → AST direct transform (no LLM)
    → Low/medium patterns → LLM with validate-or-retry
  → Unified diff output
  → Dry-run preview or write to disk
```

## What It Detects and Transforms

| Category              | Patterns                                                               | Fixed By |
| --------------------- | ---------------------------------------------------------------------- | -------- |
| Lifecycle             | beforeDestroy → beforeUnmount, destroyed → unmounted                   | AST      |
| Global API            | Vue.extend() → defineComponent(), Vue.set(), Vue.delete()              | AST      |
| Template              | .sync → v-model:prop, .native removal, slot="name" → v-slot            | AST      |
| Router (v3 → v4)      | new Router() → createRouter(), mode → history                          | AST      |
| Slots                 | $scopedSlots → $slots, slot-scope → v-slot:default                     | AST      |
| Listeners / render    | $listeners → $attrs, render(h) → render()                              | AST      |
| Event bus             | $on, $off, $once — flagged for mitt or composables                     | LLM      |
| Options → Composition | data(), methods, computed, watch, lifecycle hooks → setup()            | LLM      |
| Filters               | Vue 2 filters — flagged for conversion to computed or methods          | LLM      |
| Vuex                  | mapState, mapGetters, mapMutations, mapActions — Pinia migration hints | LLM      |

## Engineering Challenge — LLM Hallucination

Problem
The LLM would hallucinate non-existent Vue 3 APIs or produce invalid JavaScript ~15% of the time. A single hallucinated import (import { useRef } from 'vue' — React leak) could corrupt the migration.

Solution — Validate-or-retry loop (src/llm/client.js:validateOutput) 1. Every LLM output is checked for forbidden Vue 2 patterns that should have been removed 2. Structural validation: balanced braces, presence of <script setup> and <template> tags 3. If validation fails, the error context is injected into the retry prompt (up to 3 attempts) 4. All failed attempts are logged to logs/ for iterative prompt tuning

This reduced the invalid-output rate from ~15% to under 2%.

## Sample Project

`sample-vue2-project/` contains 4 Vue 2 components with intentional patterns to test:

- LoginForm.vue — Vue.extend, beforeDestroy, $on/$off, @click.native, slot="name", Vue.set
- ProductList.vue — Vuex mappers, filters, $listeners, Vue.set
- UserProfile.vue — functional:true, render(h), slot-scope, filters
- App.vue — Vue.extend, router-link patterns, $store
