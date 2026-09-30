import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, genericModel } from '../src/catalog/index.mjs';

test('fresh provider modalities replace a cached text-only auto without replacing client metadata', () => {
  const existing = { models: [{ ...genericModel('auto'), context_window: 128000 }] };
  const bundled = { models: [genericModel('native')] };
  const listing = { data: [{ id: 'auto', input_modalities: ['text'] }] };
  const manifest = { models: [{ ...genericModel('auto'), input_modalities: ['text', 'image'] }] };
  const updated = buildCatalog(listing, existing, bundled, manifest);
  assert.deepEqual(updated.models[0].input_modalities, ['text', 'image']);
  assert.equal(updated.models[0].context_window, 128000);
  assert.deepEqual(existing.models[0].input_modalities, ['text']);
  assert.deepEqual(buildCatalog(listing, updated, bundled, manifest), updated);

  manifest.models[0].input_modalities = ['text'];
  assert.deepEqual(buildCatalog(listing, updated, bundled, manifest).models[0].input_modalities, ['text']);
});

test('standard discovery modalities update cached and new models without a Codex manifest', () => {
  const existing = { models: [genericModel('auto')] };
  const bundled = { models: [genericModel('native')] };
  const listing = { data: ['auto', 'new', 'native'].map(id => ({ id, input_modalities: ['text', 'image'] })) };
  const updated = buildCatalog(listing, existing, bundled);
  for (const model of updated.models) {
    assert.deepEqual(model.input_modalities, ['text', 'image']);
  }
});

test('missing provider modalities preserve known capabilities and unknown models remain text-only', () => {
  const existing = { models: [{ ...genericModel('cached'), input_modalities: ['text', 'image'] }] };
  const bundled = { models: [{ ...genericModel('native'), input_modalities: ['text', 'image'] }] };
  const listing = { data: ['cached', 'native', 'auto'].map(id => ({ id })) };
  const updated = buildCatalog(listing, existing, bundled);
  assert.deepEqual(updated.models.map(model => model.input_modalities), [['text', 'image'], ['text', 'image'], ['text']]);
});
