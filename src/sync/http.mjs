export async function fetchJson(url, headers) {
  let response;
  try {
    response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  } catch { throw new Error('Model request failed (network, timeout, or redirect). Check provider base_url.'); }
  if (!response.ok) {
    const error = new Error(`Model endpoint returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  try { return await response.json(); }
  catch { throw new Error('Model endpoint did not return JSON.'); }
}
