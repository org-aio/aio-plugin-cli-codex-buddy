#!/usr/bin/env node
import { runHook } from './lifecycle/index.mjs';

// Hook failures must not break an already completed tool or print sensitive inputs.
try {
  let body = '';
  for await (const chunk of process.stdin) {
    body += chunk;
    if (body.length > 4 * 1024 * 1024) throw new Error('Hook input too large');
  }
  const output = await runHook(process.argv[2], JSON.parse(body));
  if (output) process.stdout.write(JSON.stringify(output));
} catch { /* No output means Codex continues with its original result. */ }
