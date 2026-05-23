import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', '..', 'logs');

/**
 * LLM client for handling low-confidence transformations.
 * Uses Claude API with validate-or-retry logic.
 */
export class LLMClient {
  constructor(apiKey, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxRetries = 3;
  }

  /**
   * Transform a Vue 2 component to Vue 3 Composition API using LLM.
   * Includes validate-or-retry loop.
   */
  async transformComponent(source, filePath, findings) {
    const lowConf = findings.filter((f) => f.confidence === 'low' || f.confidence === 'medium');
    const findingsSummary = lowConf.map((f) => `- [${f.confidence}] ${f.message}`).join('\n');

    const prompt = this.buildPrompt(source, filePath, findingsSummary);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 8192,
          system: `You are an expert Vue.js migration specialist. Your task is to transform Vue 2 components to Vue 3 Composition API.

CRITICAL RULES:
1. ONLY output valid JavaScript/Vue code. No markdown, no explanations.
2. Use Composition API with <script setup> syntax.
3. Replace Options API patterns: data() → ref()/reactive(), computed: {} → computed(), methods: {} → plain functions, watch: {} → watch(), mounted → onMounted(), etc.
4. Import all Vue functions used: ref, reactive, computed, watch, onMounted, onUnmounted, etc.
5. For event buses ($on/$emit/$off), add a comment suggesting import { emitter } from '@/eventBus' or use provide/inject.
6. For filters, convert to computed properties or plain functions.
7. For Vuex, add a comment suggesting Pinia migration.
8. NEVER hallucinate Vue APIs. Only use documented Vue 3 APIs.
9. Preserve all template code exactly as-is unless a Vue 2→3 migration is needed.
10. Wrap with <script setup> tag, NOT <script>.`,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        const content = response.content[0].text;
        const transformed = this.extractCode(content);

        if (!transformed) {
          this.logAttempt(attempt, filePath, 'Failed to extract code from response', content);
          continue;
        }

        const validation = this.validateOutput(transformed, source);
        if (validation.valid) {
          return { transformed, attempts: attempt };
        }

        this.logAttempt(attempt, filePath, validation.errors.join('; '), transformed);
      } catch (err) {
        this.logAttempt(attempt, filePath, err.message, null);
        if (attempt === this.maxRetries) {
          return { transformed: null, error: err.message, attempts: attempt };
        }
      }
    }

    return { transformed: null, error: 'Max retries exceeded', attempts: this.maxRetries };
  }

  buildPrompt(source, filePath, findingsSummary) {
    return `Transform the following Vue 2 Options API component to Vue 3 Composition API with <script setup> syntax.

FILE: ${filePath}

ISSUES FOUND:
${findingsSummary || '(No low-confidence issues detected)'}

ORIGINAL CODE:
\`\`\`vue
${source}
\`\`\`

Output ONLY the complete transformed .vue file with <script setup> syntax. No explanations.`;
  }

  extractCode(response) {
    // Try to extract code between ```vue blocks
    const vueMatch = response.match(/```vue\s*([\s\S]*?)```/i);
    if (vueMatch) return vueMatch[1].trim();

    const htmlMatch = response.match(/```html\s*([\s\S]*?)```/i);
    if (htmlMatch) return htmlMatch[1].trim();

    const codeMatch = response.match(/```\s*([\s\S]*?)```/);
    if (codeMatch) return codeMatch[1].trim();

    // If no code blocks, check if response starts with <template> or <script
    if (response.trim().startsWith('<template') || response.trim().startsWith('<script')) {
      return response.trim();
    }

    return null;
  }

  validateOutput(transformed, original) {
    const errors = [];

    // Must contain <script setup>
    if (!transformed.includes('<script setup')) {
      errors.push('Missing <script setup> tag');
    }

    // Must contain <template>
    if (!transformed.includes('<template')) {
      errors.push('Missing <template> tag');
    }

    // Must not contain Vue 2 patterns that should have been removed
    const forbiddenPatterns = [
      { pattern: /\bdata\s*\(\s*\)\s*\{/, message: 'Options API data() still present' },
      { pattern: /\bVue\.extend\b/, message: 'Vue.extend still present' },
      { pattern: /\bVue\.set\b/, message: 'Vue.set still present' },
      { pattern: /\bVue\.delete\b/, message: 'Vue.delete still present' },
      { pattern: /\$on\(/, message: '$on still present' },
      { pattern: /\$off\(/, message: '$off still present' },
      { pattern: /\$listeners\b/, message: '$listeners still present' },
      { pattern: /\$scopedSlots\b/, message: '$scopedSlots still present' },
      { pattern: /\bbeforeDestroy\b/, message: 'beforeDestroy not renamed' },
      { pattern: /\bdestroyed\b/, message: 'destroyed not renamed' },
    ];

    for (const { pattern, message } of forbiddenPatterns) {
      if (pattern.test(transformed)) {
        errors.push(message);
      }
    }

    // Basic syntax check: try to determine if it parses as reasonable JS
    // We check for balanced braces as a lightweight validation
    const braceCount = (transformed.match(/\{/g) || []).length;
    const closeBraceCount = (transformed.match(/\}/g) || []).length;
    if (braceCount !== closeBraceCount) {
      errors.push(`Unbalanced braces: ${braceCount} open vs ${closeBraceCount} close`);
    }

    return { valid: errors.length === 0, errors };
  }

  logAttempt(attempt, filePath, error, content) {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      filePath,
      attempt,
      error,
      contentPreview: content ? content.slice(0, 500) : null,
    };

    const logFile = join(LOG_DIR, `llm-attempts-${Date.now()}.json`);
    writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
  }
}