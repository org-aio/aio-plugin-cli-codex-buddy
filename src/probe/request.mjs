const responseBodyLimit = 1024 * 1024;
const errorBodyLimit = 64 * 1024;
const probeFunction = 'codex_buddy_probe';

export function probeRequest(model, kind, metadata = {}) {
  const levels = metadata.supported_reasoning_levels?.map(level => level.effort) || [];
  const effort = ['none', 'minimal', 'low'].find(value => levels.includes(value));
  const request = {
    model, input: 'Reply only OK.', stream: false, store: false, max_output_tokens: effort === 'none' ? 128 : 512,
    ...(effort ? { reasoning: { effort } } : {}),
  };
  if (kind === 'tools') {
    request.input = 'Call codex_buddy_probe with {"probe":"ok"}.';
    request.tools = [{
      type: 'function', name: probeFunction, description: 'Probe only.',
      parameters: { type: 'object', properties: { probe: { type: 'string', enum: ['ok'] } }, required: ['probe'], additionalProperties: false },
      strict: true,
    }];
    request.tool_choice = { type: 'function', name: probeFunction };
  }
  return request;
}

export function inspectProbeResponse(body, kind) {
  if (!body || typeof body !== 'object' || body.error || body.status !== 'completed') {
    return { status: 'failed', reason: body?.status === 'incomplete' ? 'incomplete_response' : 'response_not_completed' };
  }
  const output = Array.isArray(body.output) ? body.output : [];
  if (kind === 'text') {
    const text = typeof body.output_text === 'string' ? body.output_text : output
      .flatMap(item => Array.isArray(item.content) ? item.content : [])
      .filter(item => item.type === 'output_text' && typeof item.text === 'string')
      .map(item => item.text).join('');
    return text.trim() === 'OK' ? { status: 'passed' } : { status: 'failed', reason: text.trim() ? 'unexpected_text' : 'empty_text' };
  }
  const calls = output.filter(item => item.type === 'function_call');
  if (calls.length !== 1 || calls[0].name !== probeFunction || typeof calls[0].arguments !== 'string') {
    return { status: 'failed', reason: 'expected_function_call_missing' };
  }
  let args;
  try { args = JSON.parse(calls[0].arguments); }
  catch { return { status: 'failed', reason: 'invalid_function_arguments' }; }
  if (!args || typeof args !== 'object' || Array.isArray(args) || args.probe !== 'ok' || Object.keys(args).length !== 1) {
    return { status: 'failed', reason: 'unexpected_function_arguments' };
  }
  return { status: 'passed' };
}

async function readResponseBody(response, limit = responseBodyLimit) {
  if (!response.body) {
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
}

function safeErrorCode(value, connection) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/i.test(value)) {
    return undefined;
  }
  const credentials = [...connection.headers.values(), ...connection.url.searchParams.values()];
  if (credentials.some(secret => secret === value || secret.replace(/^Bearer\s+/i, '') === value)) {
    return undefined;
  }
  return value;
}

function responseModelHeaders(response) {
  const result = {};
  for (const [field, header] of Object.entries({
    requestedModel: 'x-sub2api-requested-model',
    selectedModel: 'x-sub2api-selected-model',
    fallbackModel: 'x-sub2api-fallback-model',
  })) {
    const value = response.headers.get(header)?.trim();
    if (value) {
      result[field] = value.slice(0, 256);
    }
  }
  return result;
}

function responseReadFailure(error, signal) {
  if (signal.aborted) {
    return 'timeout';
  }
  if (error instanceof SyntaxError) {
    return 'invalid_json';
  }
  return error?.message === 'response_too_large' ? 'response_too_large' : 'network_error';
}

export async function runProbeRequest(connection, model, kind, metadata, timeoutMs, fetcher = fetch) {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  const url = new URL(connection.url);
  url.pathname = url.pathname.replace(/\/models$/, '/responses');
  const headers = new Headers(connection.headers);
  headers.set('Content-Type', 'application/json');
  const signal = AbortSignal.timeout(timeoutMs);
  let result;
  try {
    const response = await fetcher(url, {
      method: 'POST', headers, redirect: 'error', signal,
      body: JSON.stringify(probeRequest(model, kind, metadata)),
    });
    if (!response.ok) {
      result = { status: 'failed', reason: 'http_error', httpStatus: response.status, ...responseModelHeaders(response) };
      // 错误响应只提取受限的机器代码，不保存消息、正文或凭据。
      try {
        const body = await readResponseBody(response, errorBodyLimit);
        const code = safeErrorCode(body?.error?.code ?? body?.code, connection);
        const type = safeErrorCode(body?.error?.type, connection);
        if (code) {
          result.errorCode = code;
        }
        if (type) {
          result.errorType = type;
        }
      } catch (error) {
        result.diagnosticFailure = responseReadFailure(error, signal);
      }
    } else {
      const body = await readResponseBody(response);
      result = { ...inspectProbeResponse(body, kind), httpStatus: response.status, ...responseModelHeaders(response) };
      if (typeof body?.model === 'string' && body.model.trim()) {
        result.reportedModel = body.model.trim().slice(0, 256);
      }
    }
  } catch (error) {
    result = { status: 'failed', reason: responseReadFailure(error, signal) };
  }
  return { ...result, checkedAt, latencyMs: Math.max(0, Date.now() - startedAt) };
}
