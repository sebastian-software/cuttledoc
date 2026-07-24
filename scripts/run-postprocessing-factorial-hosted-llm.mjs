#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    screen: {
      type: 'string',
      default: join(
        repoRoot,
        'benchmarks/postprocessing/hosted-llm-target-complete-screen.json',
      ),
    },
    plan: {
      type: 'string',
      default: join(
        repoRoot,
        'benchmarks/postprocessing/hosted-llm-target-complete-plan.json',
      ),
    },
    ledger: {
      type: 'string',
      default: join(repoRoot, 'benchmarks/postprocessing/factorial-cells.json'),
    },
    'output-dir': {
      type: 'string',
      default: join(repoRoot, 'artifacts/postprocessing-factorial-local-plan-6'),
    },
    'results-subdir': {
      type: 'string',
      default: 'llm-hosted-target-complete-results',
    },
    'summary-output': {
      type: 'string',
      default: join(
        repoRoot,
        'benchmarks/postprocessing/hosted-llm-target-complete-results.json',
      ),
    },
    'decision-output': {
      type: 'string',
      default: join(
        repoRoot,
        'benchmarks/postprocessing/hosted-llm-target-complete-decision.json',
      ),
    },
    'estimate-output': {
      type: 'string',
      default: join(
        repoRoot,
        'benchmarks/postprocessing/hosted-llm-target-complete-estimate.json',
      ),
    },
    candidate: { type: 'string', default: 'all' },
    repetition: { type: 'string' },
    'budget-usd': { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

const command = positionals[0];
if (!['estimate', 'run', 'summarize', 'status', 'self-test'].includes(command)) {
  throw new Error(
    'usage: node scripts/run-postprocessing-factorial-hosted-llm.mjs ' +
    '<estimate|run|summarize|status|self-test> [options]',
  );
}

const paths = {
  screen: resolve(values.screen),
  plan: resolve(values.plan),
  ledger: resolve(values.ledger),
  output: resolve(values['output-dir']),
  summary: resolve(values['summary-output']),
  decision: resolve(values['decision-output']),
  estimate: resolve(values['estimate-output']),
};
paths.documents = join(paths.output, 'llm-documents');
paths.results = join(paths.output, values['results-subdir']);

if (command === 'estimate') {
  await estimateCost();
} else if (command === 'run') {
  await runStage();
} else if (command === 'summarize') {
  await summarize();
} else if (command === 'status') {
  await printStatus();
} else {
  await selfTest();
}

async function loadContract() {
  const [screenBytes, planBytes, ledgerBytes] = await Promise.all([
    readFile(paths.screen),
    readFile(paths.plan),
    readFile(paths.ledger),
  ]);
  const screen = JSON.parse(screenBytes);
  const plan = JSON.parse(planBytes);
  const ledger = JSON.parse(ledgerBytes);
  await validateContract(screen, plan, ledger);
  return { screen, plan, ledger, screenBytes, planBytes };
}

async function validateContract(screen, plan, ledger) {
  const candidateCount = screen.candidates.length;
  const targetCount =
    screen.scope.document_count * screen.scope.sections_per_document;
  const targetModelPairs = targetCount * candidateCount;
  const requestCount = targetModelPairs * screen.generation.repetitions;
  if (
    typeof screen.id !== 'string' ||
    typeof plan.id !== 'string' ||
    screen.plan_id !== ledger.plan_id ||
    screen.plan_revision !== ledger.plan_revision ||
    plan.plan_id !== screen.plan_id ||
    plan.plan_revision !== screen.plan_revision ||
    plan.screen_path !== repositoryPath(paths.screen) ||
    screen.scope.request_mode !== 'single-target-section' ||
    !Number.isInteger(screen.scope.document_count) ||
    screen.scope.document_count < 1 ||
    screen.scope.sections_per_document !== 6 ||
    screen.scope.document_ids.length !== screen.scope.document_count ||
    new Set(screen.scope.document_ids).size !== screen.scope.document_count ||
    candidateCount < 1 ||
    new Set(screen.candidates.map((candidate) => candidate.id)).size !==
      candidateCount ||
    screen.generation.repetitions !== 2 ||
    screen.generation.max_tokens !== 2048 ||
    screen.expected_counts.documents !== screen.scope.document_count ||
    screen.expected_counts.document_model_pairs !==
      screen.scope.document_count * candidateCount ||
    screen.expected_counts.target_model_pairs !== targetModelPairs ||
    screen.expected_counts.requests !== requestCount ||
    screen.expected_counts.section_outputs !== requestCount ||
    !Number.isInteger(
      screen.execution_policy.minimum_delay_between_requests_ms ?? 0,
    ) ||
    (screen.execution_policy.minimum_delay_between_requests_ms ?? 0) < 0 ||
    JSON.stringify(plan.candidates) !==
      JSON.stringify(screen.candidates.map((candidate) => candidate.id))
  ) {
    throw new Error('hosted target preflight identity or counts drifted');
  }
  const promptBytes = await readFile(join(
    repoRoot,
    screen.generation.prompt_path,
  ));
  if (sha256(promptBytes) !== screen.generation.prompt_sha256) {
    throw new Error('hosted target prompt digest drifted');
  }
  for (const source of [
    plan.selection.source_plan,
    plan.selection.source_decision,
  ]) {
    const bytes = await readFile(join(repoRoot, source.path));
    if (sha256(bytes) !== source.sha256) {
      throw new Error(`${source.path}: hosted source digest drifted`);
    }
  }
  const sourceScreen = JSON.parse(await readFile(
    join(
      repoRoot,
      'benchmarks/postprocessing/local-llm-gemma-target-complete-screen.json',
    ),
    'utf8',
  ));
  const sourceDocumentIds = new Set(sourceScreen.scope.document_ids);
  if (screen.scope.document_ids.some((id) => !sourceDocumentIds.has(id))) {
    throw new Error(
      'hosted challenge selection is not a subset of the frozen Gemma slice',
    );
  }
  const ledgerDocuments = new Map(
    ledger.llm_documents.map((document) => [document.id, document]),
  );
  if (screen.scope.document_ids.some((id) => !ledgerDocuments.has(id))) {
    throw new Error('hosted challenge document is absent from the factorial ledger');
  }
  const selectedLocales = [...new Set(screen.scope.document_ids.map((id) =>
    ledgerDocuments.get(id).locale))].sort();
  if (
    JSON.stringify([...(plan.selection.languages ?? [])].sort()) !==
      JSON.stringify(selectedLocales) ||
    plan.selection.documents !== screen.scope.document_count ||
    plan.selection.target_sections_per_document !==
      screen.scope.sections_per_document ||
    plan.selection.target_sections !== targetCount
  ) {
    throw new Error('hosted plan selection differs from the frozen screen subset');
  }
  for (const candidate of screen.candidates) {
    const manifestBytes = await readFile(join(
      repoRoot,
      candidate.model_manifest_path,
    ));
    const manifest = JSON.parse(manifestBytes);
    const policy = manifest.gateway?.request_policy;
    if (
      sha256(manifestBytes) !== candidate.model_manifest_sha256 ||
      manifest.id !== candidate.id ||
      policy?.zdr !== true ||
      policy?.allow_fallbacks !== false ||
      policy?.require_parameters !== true ||
      policy?.data_collection !== 'deny' ||
      !Array.isArray(policy?.only) ||
      policy.only.length !== 1 ||
      policy.only[0] !== manifest.gateway.provider_slug
    ) {
      throw new Error(`${candidate.id}: hosted manifest or routing policy drifted`);
    }
  }
}

async function selectedDocuments(screen) {
  const documents = [];
  for (const id of screen.scope.document_ids) {
    const path = join(paths.documents, `${id}.json`);
    const document = JSON.parse(await readFile(path, 'utf8'));
    if (
      document.id !== id ||
      document.plan_revision !== screen.plan_revision ||
      document.model_input.sections.length !== screen.scope.sections_per_document
    ) {
      throw new Error(`${id}: invalid materialized hosted input`);
    }
    documents.push({ path, document, bytes: await readFile(path) });
  }
  return documents;
}

async function selectedCandidates(screen) {
  const selected = values.candidate === 'all'
    ? screen.candidates
    : screen.candidates.filter((candidate) => candidate.id === values.candidate);
  if (selected.length === 0) {
    throw new Error(`unknown hosted candidate: ${values.candidate}`);
  }
  const candidates = [];
  for (const candidate of selected) {
    const bytes = await readFile(join(repoRoot, candidate.model_manifest_path));
    candidates.push({ ...candidate, manifest: JSON.parse(bytes), bytes });
  }
  return candidates;
}

function renderPrompt(template, document, targetIndex) {
  const input = document.model_input;
  const target = {
    position: targetIndex,
    text: input.sections[targetIndex].text,
  };
  const context = input.sections
    .filter((_, index) => index !== targetIndex)
    .map((section, index) => ({
      position: index < targetIndex ? index : index + 1,
      text: section.text,
    }));
  const replacements = {
    '{{language}}': input.language,
    '{{locale}}': input.locale,
    '{{domain}}': input.domain,
    '{{backend}}': input.asr_backend,
    '{{error_profile}}': input.error_profile,
    '{{glossary}}': JSON.stringify(input.glossary),
    '{{target_section}}': JSON.stringify(target, null, 2),
    '{{context_sections}}': JSON.stringify(context, null, 2),
  };
  let rendered = template;
  for (const [marker, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(marker, value);
  }
  if (rendered.includes('{{') || rendered.includes('}}')) {
    throw new Error('hosted prompt has an unresolved template marker');
  }
  return rendered;
}

function jobsFor(screen, documents, candidateId, repetition) {
  const jobs = documents.flatMap(({ document, path, bytes }) =>
    document.model_input.sections.map((_, targetIndex) => ({
      document,
      documentPath: path,
      documentSha256: sha256(bytes),
      targetIndex,
      repetition,
      requestId: `${document.id}--target-${targetIndex}`,
    })));
  return jobs.sort((left, right) => {
    const key = (job) => sha256(Buffer.from(
      `${screen.id}|${candidateId}|${repetition}|` +
      `${job.document.id}|${job.targetIndex}`,
    ));
    return key(left).localeCompare(key(right));
  });
}

async function estimateCost() {
  const { screen, plan, screenBytes, planBytes } = await loadContract();
  const [documents, candidates, promptTemplate] = await Promise.all([
    selectedDocuments(screen),
    selectedCandidates(screen),
    readFile(join(repoRoot, screen.generation.prompt_path), 'utf8'),
  ]);
  const promptCodePoints = documents.flatMap(({ document }) =>
    document.model_input.sections.map((_, targetIndex) =>
      [...renderPrompt(promptTemplate, document, targetIndex)].length));
  const targetCodePoints = documents.flatMap(({ document }) =>
    document.model_input.sections.map((section) =>
      [...JSON.stringify({ text: section.text })].length));
  const candidateEstimates = candidates.map((candidate) => {
    const pricing = candidate.manifest.gateway.pricing_snapshot_usd_per_token;
    const hardInputTokens = sum(promptCodePoints);
    const likelyInputTokens = Math.ceil(hardInputTokens / 4);
    const hardOutputTokens =
      promptCodePoints.length * screen.generation.max_tokens;
    const likelyReasoningTokensPerRequest =
      ['low'].includes(candidate.manifest.request_defaults.reasoning?.effort)
        ? 768
        : 0;
    const likelyOutputTokens = Math.ceil(sum(targetCodePoints) / 3) +
      promptCodePoints.length * likelyReasoningTokensPerRequest;
    const cost = (inputTokens, outputTokens) =>
      inputTokens * Number(pricing.prompt) +
      outputTokens * Number(pricing.completion);
    return {
      candidate: candidate.id,
      requested_model: candidate.manifest.model.requested_id,
      provider_slug: candidate.manifest.gateway.provider_slug,
      pricing_snapshot_usd_per_token: {
        prompt: pricing.prompt,
        completion: pricing.completion,
      },
      requests_per_repeat: promptCodePoints.length,
      rendered_prompt_code_points_per_repeat: hardInputTokens,
      likely_input_tokens_per_repeat: likelyInputTokens,
      maximum_configured_completion_tokens_per_repeat: hardOutputTokens,
      likely_reasoning_tokens_per_request: likelyReasoningTokensPerRequest,
      likely_output_tokens_per_repeat: likelyOutputTokens,
      likely_cost_per_repeat_usd: cost(likelyInputTokens, likelyOutputTokens),
      conservative_planning_envelope_per_repeat_usd:
        cost(hardInputTokens, hardOutputTokens),
      recommended_runner_budget_per_repeat_usd:
        roundUpCents(cost(hardInputTokens, hardOutputTokens)),
    };
  });
  const perRepeatEnvelope = sum(candidateEstimates.map((entry) =>
    entry.conservative_planning_envelope_per_repeat_usd));
  const report = {
    schema_version: '1.0.0',
    id: `${plan.id}-cost-estimate-1`,
    plan_id: plan.id,
    plan_sha256: sha256(planBytes),
    screen_id: screen.id,
    screen_sha256: sha256(screenBytes),
    captured_at: new Date().toISOString(),
    method: {
      hard_input_envelope:
        'One input token per rendered Unicode code point.',
      likely_input_estimate:
        'One input token per four rendered Unicode code points.',
      hard_output_envelope:
        'Every request consumes the configured completion-token maximum.',
      likely_output_estimate:
        'One output token per three Unicode code points in the raw target JSON, plus 768 hidden reasoning tokens per request for low-reasoning routes.',
      limitation:
        'Only provider-reported usage and cost are authoritative after execution.',
    },
    scope: {
      documents: documents.length,
      targets_per_document: screen.scope.sections_per_document,
      requests_per_candidate_per_repeat: promptCodePoints.length,
      candidates: candidateEstimates.length,
      maximum_repeats: screen.generation.repetitions,
    },
    rendered_inputs: {
      minimum_code_points: Math.min(...promptCodePoints),
      maximum_code_points: Math.max(...promptCodePoints),
      mean_code_points: sum(promptCodePoints) / promptCodePoints.length,
      total_code_points_per_candidate_repeat: sum(promptCodePoints),
    },
    candidates: candidateEstimates,
    aggregate: {
      likely_cost_repeat_1_all_candidates_usd: sum(candidateEstimates.map(
        (entry) => entry.likely_cost_per_repeat_usd,
      )),
      conservative_planning_envelope_repeat_1_all_candidates_usd:
        perRepeatEnvelope,
      conservative_planning_envelope_two_repeats_all_candidates_usd:
        perRepeatEnvelope * screen.generation.repetitions,
      recommended_runner_budget_repeat_1_all_candidates_usd: sum(
        candidateEstimates.map((entry) =>
          entry.recommended_runner_budget_per_repeat_usd),
      ),
      recommended_runner_budget_two_repeats_all_candidates_usd: sum(
        candidateEstimates.map((entry) =>
          entry.recommended_runner_budget_per_repeat_usd),
      ) * screen.generation.repetitions,
    },
    authorization_boundary:
      'The estimate does not authorize requests. The runner additionally ' +
      'requires an explicit per-invocation USD budget.',
  };
  await atomicJson(paths.estimate, report);
  process.stdout.write(`${JSON.stringify(report.aggregate, null, 2)}\n`);
}

async function runStage() {
  const repetition = positiveInteger(values.repetition, '--repetition');
  if (![1, 2].includes(repetition)) {
    throw new Error('--repetition must be 1 or 2');
  }
  const budget = positiveNumber(values['budget-usd'], '--budget-usd');
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const { screen, plan } = await loadContract();
  const [documents, candidates, promptTemplate] = await Promise.all([
    selectedDocuments(screen),
    selectedCandidates(screen),
    readFile(join(repoRoot, screen.generation.prompt_path), 'utf8'),
  ]);
  const estimate = JSON.parse(await readFile(paths.estimate, 'utf8'));
  if (
    estimate.plan_id !== plan.id ||
    estimate.screen_id !== screen.id
  ) {
    throw new Error('cost estimate differs from the active hosted plan');
  }
  if (repetition === 2) {
    const decision = JSON.parse(await readFile(paths.decision, 'utf8'));
    for (const candidate of candidates) {
      const disposition = decision.candidates.find((entry) =>
        entry.candidate === candidate.id)?.disposition;
      if (disposition !== 'advance-to-repeat-2' &&
          disposition !== 'continue-repeat-2') {
        throw new Error(
          `${candidate.id}: repeat 2 is not authorized by the repeat-1 decision`,
        );
      }
    }
  }
  const sourceRevision = gitRevision();
  let chargedThisInvocation = 0;
  for (const candidate of candidates) {
    const estimateEntry = estimate.candidates.find((entry) =>
      entry.candidate === candidate.id);
    if (!estimateEntry) throw new Error(`${candidate.id}: missing cost estimate`);
    const jobs = jobsFor(screen, documents, candidate.id, repetition);
    let completed = 0;
    let resumed = 0;
    for (const job of jobs) {
      const output = resultPath(candidate.id, job, repetition);
      if (!values.force && await validExisting(
        output,
        screen,
        candidate,
        job,
      )) {
        resumed += 1;
        continue;
      }
      const stop = await irreversibleStop(
        screen,
        plan,
        candidate.id,
        repetition,
        jobs.length,
      );
      if (stop !== null) {
        process.stderr.write(
          `hosted llm: ${candidate.id} stopped early: ${stop}\n`,
        );
        break;
      }
      const renderedPrompt = renderPrompt(
        promptTemplate,
        job.document,
        job.targetIndex,
      );
      const requestEnvelope = requestCostEnvelope(
        candidate.manifest,
        screen,
        renderedPrompt,
      );
      if (chargedThisInvocation + requestEnvelope > budget + 1e-12) {
        throw new Error(
          `USD budget exhausted before ${candidate.id}: charged/estimated ` +
          `${chargedThisInvocation.toFixed(6)}, next conservative envelope ` +
          `${requestEnvelope.toFixed(6)}, budget ${budget.toFixed(6)}`,
        );
      }
      const rateLimitDeferrals = [];
      let response;
      let terminalResponseFailure;
      while (response === undefined) {
        try {
          response = await requestCorrection(
            candidate.manifest,
            screen,
            renderedPrompt,
            apiKey,
          );
        } catch (error) {
          if (error.code === 'OPENROUTER_TERMINAL_RESPONSE') {
            terminalResponseFailure = error;
            break;
          }
          const maximumDeferrals =
            screen.execution_policy
              .maximum_explicit_unbilled_429_deferrals_per_logical_request;
          if (
            error.code !== 'OPENROUTER_UNBILLED_RATE_LIMIT' ||
            rateLimitDeferrals.length >= maximumDeferrals
          ) {
            throw error;
          }
          rateLimitDeferrals.push({
            retry_after_ms: error.retryAfterMs,
            provider: error.provider,
          });
          process.stderr.write(
            `hosted llm: ${candidate.id} explicit unbilled 429; ` +
            `deferring ${error.retryAfterMs} ms ` +
            `(${rateLimitDeferrals.length}/${maximumDeferrals})\n`,
          );
          await delay(error.retryAfterMs);
        }
      }
      if (terminalResponseFailure !== undefined) {
        const result = buildTerminalResponseFailureResult({
          screen,
          candidate,
          job,
          sourceRevision,
          renderedPrompt,
          failure: terminalResponseFailure,
          rateLimitDeferrals,
        });
        await atomicJson(output, result);
        const failureCost = terminalResponseFailure.costUsd ??
          terminalResponseFailure.estimatedCostUsd;
        if (Number.isFinite(failureCost)) chargedThisInvocation += failureCost;
        completed += 1;
        process.stdout.write(
          `hosted llm: ${candidate.id} ${job.requestId} repeat ${repetition} ` +
          `(${completed + resumed}/${jobs.length}) parser=terminal-invalid ` +
          `cost=${Number.isFinite(failureCost)
            ? `$${formatUsd(failureCost)}`
            : 'unknown'}\n`,
        );
        continue;
      }
      response.rateLimitDeferrals = rateLimitDeferrals;
      const parsed = parseTargetOutput(response.text);
      const reachedLimit = response.finishReason === 'length';
      const result = buildResult({
        screen,
        candidate,
        job,
        sourceRevision,
        renderedPrompt,
        response,
        parsed,
        reachedLimit,
      });
      await atomicJson(output, result);
      chargedThisInvocation += Number.isFinite(response.costUsd)
        ? response.costUsd
        : response.estimatedCostUsd;
      completed += 1;
      process.stdout.write(
        `hosted llm: ${candidate.id} ${job.requestId} repeat ${repetition} ` +
        `(${completed + resumed}/${jobs.length}) ` +
        `parser=${parsed.valid ? 'ok' : 'invalid'} ` +
        `cost=$${formatUsd(response.costUsd ?? response.estimatedCostUsd)}\n`,
      );
      const minimumDelay =
        screen.execution_policy.minimum_delay_between_requests_ms ?? 0;
      if (minimumDelay > 0) {
        await delay(minimumDelay);
      }
    }
  }
  process.stdout.write(
    `Invocation charged or estimated cost: $${formatUsd(chargedThisInvocation)}\n`,
  );
}

async function requestCorrection(manifest, screen, prompt, apiKey) {
  const policy = manifest.gateway.request_policy;
  const defaults = manifest.request_defaults;
  const responseFormat = defaults.response_format.type === 'json_object'
    ? { type: 'json_object' }
    : {
        type: 'json_schema',
        json_schema: {
          name: screen.generation.output_contract.replaceAll('-', '_'),
          strict: true,
          schema: screen.generation.structured_output.schema,
        },
      };
  const body = {
    model: manifest.model.requested_id,
    messages: [{ role: 'user', content: prompt }],
    response_format: responseFormat,
    provider: {
      only: policy.only,
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: 'deny',
      zdr: true,
    },
  };
  body[defaults.token_limit_field] = screen.generation.max_tokens;
  if (defaults.temperature !== null) body.temperature = defaults.temperature;
  if (defaults.seed !== null) body.seed = defaults.seed;
  if (defaults.reasoning !== null) body.reasoning = defaults.reasoning;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    screen.generation.timeout_ms,
  );
  const started = performance.now();
  let response;
  try {
    response = await fetch(manifest.gateway.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const durationMs = performance.now() - started;
  const responseText = await response.text();
  if (!response.ok) {
    if (response.status === 429) {
      let metadata = {};
      try {
        metadata = JSON.parse(responseText).error?.metadata ?? {};
      } catch {
        // The Retry-After header remains the bounded fallback.
      }
      const retryAfterSeconds = Number(
        metadata.retry_after_seconds ??
        response.headers.get('retry-after') ??
        1,
      );
      const error = new Error(
        `OpenRouter explicit unbilled HTTP 429 from ` +
        `${metadata.provider_name ?? '<unknown provider>'}`,
      );
      error.code = 'OPENROUTER_UNBILLED_RATE_LIMIT';
      error.provider = metadata.provider_name ?? null;
      error.retryAfterMs = Math.min(
        60_000,
        Math.max(1_000, Math.ceil(retryAfterSeconds * 1000)) + 250,
      );
      throw error;
    }
    throw new Error(
      `OpenRouter HTTP ${response.status}: ${responseText.slice(0, 800)}`,
    );
  }
  const envelope = JSON.parse(responseText);
  const choice = envelope.choices?.[0];
  const content = choice?.message?.content;
  const usage = envelope.usage ?? {};
  const costUsd = Number.isFinite(usage.cost) ? usage.cost : null;
  const pricing = manifest.gateway.pricing_snapshot_usd_per_token;
  const estimatedCostUsd =
    (usage.prompt_tokens ?? 0) * Number(pricing.prompt) +
    (usage.completion_tokens ?? 0) * Number(pricing.completion);
  if (typeof content !== 'string') {
    const error = new Error(
      `OpenRouter response ${envelope.id ?? '<unknown>'} has no string content`,
    );
    error.code = 'OPENROUTER_TERMINAL_RESPONSE';
    error.responseBodySha256 = sha256(Buffer.from(responseText));
    error.responseId = envelope.id ?? null;
    error.servedModel = envelope.model ?? null;
    error.servedProvider = envelope.provider ?? null;
    error.finishReason = choice?.finish_reason ?? null;
    error.durationMs = durationMs;
    error.promptTokens = usage.prompt_tokens ?? null;
    error.completionTokens = usage.completion_tokens ?? null;
    error.totalTokens = usage.total_tokens ?? null;
    error.costUsd = costUsd;
    error.estimatedCostUsd =
      usage.prompt_tokens === undefined && usage.completion_tokens === undefined
        ? null
        : estimatedCostUsd;
    error.isByok = usage.is_byok ?? false;
    throw error;
  }
  if (envelope.provider !== manifest.gateway.provider_name) {
    throw new Error(
      `provider pin failed: expected ${manifest.gateway.provider_name}, ` +
      `received ${envelope.provider ?? '<missing>'}`,
    );
  }
  if (!manifest.model.allowed_response_ids.includes(envelope.model)) {
    throw new Error(
      `model identity drift: received ${envelope.model ?? '<missing>'}`,
    );
  }
  return {
    text: content.trim(),
    responseId: envelope.id ?? null,
    servedModel: envelope.model,
    servedProvider: envelope.provider,
    finishReason: choice?.finish_reason ?? null,
    durationMs,
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    costUsd,
    estimatedCostUsd,
    isByok: usage.is_byok ?? false,
  };
}

function parseTargetOutput(rawText) {
  let payload = rawText.trim();
  let transportEnvelope = 'bare-json';
  if (payload.startsWith('```json\n') && payload.endsWith('\n```')) {
    payload = payload.slice('```json\n'.length, -'\n```'.length);
    transportEnvelope = 'markdown-json-fence';
  }
  try {
    const value = JSON.parse(payload);
    if (
      value === null ||
      Array.isArray(value) ||
      typeof value !== 'object' ||
      JSON.stringify(Object.keys(value).sort()) !== '["text"]' ||
      typeof value.text !== 'string' ||
      value.text.trim().length === 0
    ) {
      return {
        valid: false,
        error: 'Output must contain exactly one non-empty text field',
        text: null,
        transportEnvelope,
      };
    }
    return {
      valid: true,
      error: null,
      text: value.text,
      transportEnvelope,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      text: null,
      transportEnvelope,
    };
  }
}

function buildResult({
  screen,
  candidate,
  job,
  sourceRevision,
  renderedPrompt,
  response,
  parsed,
  reachedLimit,
}) {
  const target = job.document.model_input.sections[job.targetIndex];
  return {
    schema_version: '1.0.0',
    id: `${candidate.id}--${job.requestId}--repeat-${job.repetition}`,
    screen_id: screen.id,
    plan_id: screen.plan_id,
    plan_revision: screen.plan_revision,
    source_revision: sourceRevision,
    captured_at: new Date().toISOString(),
    candidate: {
      manifest_id: candidate.id,
      role: candidate.role,
      model: candidate.manifest.model,
      gateway: {
        name: candidate.manifest.gateway.name,
        provider_slug: candidate.manifest.gateway.provider_slug,
        provider_name: candidate.manifest.gateway.provider_name,
        request_policy: candidate.manifest.gateway.request_policy,
      },
      runtime: 'OpenRouter chat completions API',
    },
    document: {
      id: job.document.id,
      path: repositoryPath(job.documentPath),
      sha256: job.documentSha256,
      locale: job.document.model_input.locale,
      tts_engine: job.document.dimensions.tts_engine,
      voice_slot_id: job.document.dimensions.voice_slot_id,
      realization_id: job.document.dimensions.realization_id,
      stt_model: job.document.dimensions.stt_model,
      target_index: job.targetIndex,
      target_section_id: target.id,
    },
    prompt: {
      id: screen.generation.prompt_id,
      sha256: screen.generation.prompt_sha256,
      rendered_sha256: sha256(Buffer.from(renderedPrompt)),
      reference_visible_to_model: false,
    },
    repetition: job.repetition,
    generation: {
      seed: candidate.manifest.request_defaults.seed,
      temperature: candidate.manifest.request_defaults.temperature,
      reasoning: candidate.manifest.request_defaults.reasoning,
      max_tokens: screen.generation.max_tokens,
      finish_reason: response.finishReason,
      reached_token_limit: reachedLimit,
    },
    measurements: {
      model_load_ms: null,
      first_token_ms: null,
      complete_generation_ms: response.durationMs,
      prompt_tokens: response.promptTokens,
      generation_tokens: response.completionTokens,
      prompt_tokens_per_second: null,
      generation_tokens_per_second:
        response.completionTokens === null || response.durationMs <= 0
          ? null
          : response.completionTokens / (response.durationMs / 1000),
      cost_usd: response.costUsd,
      pricing_estimated_cost_usd: response.estimatedCostUsd,
    },
    response: {
      id: response.responseId,
      served_model: response.servedModel,
      served_provider: response.servedProvider,
      total_tokens: response.totalTokens,
      is_byok: response.isByok,
      rate_limit_deferrals_before_response:
        response.rateLimitDeferrals ?? [],
    },
    output: {
      raw_text: response.text,
      raw_text_sha256: sha256(Buffer.from(response.text)),
      token_ids: null,
      parser: {
        valid: parsed.valid,
        error: parsed.error,
        transport_envelope: parsed.transportEnvelope,
      },
      sections: parsed.valid
        ? [{ id: target.id, text: parsed.text }]
        : [],
      patches: null,
      mechanically_accepted: parsed.valid && !reachedLimit,
    },
    environment: {
      node: process.version,
      service: 'OpenRouter',
    },
  };
}

function buildTerminalResponseFailureResult({
  screen,
  candidate,
  job,
  sourceRevision,
  renderedPrompt,
  failure,
  rateLimitDeferrals,
}) {
  const target = job.document.model_input.sections[job.targetIndex];
  return {
    schema_version: '1.0.0',
    id: `${candidate.id}--${job.requestId}--repeat-${job.repetition}`,
    screen_id: screen.id,
    plan_id: screen.plan_id,
    plan_revision: screen.plan_revision,
    source_revision: sourceRevision,
    captured_at: new Date().toISOString(),
    candidate: {
      manifest_id: candidate.id,
      role: candidate.role,
      model: candidate.manifest.model,
      gateway: {
        name: candidate.manifest.gateway.name,
        provider_slug: candidate.manifest.gateway.provider_slug,
        provider_name: candidate.manifest.gateway.provider_name,
        request_policy: candidate.manifest.gateway.request_policy,
      },
      runtime: 'OpenRouter chat completions API',
    },
    document: {
      id: job.document.id,
      path: repositoryPath(job.documentPath),
      sha256: job.documentSha256,
      locale: job.document.model_input.locale,
      tts_engine: job.document.dimensions.tts_engine,
      voice_slot_id: job.document.dimensions.voice_slot_id,
      realization_id: job.document.dimensions.realization_id,
      stt_model: job.document.dimensions.stt_model,
      target_index: job.targetIndex,
      target_section_id: target.id,
    },
    prompt: {
      id: screen.generation.prompt_id,
      sha256: screen.generation.prompt_sha256,
      rendered_sha256: sha256(Buffer.from(renderedPrompt)),
      reference_visible_to_model: false,
    },
    repetition: job.repetition,
    generation: {
      seed: candidate.manifest.request_defaults.seed,
      temperature: candidate.manifest.request_defaults.temperature,
      reasoning: candidate.manifest.request_defaults.reasoning,
      max_tokens: screen.generation.max_tokens,
      finish_reason: failure.finishReason,
      reached_token_limit: failure.finishReason === 'length',
    },
    measurements: {
      model_load_ms: null,
      first_token_ms: null,
      complete_generation_ms: failure.durationMs,
      prompt_tokens: failure.promptTokens,
      generation_tokens: failure.completionTokens,
      prompt_tokens_per_second: null,
      generation_tokens_per_second: null,
      cost_usd: failure.costUsd,
      pricing_estimated_cost_usd: failure.estimatedCostUsd,
    },
    response: {
      id: failure.responseId,
      served_model: failure.servedModel,
      served_provider: failure.servedProvider,
      total_tokens: failure.totalTokens,
      is_byok: failure.isByok,
      body_sha256: failure.responseBodySha256,
      rate_limit_deferrals_before_response: rateLimitDeferrals,
    },
    output: {
      raw_text: '',
      raw_text_sha256: sha256(Buffer.from('')),
      token_ids: null,
      parser: {
        valid: false,
        error: failure.message,
        transport_envelope: 'missing-content',
      },
      sections: [],
      patches: null,
      mechanically_accepted: false,
    },
    terminal_failure: {
      retry_disposition:
        'not-retried-because-the-success-response-may-have-been-charged',
      evidence_limit:
        'The raw API envelope is represented only by its SHA-256 digest.',
    },
    environment: {
      node: process.version,
      service: 'OpenRouter',
    },
  };
}

async function irreversibleStop(
  screen,
  plan,
  candidateId,
  repetition,
  requestsPerRepeat,
) {
  const results = [];
  for (let currentRepeat = 1;
    currentRepeat <= repetition;
    currentRepeat += 1) {
    const root = join(paths.results, candidateId);
    for (const documentId of screen.scope.document_ids) {
      for (let targetIndex = 0;
        targetIndex < screen.scope.sections_per_document;
        targetIndex += 1) {
        const path = join(
          root,
          `${documentId}--target-${targetIndex}`,
          `repeat-${currentRepeat}.json`,
        );
        try {
          const result = JSON.parse(await readFile(path, 'utf8'));
          if (
            result.screen_id === screen.id &&
            result.candidate.manifest_id === candidateId &&
            result.generation.max_tokens === screen.generation.max_tokens
          ) {
            results.push(result);
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    }
  }
  const activeResults = results.filter((result) =>
    result.repetition === repetition);
  const accepted = results.filter((result) =>
    result.output.mechanically_accepted).length;
  const required = repetition === 1
    ? plan.first_repeat_gates.mechanically_accepted_requests_minimum
    : plan.two_repeat_gates.mechanically_accepted_requests_minimum;
  const totalExpected = requestsPerRepeat * repetition;
  const remaining = totalExpected - results.length;
  if (accepted + remaining < required) return 'mechanical gate is unreachable';
  const gates = repetition === 1
    ? plan.first_repeat_gates
    : plan.two_repeat_gates;
  if (
    Number.isFinite(gates.token_limit_failures_maximum) &&
    results.filter((result) => result.generation.reached_token_limit).length >
      gates.token_limit_failures_maximum
  ) {
    return 'token-limit failure';
  }
  let grossEdits = 0;
  let correctInputRegressions = 0;
  for (const result of activeResults) {
    if (!result.output.mechanically_accepted) continue;
    const document = JSON.parse(await readFile(
      join(paths.documents, `${result.document.id}.json`),
      'utf8',
    ));
    const index = result.document.target_index;
    const input = document.model_input.sections[index].text;
    const reference = document.evaluation.sections[index].reference;
    const output = result.output.sections[0].text;
    const inputWords = normalizedWords(input);
    const rawDistance = editDistance(normalizedWords(reference), inputWords);
    const postDistance = editDistance(
      normalizedWords(reference),
      normalizedWords(output),
    );
    const changeDistance = editDistance(inputWords, normalizedWords(output));
    if (changeDistance / Math.max(1, inputWords.length) > 0.3) {
      grossEdits += 1;
    }
    if (rawDistance === 0 && postDistance > 0) {
      correctInputRegressions += 1;
    }
  }
  if (
    Number.isFinite(
      gates
        .accepted_sections_above_30_percent_input_output_word_edit_rate_maximum,
    ) &&
    grossEdits >
      gates
        .accepted_sections_above_30_percent_input_output_word_edit_rate_maximum
  ) {
    return 'accepted target exceeds the 30 percent edit boundary';
  }
  if (
    Number.isFinite(gates.changed_correct_input_to_error_maximum) &&
    correctInputRegressions > gates.changed_correct_input_to_error_maximum
  ) {
    return 'previously correct target gained a word error';
  }
  return null;
}

async function summarize() {
  const result = spawnSync(process.execPath, [
    join(repoRoot, 'scripts/run-postprocessing-factorial-local-llm.mjs'),
    'summarize',
    '--screen', paths.screen,
    '--ledger', paths.ledger,
    '--output-dir', paths.output,
    '--results-subdir', values['results-subdir'],
    '--summary-output', paths.summary,
    '--allow-partial',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${result.stdout}${result.stderr}`);
  }
  process.stdout.write(result.stdout);
  const { screen, plan, planBytes } = await loadContract();
  const summaryBytes = await readFile(paths.summary);
  const summary = JSON.parse(summaryBytes);
  const candidates = screen.candidates.map((candidate) =>
    evaluateCandidate(summary, plan, candidate.id));
  const dispositions = new Set(candidates.map((entry) => entry.disposition));
  const complete = [...dispositions].every((disposition) =>
    ['reject', 'promote-from-preflight'].includes(disposition));
  const decision = {
    schema_version: '1.0.0',
    id: `${plan.id}-decision-1`,
    plan_id: plan.id,
    plan_sha256: sha256(planBytes),
    screen_id: screen.id,
    summary_path: repositoryPath(paths.summary),
    summary_sha256: sha256(summaryBytes),
    captured_at: new Date().toISOString(),
    status: complete
      ? 'complete'
      : dispositions.has('continue-repeat-1')
        ? 'repeat-1-in-progress'
        : 'repeat-2-in-progress',
    candidates,
    decision_boundary:
      'A promoted development survivor may enter the broader factorial or ' +
      'held-out evaluation; it is not a product-quality selection.',
  };
  await atomicJson(paths.decision, decision);
  process.stdout.write(
    `${JSON.stringify(candidates.map((entry) => ({
      candidate: entry.candidate,
      disposition: entry.disposition,
      cost_usd: entry.observed.total_cost_usd,
    })), null, 2)}\n`,
  );
}

function evaluateCandidate(summary, plan, candidateId) {
  const requests = summary.requests.filter((request) =>
    request.candidate === candidateId);
  const observations = summary.observations.filter((observation) =>
    observation.candidate === candidateId);
  const repeats = [1, 2].map((repetition) => evaluateSlice(
    requests.filter((request) => request.repetition === repetition),
    observations.filter((observation) => observation.repetition === repetition),
  ));
  const combined = evaluateSlice(requests, observations);
  const requestsPerRepeat = plan.first_repeat_gates.completed_requests_required;
  let disposition = 'continue-repeat-1';
  let rationale = 'Repeat 1 is incomplete and no irreversible gate has failed.';
  const firstIrreversible = irreversibleEvaluationFailure(
    repeats[0],
    plan.first_repeat_gates,
  );
  if (firstIrreversible !== null) {
    disposition = 'reject';
    rationale = firstIrreversible;
  } else if (repeats[0].completed_requests === requestsPerRepeat) {
    const firstFailures = gateFailures(
      repeats[0],
      plan.first_repeat_gates,
    );
    if (firstFailures.length > 0) {
      disposition = 'reject';
      rationale = `Repeat 1 failed: ${firstFailures.join('; ')}`;
    } else if (repeats[1].completed_requests === 0) {
      disposition = 'advance-to-repeat-2';
      rationale = 'Repeat 1 passed every precommitted gate.';
    } else {
      const secondIrreversible = irreversibleEvaluationFailure(
        combined,
        plan.two_repeat_gates,
      );
      if (secondIrreversible !== null) {
        disposition = 'reject';
        rationale = secondIrreversible;
      } else if (repeats[1].completed_requests < requestsPerRepeat) {
        disposition = 'continue-repeat-2';
        rationale =
          'Repeat 2 is incomplete and no irreversible gate has failed.';
      } else {
        const combinedFailures = gateFailures(
          combined,
          plan.two_repeat_gates,
        );
        const secondQualityFailures = gateFailures(
          repeats[1],
          plan.first_repeat_gates,
        ).filter((failure) =>
          !failure.startsWith('mechanically accepted'));
        const failures = [...combinedFailures, ...secondQualityFailures.map(
          (failure) => `repeat 2 ${failure}`,
        )];
        if (failures.length === 0) {
          disposition = 'promote-from-preflight';
          rationale = 'Both repeats passed every precommitted gate.';
        } else {
          disposition = 'reject';
          rationale = `Two-repeat evaluation failed: ${failures.join('; ')}`;
        }
      }
    }
  }
  const repeatPairs = new Map();
  for (const request of requests) {
    const key = `${request.document_id}|${request.target_index}`;
    if (!repeatPairs.has(key)) repeatPairs.set(key, []);
    repeatPairs.get(key).push(request);
  }
  const completePairs = [...repeatPairs.values()].filter((group) =>
    group.length === 2).length;
  const identicalPairs = [...repeatPairs.values()].filter((group) =>
    group.length === 2 &&
    group[0].raw_text_sha256 === group[1].raw_text_sha256).length;
  return {
    candidate: candidateId,
    disposition,
    rationale,
    repeats: [
      { repetition: 1, ...repeats[0] },
      { repetition: 2, ...repeats[1] },
    ],
    combined,
    repeat_stability: {
      complete_pairs: completePairs,
      byte_identical_raw_output_pairs: identicalPairs,
      non_identical_raw_output_pairs: completePairs - identicalPairs,
      requirement: 'observation-only-for-remote-services',
    },
    observed: {
      total_cost_usd: sum(requests.map((request) =>
        request.cost_usd ?? request.pricing_estimated_cost_usd ?? 0)),
      served_models: [...new Set(requests.map((request) =>
        request.served_model).filter(Boolean))].sort(),
      served_providers: [...new Set(requests.map((request) =>
        request.served_provider).filter(Boolean))].sort(),
      explicit_unbilled_429_deferrals: sum(requests.map((request) =>
        request.rate_limit_deferrals_before_response?.length ?? 0)),
    },
  };
}

function evaluateSlice(requests, observations) {
  const byLocale = new Map();
  for (const observation of observations) {
    if (!byLocale.has(observation.locale)) byLocale.set(observation.locale, []);
    byLocale.get(observation.locale).push(observation);
  }
  const localeQuality = [...byLocale.entries()].map(([locale, group]) => {
    const raw = mean(group.map((entry) => entry.raw_wer));
    const strictOrRaw = mean(group.map((entry) =>
      entry.mechanically_accepted && entry.post_wer !== null
        ? entry.post_wer
        : entry.raw_wer));
    return {
      locale,
      observations: group.length,
      macro_mean_raw_wer: raw,
      macro_mean_strict_or_raw_wer: strictOrRaw,
      relative_error_change: raw === 0 ? null : (strictOrRaw - raw) / raw,
      regressed: strictOrRaw > raw + 1e-12,
    };
  }).sort((left, right) => left.locale.localeCompare(right.locale));
  const raw = mean(observations.map((entry) => entry.raw_wer));
  const strictOrRaw = mean(observations.map((entry) =>
    entry.mechanically_accepted && entry.post_wer !== null
      ? entry.post_wer
      : entry.raw_wer));
  return {
    completed_requests: requests.length,
    mechanically_accepted_requests: requests.filter((request) =>
      request.mechanically_accepted).length,
    invalid_requests: requests.filter((request) =>
      !request.mechanically_accepted).length,
    token_limit_failures: requests.filter((request) =>
      request.reached_token_limit).length,
    accepted_sections_above_30_percent_input_output_word_edit_rate:
      observations.filter((observation) =>
        observation.mechanically_accepted &&
        observation.input_output_word_edit_rate > 0.3).length,
    locale_macro_wer_regressions: localeQuality.filter((entry) =>
      entry.regressed).length,
    changed_correct_input_to_error: observations.filter((observation) =>
      observation.mechanically_accepted &&
      observation.changed_correct_input_to_error).length,
    improved_sections: observations.filter((observation) =>
      observation.mechanically_accepted && observation.improved).length,
    regressed_sections: observations.filter((observation) =>
      observation.mechanically_accepted && observation.regressed).length,
    macro_mean_raw_wer: raw,
    macro_mean_strict_or_raw_wer: strictOrRaw,
    relative_error_change:
      raw === null || raw === 0 || strictOrRaw === null
        ? null
        : (strictOrRaw - raw) / raw,
    locale_quality: localeQuality,
  };
}

function irreversibleEvaluationFailure(observed, gates) {
  const remaining = gates.completed_requests_required -
    observed.completed_requests;
  if (
    observed.mechanically_accepted_requests + remaining <
    gates.mechanically_accepted_requests_minimum
  ) {
    return 'Mechanical acceptance minimum is mathematically unreachable.';
  }
  if (
    Number.isFinite(gates.token_limit_failures_maximum) &&
    observed.token_limit_failures > gates.token_limit_failures_maximum
  ) {
    return 'A token-limit failure irreversibly violates the gate.';
  }
  if (
    Number.isFinite(
      gates
        .accepted_sections_above_30_percent_input_output_word_edit_rate_maximum,
    ) &&
    observed
      .accepted_sections_above_30_percent_input_output_word_edit_rate >
    gates
      .accepted_sections_above_30_percent_input_output_word_edit_rate_maximum
  ) {
    return 'A gross accepted edit irreversibly violates the safety gate.';
  }
  if (
    Number.isFinite(gates.changed_correct_input_to_error_maximum) &&
    observed.changed_correct_input_to_error >
    gates.changed_correct_input_to_error_maximum
  ) {
    return 'A previously correct target gained a word error.';
  }
  return null;
}

function gateFailures(observed, gates) {
  const failures = [];
  if (observed.completed_requests !== gates.completed_requests_required) {
    failures.push(
      `completed ${observed.completed_requests}/` +
      `${gates.completed_requests_required} requests`,
    );
  }
  if (
    observed.mechanically_accepted_requests <
    gates.mechanically_accepted_requests_minimum
  ) {
    failures.push(
      `mechanically accepted ${observed.mechanically_accepted_requests}/` +
      `${gates.mechanically_accepted_requests_minimum}`,
    );
  }
  if (
    Number.isFinite(gates.token_limit_failures_maximum) &&
    observed.token_limit_failures > gates.token_limit_failures_maximum
  ) {
    failures.push(`${observed.token_limit_failures} token-limit failures`);
  }
  if (
    Number.isFinite(
      gates
        .accepted_sections_above_30_percent_input_output_word_edit_rate_maximum,
    ) &&
    observed
      .accepted_sections_above_30_percent_input_output_word_edit_rate >
    gates
      .accepted_sections_above_30_percent_input_output_word_edit_rate_maximum
  ) {
    failures.push('gross accepted edits exceed the maximum');
  }
  if (
    Number.isFinite(gates.locale_macro_wer_regressions_maximum) &&
    observed.locale_macro_wer_regressions >
    gates.locale_macro_wer_regressions_maximum
  ) {
    failures.push(
      `${observed.locale_macro_wer_regressions} locale macro-WER regressions`,
    );
  }
  if (
    Number.isFinite(gates.changed_correct_input_to_error_maximum) &&
    observed.changed_correct_input_to_error >
    gates.changed_correct_input_to_error_maximum
  ) {
    failures.push('a correct input gained a word error');
  }
  if (
    gates.section_regressions_must_not_exceed_improvements &&
    observed.regressed_sections > observed.improved_sections
  ) {
    failures.push(
      `${observed.regressed_sections} regressions exceed ` +
      `${observed.improved_sections} improvements`,
    );
  }
  if (
    Number.isFinite(gates.overall_relative_error_change_maximum) &&
    (
      observed.relative_error_change === null ||
      observed.relative_error_change >
        gates.overall_relative_error_change_maximum
    )
  ) {
    failures.push(
      `overall relative error change ${
        observed.relative_error_change === null
          ? 'is unavailable'
          : observed.relative_error_change
      } exceeds ${gates.overall_relative_error_change_maximum}`,
    );
  }
  return failures;
}

async function printStatus() {
  const { screen } = await loadContract();
  const candidates = await selectedCandidates(screen);
  const status = [];
  for (const candidate of candidates) {
    const repetitions = [];
    for (let repetition = 1; repetition <= 2; repetition += 1) {
      let completed = 0;
      let accepted = 0;
      let cost = 0;
      for (const documentId of screen.scope.document_ids) {
        for (let targetIndex = 0; targetIndex < 6; targetIndex += 1) {
          const path = join(
            paths.results,
            candidate.id,
            `${documentId}--target-${targetIndex}`,
            `repeat-${repetition}.json`,
          );
          try {
            const result = JSON.parse(await readFile(path, 'utf8'));
            if (
              result.screen_id !== screen.id ||
              result.candidate.manifest_id !== candidate.id ||
              result.generation.max_tokens !== screen.generation.max_tokens
            ) {
              continue;
            }
            completed += 1;
            if (result.output.mechanically_accepted) accepted += 1;
            cost += result.measurements.cost_usd ??
              result.measurements.pricing_estimated_cost_usd ?? 0;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
      }
      repetitions.push({
        repetition,
        completed,
        mechanically_accepted: accepted,
        cost_usd: cost,
      });
    }
    status.push({ candidate: candidate.id, repetitions });
  }
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

async function validExisting(path, screen, candidate, job) {
  try {
    const result = JSON.parse(await readFile(path, 'utf8'));
    return (
      result.screen_id === screen.id &&
      result.candidate.manifest_id === candidate.id &&
      result.document.id === job.document.id &&
      result.document.sha256 === job.documentSha256 &&
      result.document.target_index === job.targetIndex &&
      result.prompt.sha256 === screen.generation.prompt_sha256 &&
      result.generation.max_tokens === screen.generation.max_tokens &&
      result.repetition === job.repetition
    );
  } catch {
    return false;
  }
}

function resultPath(candidateId, job, repetition) {
  return join(
    paths.results,
    candidateId,
    job.requestId,
    `repeat-${repetition}.json`,
  );
}

function requestCostEnvelope(manifest, screen, renderedPrompt) {
  const pricing = manifest.gateway.pricing_snapshot_usd_per_token;
  return [...renderedPrompt].length * Number(pricing.prompt) +
    screen.generation.max_tokens * Number(pricing.completion);
}

function repositoryPath(path) {
  const absolute = resolve(path);
  const fromRoot = relative(repoRoot, absolute);
  if (fromRoot.startsWith('..') || fromRoot.length === 0) {
    throw new Error(`path is outside the repository: ${path}`);
  }
  return fromRoot;
}

function gitRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function normalizedWords(text) {
  return [...text.normalize('NFC').toLocaleLowerCase('und')]
    .map((character) => /[\p{L}\p{N}]/u.test(character) ? character : ' ')
    .join('')
    .split(/\s+/u)
    .filter(Boolean);
}

function editDistance(reference, hypothesis) {
  let previous = Array.from(
    { length: hypothesis.length + 1 },
    (_, index) => index,
  );
  for (let referenceIndex = 1;
    referenceIndex <= reference.length;
    referenceIndex += 1) {
    const current = [referenceIndex];
    for (let hypothesisIndex = 1;
      hypothesisIndex <= hypothesis.length;
      hypothesisIndex += 1) {
      current[hypothesisIndex] = Math.min(
        previous[hypothesisIndex] + 1,
        current[hypothesisIndex - 1] + 1,
        previous[hypothesisIndex - 1] + Number(
          reference[referenceIndex - 1] !== hypothesis[hypothesisIndex - 1],
        ),
      );
    }
    previous = current;
  }
  return previous.at(-1);
}

function positiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function positiveNumber(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive number`);
  }
  return parsed;
}

function sum(values_) {
  return values_.reduce((total, value) => total + value, 0);
}

function mean(values_) {
  return values_.length === 0 ? null : sum(values_) / values_.length;
}

function roundUpCents(value) {
  return Math.ceil(value * 100) / 100;
}

function formatUsd(value) {
  return Number(value).toFixed(8);
}

function delay(milliseconds) {
  return new Promise((resolve_) => setTimeout(resolve_, milliseconds));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function selfTest() {
  const { screen, plan, screenBytes, planBytes } = await loadContract();
  const requestsPerRepeat =
    screen.scope.document_count * screen.scope.sections_per_document;
  const completedRequests =
    plan.first_repeat_gates.completed_requests_required;
  const acceptedRequests =
    plan.first_repeat_gates.mechanically_accepted_requests_minimum;
  if (
    parseTargetOutput('{"text":"ok"}').text !== 'ok' ||
    parseTargetOutput('```json\n{"text":"ok"}\n```').transportEnvelope !==
      'markdown-json-fence' ||
    parseTargetOutput('{"text":"ok","extra":true}').valid ||
    normalizedWords('Über—Test').join('|') !== 'über|test' ||
    editDistance(['one', 'two'], ['one', 'too']) !== 1 ||
    gateFailures({
      completed_requests: completedRequests,
      mechanically_accepted_requests: acceptedRequests,
      token_limit_failures: 0,
      accepted_sections_above_30_percent_input_output_word_edit_rate: 0,
      locale_macro_wer_regressions: 0,
      changed_correct_input_to_error: 0,
      improved_sections: 1,
      regressed_sections: 1,
      relative_error_change: -0.1,
    }, plan.first_repeat_gates).length !== 0 ||
    irreversibleEvaluationFailure({
      completed_requests: 2,
      mechanically_accepted_requests: 0,
      token_limit_failures: 0,
      accepted_sections_above_30_percent_input_output_word_edit_rate: 0,
      changed_correct_input_to_error: 0,
    }, plan.first_repeat_gates) === null
  ) {
    throw new Error('hosted factorial runner unit self-test failed');
  }
  const estimateRequired = join(
    repoRoot,
    plan.cost_policy.estimate_path,
  );
  if (await exists(estimateRequired)) {
    const estimate = JSON.parse(await readFile(estimateRequired, 'utf8'));
    if (
      estimate.plan_id !== plan.id ||
      estimate.plan_sha256 !== sha256(planBytes) ||
      estimate.screen_id !== screen.id ||
      estimate.screen_sha256 !== sha256(screenBytes) ||
      estimate.scope.requests_per_candidate_per_repeat !== requestsPerRepeat ||
      estimate.candidates.length !== screen.candidates.length
    ) {
      throw new Error('hosted cost estimate differs from the active contract');
    }
  }
  process.stdout.write('factorial hosted LLM runner: self-test passed\n');
}
