import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedRules = null;

export function loadRules() {
  if (cachedRules) return cachedRules;

  const rulesPath = resolve(__dirname, 'vue2-to-vue3.yaml');
  if (!existsSync(rulesPath)) {
    throw new Error(`Rules file not found: ${rulesPath}`);
  }

  const raw = readFileSync(rulesPath, 'utf-8');
  const parsed = load(raw);
  cachedRules = parsed.rules || [];
  return cachedRules;
}

export function getRulesByConfidence(minConfidence = 'low') {
  const confidenceLevels = { low: 0, medium: 1, high: 2 };
  const min = confidenceLevels[minConfidence] ?? 0;
  return loadRules().filter((r) => (confidenceLevels[r.confidence] ?? 0) >= min);
}

export function getHighConfidenceRules() {
  return getRulesByConfidence('high');
}

export function getMediumConfidenceRules() {
  return getRulesByConfidence('medium');
}

export function getLowConfidenceRules() {
  return getRulesByConfidence('low');
}