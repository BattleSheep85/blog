// Integration coverage for worker/handlers/report.js — report serving + feedback,
// across every row state, against real D1.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { handleGetReport, handleFeedback } from '../../worker/handlers/report.js';
import { generateId, insertResearch, updateResearchStatus, completeResearch, insertProductV2 } from '../../worker/lib/db.js';

beforeAll(() => applySchema(env.DB));

const json = (path, body) => new Request('https://x' + path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

describe('handleGetReport', () => {
  it('404 for unknown id', async () => {
    expect((await handleGetReport('nope', env)).status).toBe(404);
  });

  it('202 while pending/processing', async () => {
    const id = generateId();
    await insertResearch(env.DB, { id, slug: 's-' + id, query: 'q', canonicalQuery: 'q' });
    await updateResearchStatus(env.DB, id, 'processing');
    const res = await handleGetReport(id, env);
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe('processing');
  });

  it('200 + status:error for a failed run', async () => {
    const id = generateId();
    await insertResearch(env.DB, { id, slug: 's-' + id, query: 'q', canonicalQuery: 'q' });
    await completeResearch(env.DB, { id, status: 'failed', result: JSON.stringify({ error: 'boom' }) });
    const res = await handleGetReport(id, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.error).toBe('boom');
  });

  it('200 + completed report with products', async () => {
    const id = generateId();
    await insertResearch(env.DB, { id, slug: 's-' + id, query: 'best nas', canonicalQuery: 'nas2' });
    await completeResearch(env.DB, { id, status: 'complete', summary: 'S', category: 'NAS', result: JSON.stringify({ source_count: 5 }), sources: '[]' });
    await insertProductV2(env.DB, { researchId: id, name: 'P1', rank: 1, rating: 4.5 });
    const res = await handleGetReport(id, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.products.length).toBe(1);
    expect(body.sourceCount).toBe(5);
  });
});

describe('handleFeedback', () => {
  let id;
  beforeAll(async () => {
    id = generateId();
    await insertResearch(env.DB, { id, slug: 's-' + id, query: 'q', canonicalQuery: 'qfb' });
  });

  it('400 on invalid JSON', async () => {
    const r = new Request('https://x/api/feedback', { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } });
    expect((await handleFeedback(r, env)).status).toBe(400);
  });
  it('400 on missing reportId', async () => {
    expect((await handleFeedback(json('/api/feedback', { rating: 5 }), env)).status).toBe(400);
  });
  it('400 on out-of-range rating', async () => {
    expect((await handleFeedback(json('/api/feedback', { reportId: id, rating: 9 }), env)).status).toBe(400);
  });
  it('404 when report does not exist', async () => {
    expect((await handleFeedback(json('/api/feedback', { reportId: 'nope', rating: 4 }), env)).status).toBe(404);
  });
  it('200 + persists valid feedback', async () => {
    const res = await handleFeedback(json('/api/feedback', { reportId: id, rating: 4, comment: 'ok' }), env);
    expect((await res.json()).success).toBe(true);
    const fb = await env.DB.prepare('SELECT rating FROM feedback WHERE report_id = ?').bind(id).first();
    expect(fb.rating).toBe(4);
  });
});
