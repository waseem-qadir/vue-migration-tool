import { parse } from 'vue-eslint-parser';
import { parseExpression } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { loadRules } from '../rules/rule-engine.js';

/**
 * Parse a Vue SFC file and detect Vue 2 patterns with confidence scores.
 * Returns an array of findings.
 */
export function analyzeSFC(source, filePath) {
  const findings = [];
  const rules = loadRules();

  // Parse the SFC
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      ecmaVersion: 'latest',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    });
  } catch (err) {
    return [{ type: 'parse_error', filePath, message: err.message, confidence: 'none' }];
  }

  const templateContent = ast.templateBody?.range
    ? source.slice(...ast.templateBody.range)
    : null;

  const scriptContent = ast.tokens?.length ? source.slice(ast.tokens[0].range[0], ast.tokens[ast.tokens.length - 1].range[1]) : null;

  // ── Template-based detections ───────────────────────────────
  if (templateContent) {
    // slot attribute
    if (templateContent.match(/\bslot\s*=\s*["'](?!scope\b)/)) {
      findings.push({
        type: 'slot-attribute-to-v-slot',
        message: 'Found deprecated slot="name" attribute. Migrate to v-slot:name.',
        confidence: 'high',
        filePath,
      });
    }

    // slot-scope
    if (templateContent.includes('slot-scope=')) {
      findings.push({
        type: 'slot-scope-to-v-slot',
        message: 'Found slot-scope. Migrate to v-slot:default="props".',
        confidence: 'high',
        filePath,
      });
    }

    // .native modifier
    if (templateContent.match(/@\w+\.native\b/)) {
      findings.push({
        type: 'native-modifier-removed',
        message: 'Found @event.native modifier which is removed in Vue 3.',
        confidence: 'high',
        filePath,
      });
    }

    // .sync modifier
    if (templateContent.match(/v-bind:\w+\.sync\b/)) {
      findings.push({
        type: 'v-bind-sync-to-v-model',
        message: 'Found .sync modifier. Replace with v-model:prop syntax.',
        confidence: 'high',
        filePath,
      });
    }

    // Numeric keycodes
    if (templateContent.match(/@key(?:up|down|press)\.\d+/)) {
      findings.push({
        type: 'keycode-modifiers-removed',
        message: 'Found numeric keyCode modifier which is removed. Use kebab-case key name.',
        confidence: 'medium',
        filePath,
      });
    }

    // v-model on component with value/input expectation
    // (can't fully detect statically, flag as medium)
    if (templateContent.includes('v-model') && templateContent.includes('Vue.component')) {
      findings.push({
        type: 'v-model-prop-event-change',
        message: 'v-model contract changed in Vue 3. Use modelValue/update:modelValue.',
        confidence: 'medium',
        filePath,
      });
    }

    // Transition class names in template
    if (templateContent.includes('v-enter-active') || templateContent.includes('v-leave-active')) {
      // Check for old v-enter / v-leave without -from
      if (templateContent.match(/\bv-enter\b(?!-)/)) {
        findings.push({
          type: 'transition-class-names',
          message: 'Found old v-enter class name. Use v-enter-from in Vue 3.',
          confidence: 'high',
          filePath,
        });
      }
    }

    // router-link tag/append
    if (templateContent.includes('<router-link')) {
      if (templateContent.match(/<router-link[^>]*\btag\s*=/)) {
        findings.push({
          type: 'router-link-tag',
          message: 'tag prop removed from router-link. Use scoped slot.',
          confidence: 'medium',
          filePath,
        });
      }
      if (templateContent.match(/<router-link[^>]*\bappend\b/)) {
        findings.push({
          type: 'router-link-append',
          message: 'append prop removed from router-link.',
          confidence: 'medium',
          filePath,
        });
      }
    }
  }

  // ── Script-based detections ─────────────────────────────────
  if (scriptContent) {
    // Vue.extend()
    if (scriptContent.includes('Vue.extend(')) {
      findings.push({
        type: 'Vue-extend',
        message: 'Found Vue.extend(). Use defineComponent() in Vue 3.',
        confidence: 'high',
        filePath,
      });
    }

    // Vue.set()
    if (scriptContent.includes('Vue.set(')) {
      findings.push({
        type: 'Vue-set',
        message: 'Found Vue.set(). In Vue 3, direct assignment works: target[key] = value.',
        confidence: 'high',
        filePath,
      });
    }

    // Vue.delete()
    if (scriptContent.includes('Vue.delete(')) {
      findings.push({
        type: 'Vue-delete',
        message: 'Found Vue.delete(). In Vue 3, use: delete target[key].',
        confidence: 'high',
        filePath,
      });
    }

    // Vue.filter()
    if (scriptContent.includes('Vue.filter(')) {
      findings.push({
        type: 'Vue-filter-remove',
        message: 'Found Vue.filter(). Filters are removed in Vue 3. Use computed properties or methods.',
        confidence: 'low',
        filePath,
      });
    }

    // $on, $off, $once
    if (scriptContent.includes('$on(')) {
      findings.push({
        type: 'event-bus-on',
        message: "Found $on(). Event bus removed in Vue 3. Use mitt or composables.",
        confidence: 'low',
        filePath,
      });
    }
    if (scriptContent.includes('$off(')) {
      findings.push({
        type: 'event-bus-off',
        message: "Found $off(). Event bus removed in Vue 3.",
        confidence: 'low',
        filePath,
      });
    }
    if (scriptContent.includes('$once(')) {
      findings.push({
        type: 'event-bus-once',
        message: "Found $once(). Removed in Vue 3.",
        confidence: 'low',
        filePath,
      });
    }

    // $listeners
    if (scriptContent.includes('$listeners')) {
      findings.push({
        type: 'listeners-to-attrs',
        message: 'Found $listeners. In Vue 3, $listeners are merged into $attrs.',
        confidence: 'high',
        filePath,
      });
    }

    // render(h) {
    if (scriptContent.match(/\brender\s*\(\s*h\s*\)/)) {
      findings.push({
        type: 'render-h-import',
        message: 'render(h) pattern found. In Vue 3, import { h } from "vue" instead.',
        confidence: 'high',
        filePath,
      });
    }

    // functional: true
    if (scriptContent.match(/\bfunctional\s*:\s*true\b/)) {
      findings.push({
        type: 'functional-component',
        message: 'functional: true no longer needed. Functional components are plain functions in Vue 3.',
        confidence: 'low',
        filePath,
      });
    }

    // Lifecycle hooks
    if (scriptContent.match(/\bbeforeDestroy\b/)) {
      findings.push({
        type: 'lifecycle-beforeDestroy-to-beforeUnmount',
        message: 'Found beforeDestroy. Rename to beforeUnmount.',
        confidence: 'high',
        filePath,
      });
    }
    if (scriptContent.match(/\bdestroyed\b/)) {
      findings.push({
        type: 'lifecycle-destroyed-to-unmounted',
        message: 'Found destroyed. Rename to unmounted.',
        confidence: 'high',
        filePath,
      });
    }
    if (scriptContent.match(/\bbeforeCreate\b/)) {
      findings.push({
        type: 'lifecycle-beforeCreate-to-setup',
        message: 'Found beforeCreate. In Vue 3 with Composition API, logic goes in setup().',
        confidence: 'low',
        filePath,
      });
    }
    if (scriptContent.match(/\bcreated\b/) && !scriptContent.match(/\bcreated\(/)) {
      findings.push({
        type: 'lifecycle-created-to-setup',
        message: 'Found created hook. In Vue 3 with Composition API, logic goes in setup().',
        confidence: 'low',
        filePath,
      });
    }

    // $scopedSlots
    if (scriptContent.includes('$scopedSlots')) {
      findings.push({
        type: 'scopedSlots-to-slots',
        message: 'Found $scopedSlots. In Vue 3, both slots and scopedSlots are unified under $slots.',
        confidence: 'high',
        filePath,
      });
    }

    // Router patterns
    if (scriptContent.includes('new Router(')) {
      findings.push({
        type: 'router-new-route',
        message: 'Found new Router(). Use createRouter() in Vue Router 4.',
        confidence: 'high',
        filePath,
      });
    }

    // Vuex patterns
    if (scriptContent.includes('$store.')) {
      findings.push({
        type: 'vuex-store',
        message: 'Found $store. Consider migrating to Pinia (recommended Vue 3 state management).',
        confidence: 'low',
        filePath,
      });
    }
    ['mapState', 'mapGetters', 'mapMutations', 'mapActions'].forEach((fn) => {
      if (scriptContent.includes(`${fn}(`)) {
        findings.push({
          type: `vuex-${fn}`,
          message: `Found ${fn}(). If migrating to Pinia, this pattern changes.`,
          confidence: 'low',
          filePath,
        });
      }
    });

    // v-model: value/input prop/event
    if (scriptContent.match(/\bvalue\b.*\bemit\b|\bemit\b.*\binput\b/)) {
      findings.push({
        type: 'v-model-prop-event-change',
        message: 'Possible v-model pattern using value/input. In Vue 3, use modelValue/update:modelValue.',
        confidence: 'medium',
        filePath,
      });
    }
  }

  return findings;
}

/**
 * Apply high-confidence transformations directly (no LLM needed).
 * Returns the transformed source or null if no high-conf transforms apply.
 */
export function applyHighConfidenceTransforms(source, findings) {
  const highConfidence = findings.filter((f) => f.confidence === 'high');
  if (highConfidence.length === 0) return null;

  let result = source;

  for (const finding of highConfidence) {
    switch (finding.type) {
      case 'lifecycle-beforeDestroy-to-beforeUnmount':
        result = result.replace(/\bbeforeDestroy\b/g, 'beforeUnmount');
        break;

      case 'lifecycle-destroyed-to-unmounted':
        result = result.replace(/\bdestroyed\b/g, 'unmounted');
        break;

      case 'Vue-set':
        result = replaceVueSet(result);
        break;

      case 'Vue-delete':
        result = replaceVueDelete(result);
        break;

      case 'Vue-extend':
        result = replaceVueExtend(result);
        break;

      case 'v-bind-sync-to-v-model':
        result = replaceSyncToVModel(result);
        break;

      case 'slot-attribute-to-v-slot':
        result = replaceSlotAttribute(result);
        break;

      case 'slot-scope-to-v-slot':
        result = replaceSlotScope(result);
        break;

      case 'native-modifier-removed':
        result = result.replace(/@(\w+)\.native\b/g, '@$1');
        break;

      case 'render-h-import':
        result = replaceRenderH(result);
        break;

      case 'listeners-to-attrs':
        result = result.replace(/\$listeners/g, '$attrs');
        break;

      case 'scopedSlots-to-slots':
        result = result.replace(/\$scopedSlots/g, '$slots');
        break;

      case 'router-new-route':
        result = replaceNewRouter(result);
        break;

      case 'transition-class-names':
        result = replaceTransitionClasses(result);
        break;
    }
  }

  return result;
}

// ── Individual transform helpers ──────────────────────────────

function replaceVueSet(source) {
  return source.replace(
    /Vue\.set\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+)\s*\)/g,
    (match, target, key, value) => {
      const cleanKey = key.trim().replace(/^['"]|['"]$/g, '');
      if (/^\d+$/.test(cleanKey) || /^[a-zA-Z_$][\w$]*$/.test(cleanKey)) {
        return `${target.trim()}.${cleanKey} = ${value.trim()}`;
      }
      return `${target.trim()}[${key.trim()}] = ${value.trim()}`;
    }
  );
}

function replaceVueDelete(source) {
  return source.replace(/Vue\.delete\(\s*(.+?)\s*,\s*(.+?)\s*\)/g, 'delete $1[$2]');
}

function replaceVueExtend(source) {
  return source.replace(/\bVue\.extend\(\s*\{/g, 'defineComponent({');
}

function replaceSyncToVModel(source) {
  return source.replace(/v-bind:(\w+)\.sync\b/g, 'v-model:$1');
}

function replaceSlotAttribute(source) {
  return source.replace(/\bslot\s*=\s*["']([^"']+)["']/g, 'v-slot:$1');
}

function replaceSlotScope(source) {
  return source.replace(/\bslot-scope\s*=\s*["']([^"']+)["']/g, 'v-slot:default="$1"');
}

function replaceRenderH(source) {
  return source
    .replace(/\brender\s*\(\s*h\s*\)/g, 'render()')
    .replace(/import\s+\{([^}]*)\}\s+from\s+['"]vue['"]/g, (match, imports) => {
      if (match.includes('h')) return match;
      return `import { h, ${imports.trim()} } from 'vue'`;
    });
}

function replaceNewRouter(source) {
  return source
    .replace(/\bnew\s+Router\s*\(/g, 'createRouter(')
    .replace(/import\s+\{([^}]*)\}\s+from\s+['"]vue-router['"]/g, (match, imports) => {
      if (match.includes('createRouter')) return match;
      return `import { createRouter, ${imports.trim()} } from 'vue-router'`;
    });
}

function replaceTransitionClasses(source) {
  let result = source;
  result = result.replace(/\bv-enter\b(?!-)/g, 'v-enter-from');
  result = result.replace(/\bv-leave\b(?!-)/g, 'v-leave-from');
  return result;
}