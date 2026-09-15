import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { atomicWrite } from '../runtime/index.mjs';
import { routeTurn } from '../routing/index.mjs';
import { rewriteTurn, notice } from './protocol.mjs';

// A transparent stdio bridge: preserve IDs, server requests, approvals and all unknown methods.
export async function bridge({ binary, args, home, input = process.stdin, output = process.stdout, error = process.stderr }) {
  const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CODEX_HOME: home } });
  const threads = new Map();
  const pending = new Map();
  const active = new Set();
  const cancelled = new Set();
  const send = message => output.write(JSON.stringify(message) + '\n');
  const warn = (threadId, message) => send({ method: 'warning', params: { threadId, message } });
  const requests = createInterface({ input });
  const responses = createInterface({ input: child.stdout });
  child.stderr.pipe(error, { end: false });
  let queue = Promise.resolve();
  let writes = Promise.resolve();
  let closed = false;
  const record = value => {
    writes = writes.then(() => atomicWrite(join(home, 'model-router', 'status.json'), value))
      .catch(() => warn(value.threadId, 'Auto：无法保存本轮模型状态。'));
  };
  async function forward(line) {
    let message;
    try { message = JSON.parse(line); } catch { child.stdin.write(line + '\n'); return; }
    const { method, id } = message;
    if (method && id !== undefined) pending.set(id, { method, params: message.params });
    if (method === 'turn/start' && !active.has(message.params?.threadId) && message.params?.input?.length && !message.params.toolOutput) {
      const threadId = message.params.threadId;
      try {
        const decision = await routeTurn(home, message.params, threads.get(threadId));
        if (decision) {
          message.params = rewriteTurn(message.params, decision);
          pending.set(id, { method, params: message.params, decision });
        }
      } catch {
        record({ at: new Date().toISOString(), threadId, accepted: false, routed: false, requestedModel: message.params.model || null, reason: '模型列表、策略或供应商状态不可用' });
        warn(threadId, 'Auto 分流未生效：模型列表、策略或供应商状态不可用，保留原模型。');
      }
    }
    if (cancelled.delete(id)) {
      pending.delete(id);
      send({ id, error: { code: -32800, message: 'Turn cancelled during model selection.' } });
      return;
    }
    if (!closed) {
      const request = pending.get(id);
      if (request) request.forwarded = true;
      child.stdin.write(JSON.stringify(message) + '\n');
    }
  }
  requests.on('line', line => {
    // Replies to server approval/tool requests and interrupts must not wait on model discovery.
    let message; try { message = JSON.parse(line); } catch { /* forwarded below */ }
    if (message?.method === 'turn/interrupt') {
      for (const [id, request] of pending) {
        if (request.method === 'turn/start' && !request.forwarded && request.params?.threadId === message.params?.threadId) cancelled.add(id);
      }
    }
    if (message && (!message.method || ['turn/interrupt', 'turn/steer'].includes(message.method))) {
      if (!closed) child.stdin.write(line + '\n');
    } else queue = queue.then(() => forward(line)).catch(() => {
      if (message?.id !== undefined) send({ id: message.id, error: { code: -32603, message: 'Auto router failed before forwarding request.' } });
    });
  });
  responses.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { output.write(line + '\n'); return; }
    const request = !message.method && pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      const result = message.result;
      if (result?.thread?.id) {
        const previous = threads.get(result.thread.id);
        threads.set(result.thread.id, { cwd: result.cwd || result.thread.cwd || previous?.cwd, provider: result.modelProvider || previous?.provider, model: result.model || previous?.model });
      }
      if (request.decision) {
        const threadId = request.params.threadId;
        const accepted = !message.error;
        record({ at: new Date().toISOString(), threadId, turnId: result?.turn?.id || null, accepted, ...request.decision });
        if (accepted) send(notice(threadId, request.decision, true));
        else warn(threadId, `Auto：${request.decision.model} 启动失败，没有自动重放任务。`);
      }
    }
    if (message.method === 'turn/started') active.add(message.params.threadId);
    if (message.method === 'turn/completed') active.delete(message.params.threadId);
    if (message.method === 'thread/closed' || message.method === 'thread/archived') threads.delete(message.params.threadId);
    output.write(line + '\n');
  });
  requests.on('close', () => { queue.finally(() => { if (!closed) child.stdin.end(); }); });
  child.stdin.on('error', () => {});
  const stop = () => child.kill('SIGTERM');
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const result = await new Promise(resolve => {
    child.once('error', () => { error.write('Auto router: cannot start the real Codex binary.\n'); resolve(1); });
    child.once('exit', code => resolve(code ?? 1));
  });
  closed = true;
  requests.close(); responses.close();
  process.off('SIGTERM', stop); process.off('SIGINT', stop);
  await writes;
  return result;
}
