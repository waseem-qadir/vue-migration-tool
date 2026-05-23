#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LLMClient } from '../llm/client.js';
import { MigrationEngine } from '../parser/migration-engine.js';
import { findEnvFile } from '../utils/env-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('vue-migrate')
  .description('Migrate Vue 2 codebases to Vue 3 using AST rules with LLM fallback')
  .version('1.0.0')
  .requiredOption('--dir <path>', 'Directory containing Vue 2 files to migrate')
  .option('--dry-run', 'Preview changes without writing files', false)
  .option('--output <path>', 'Output directory for migrated files', './migrated-output')
  .option('--model <model>', 'Claude model to use', process.env.LLM_MODEL || 'claude-sonnet-4-20250514')
  .option('--no-llm', 'Skip LLM fallback (AST-only mode)', false)
  .parse(process.argv);

const options = program.opts();

async function main() {
  const dirPath = resolve(options.dir);

  if (!existsSync(dirPath)) {
    console.error(chalk.red(`Directory not found: ${dirPath}`));
    process.exit(1);
  }

  const envPath = findEnvFile(dirPath);
  if (envPath) {
    const { config } = await import('dotenv');
    config({ path: envPath, override: false });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!options.noLlm && !apiKey) {
    console.log(chalk.yellow('⚠ No ANTHROPIC_API_KEY found. Running in AST-only mode (no LLM fallback).'));
    console.log(chalk.yellow('  Set ANTHROPIC_API_KEY in your .env file or environment.\n'));
  }

  console.log(chalk.blue.bold('🔧 Vue Migration Tool v1.0.0'));
  console.log(chalk.gray(`  Source:     ${dirPath}`));
  console.log(chalk.gray(`  Dry run:    ${options.dryRun}`));
  console.log(chalk.gray(`  LLM mode:   ${options.noLlm ? 'disabled' : 'enabled'}`));
  console.log(chalk.gray(`  Model:      ${options.noLlm ? 'N/A' : options.model}\n`));

  // Initialize
  let llmClient = null;
  if (!options.noLlm && apiKey) {
    llmClient = new LLMClient(apiKey, options.model);
  }

  const engine = new MigrationEngine(llmClient, options);

  // Migrate
  const spinner = ora('Analyzing Vue files...').start();

  try {
    const results = await engine.migrateDirectory(dirPath);
    const summary = engine.summary();

    spinner.succeed(`Found ${results.length} Vue file(s)`);

    // Print findings per file
    console.log(chalk.bold('\n📋 Findings:\n'));

    for (const result of results) {
      if (result.error) {
        console.log(chalk.red(`  ✗ ${result.filePath} — ERROR: ${result.error}`));
        continue;
      }

      const findingCount = (result.findings || []).length;
      if (findingCount === 0) {
        console.log(chalk.gray(`  ✓ ${result.filePath} — No issues found`));
        continue;
      }

      console.log(chalk.white(`  📄 ${result.filePath}`));
      for (const finding of result.findings || []) {
        const icon =
          finding.confidence === 'high'
            ? chalk.green('  ●')
            : finding.confidence === 'medium'
              ? chalk.yellow('  ◐')
              : chalk.cyan('  ○');
        console.log(
          `    ${icon} ${chalk.gray(`[${finding.confidence}]`)} ${finding.message}`
        );
      }
      console.log('');
    }

    // Print diffs
    const changedFiles = results.filter((r) => r.diff);
    if (changedFiles.length > 0) {
      console.log(chalk.bold('🔀 Proposed Changes:\n'));
      for (const result of changedFiles) {
        console.log(chalk.cyan(`--- ${result.filePath}`));
        console.log(chalk.cyan(`+++ ${result.filePath} (migrated)`));
        console.log(chalk.white(result.diff));
        console.log('');
      }
    }

    // Write output (if not dry-run)
    if (!options.dryRun && changedFiles.length > 0) {
      spinner.start('Writing migrated files...');
      const outputDir = resolve(options.output);
      engine.writeTransformedFiles(outputDir);
      spinner.succeed(`Written ${changedFiles.length} file(s) to ${outputDir}`);
    }

    // Summary
    console.log(chalk.bold('📊 Summary:'));

    if (summary.totalFindings > 0) {
      console.log(
        chalk.green(`  🟢 High confidence:   ${summary.highConfidence}  (auto-fixed)`)
      );
      console.log(
        chalk.yellow(`  🟡 Medium confidence: ${summary.mediumConfidence}  (LLM or manual review)`)
      );
      console.log(
        chalk.cyan(`  🔵 Low confidence:    ${summary.lowConfidence}  (LLM or manual review)`)
      );
    }

    console.log(chalk.gray(`\n  Files scanned:  ${summary.totalFiles}`));
    console.log(chalk.gray(`  Files changed:  ${summary.filesChanged}`));
    if (summary.llmAttempts > 0) {
      console.log(chalk.gray(`  LLM calls:      ${summary.llmAttempts}`));
    }

    if (options.dryRun) {
      console.log(
        chalk.yellow('\n⚠  DRY RUN — no files were written. Run without --dry-run to apply changes.')
      );
    }
  } catch (err) {
    spinner.fail('Migration failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

main();