import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSlug, validateSlug } from './slug';

describe('normalizeSlug', () => {
  it('trims and lowercases only', () => {
    assert.equal(normalizeSlug('  Garlic FC 2024  '), 'garlic fc 2024');
  });

  it('does not remove underscores or hyphens', () => {
    assert.equal(normalizeSlug('_Garlic-FC_'), '_garlic-fc_');
  });

  it('extracts the slug from an https URL', () => {
    assert.equal(normalizeSlug('https://EXAMPLE.COM/garlic-fc'), 'garlic-fc');
  });

  it('extracts the slug from an http URL with trailing slash', () => {
    assert.equal(normalizeSlug('http://example.com/teams/garlic-fc/'), 'garlic-fc');
  });

  it('strips surrounding slashes on a plain suffix', () => {
    assert.equal(normalizeSlug('/Garlic-FC/'), 'garlic-fc');
  });
});

describe('validateSlug', () => {
  it('accepts a valid 3-40 character slug', () => {
    const result = validateSlug('garlic-fc');
    assert.equal(result.ok, true);
    assert.equal(result.slug, 'garlic-fc');
  });

  it('converts uppercase and accepts it', () => {
    const result = validateSlug('Garlic-FC');
    assert.equal(result.ok, true);
    assert.equal(result.slug, 'garlic-fc');
  });

  it('trims surrounding spaces and converts uppercase', () => {
    const result = validateSlug('  Garlic-FC  ');
    assert.equal(result.ok, true);
    assert.equal(result.slug, 'garlic-fc');
  });

  it('rejects internal spaces', () => {
    const result = validateSlug('Garlic FC');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /半角小文字/);
  });

  it('rejects too short slugs', () => {
    const result = validateSlug('ab');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /3文字以上/);
  });

  it('rejects too long slugs', () => {
    const result = validateSlug('a'.repeat(41));
    assert.equal(result.ok, false);
    assert.match(result.message || '', /40文字以下/);
  });

  it('rejects leading hyphens', () => {
    const result = validateSlug('-garlic-fc');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /半角小文字/);
  });

  it('rejects trailing hyphens', () => {
    const result = validateSlug('garlic-fc-');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /半角小文字/);
  });

  it('rejects consecutive internal hyphens', () => {
    const result = validateSlug('garlic--fc');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /半角小文字/);
  });

  it('rejects underscores', () => {
    const result = validateSlug('garlic_fc');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /半角小文字/);
  });

  it('rejects slashes and Japanese characters', () => {
    const result = validateSlug('garlic/fc東京');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /半角小文字/);
  });

  it('rejects reserved words', () => {
    const result = validateSlug('admin');
    assert.equal(result.ok, false);
    assert.match(result.message || '', /予約語/);
  });

  it('accepts the current slug without duplicate checks', () => {
    const result = validateSlug('garlic-fc', { currentSlug: 'garlic-fc' });
    assert.equal(result.ok, true);
  });
});
