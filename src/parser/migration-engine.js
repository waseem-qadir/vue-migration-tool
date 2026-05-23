import fs, { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { createPatch } from 'diff';

/**
 * Migration engine that orchestrates the full migration pipeline.
 * 1. Parse SFC → find patterns
 * 2. Apply high-conf transforms → AST direct
 * 3. Low/medium patterns → LLM fallback with validate-or-retry
 * 4. Generate unified diff
 */
export class MigrationEngine {
  constructor(llmClient, options = {}) {
    this.llmClient = llmClient;
    this.options = options;
    this.results = [];
  }

  /**
   * Migrate a single Vue SFC file.
   */
  async migrateFile(filePath) {
    const source = readFileSync(filePath, 'utf-8');
    const { analyzeSFC, applyHighConfidenceTransforms } = await import(
      '../parser/sfc-parser.js'
    );

    const findings = analyzeSFC(source, filePath);
    if (findings.length === 0) {
      return {
        filePath,
        source,
        findings: [],
        transformed: null,
        diff: null,
        llmAttempts: 0,
      };
    }

    // Step 1: Apply high-confidence transforms
    let transformed = applyHighConfidenceTransforms(source, findings);
    const lowFindings = findings.filter(
      (f) => f.confidence === 'low' || f.confidence === 'medium'
    );
    let llmAttempts = 0;

    // Step 2: If there are low/medium confidence findings, use LLM
    if (lowFindings.length > 0 && this.llmClient) {
      const llmResult = await this.llmClient.transformComponent(
        transformed || source,
        filePath,
        findings
      );
      llmAttempts = llmResult.attempts || 0;

      if (llmResult.transformed) {
        transformed = llmResult.transformed;
      }
    }

    // Step 3: Generate diff
    const finalSource = transformed || source;
    const diff = transformed
      ? createPatch(filePath, source, finalSource, 'original', 'migrated')
      : null;

    const result = {
      filePath,
      source,
      transformed: finalSource,
      findings,
      diff,
      llmAttempts,
      changed: transformed != null && finalSource !== source,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Migrate all .vue files in a directory recursively.
   */
  async migrateDirectory(dirPath) {
    const files = this.collectVueFiles(dirPath);
    const results = [];

    for (const file of files) {
      try {
        const result = await this.migrateFile(file);
        results.push(result);
      } catch (err) {
        results.push({
          filePath: file,
          error: err.message,
          changed: false,
        });
      }
    }

    this.results = results;
    return results;
  }

  collectVueFiles(dirPath) {
    const files = [];
    const stack = [dirPath];

    while (stack.length > 0) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(current, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          stack.push(fullPath);
        } else if (entry.isFile() && extname(entry.name) === '.vue') {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Write all transformed files to disk.
   */
  writeTransformedFiles(outputDir) {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    for (const result of this.results) {
      if (result.transformed && result.changed) {
        const relativePath = basename(result.filePath);
        const outPath = join(outputDir, relativePath);
        writeFileSync(outPath, result.transformed, 'utf-8');
      }
    }
  }

  /**
   * Generate a summary report.
   */
  summary() {
    const total = this.results.length;
    const changed = this.results.filter((r) => r.changed).length;
    const errors = this.results.filter((r) => r.error).length;
    const highConf = this.results.reduce(
      (sum, r) =>
        sum + (r.findings || []).filter((f) => f.confidence === 'high').length,
      0
    );
    const medConf = this.results.reduce(
      (sum, r) =>
        sum + (r.findings || []).filter((f) => f.confidence === 'medium').length,
      0
    );
    const lowConf = this.results.reduce(
      (sum, r) =>
        sum + (r.findings || []).filter((f) => f.confidence === 'low').length,
      0
    );
    const llmCalls = this.results.reduce(
      (sum, r) => sum + (r.llmAttempts || 0),
      0
    );

    return {
      totalFiles: total,
      filesChanged: changed,
      filesWithErrors: errors,
      totalFindings: highConf + medConf + lowConf,
      highConfidence: highConf,
      mediumConfidence: medConf,
      lowConfidence: lowConf,
      llmAttempts: llmCalls,
      results: this.results,
    };
  }
}