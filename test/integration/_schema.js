// Shared helper: apply the real D1 schema (migrations 001→002→003) to the
// in-memory test database. Each integration spec runs in its own isolated worker,
// so each applies the schema in a beforeAll.
import init from '../../schema/001_initial.sql?raw';
import guides from '../../schema/002_guide_clicks.sql?raw';
import v2 from '../../schema/003_research_v2.sql?raw';
import subscribers from '../../schema/005_subscribers.sql?raw';
import subscribersConsent from '../../schema/009_subscribers_consent.sql?raw';
import keywords from '../../schema/006_keyword_queue.sql?raw';
import users from '../../schema/007_users.sql?raw';
import claims from '../../schema/010_claims.sql?raw';
import verification from '../../schema/011_verification.sql?raw';

export async function applySchema(db) {
  for (const sql of [init, guides, v2, subscribers, subscribersConsent, keywords, users, claims, verification]) {
    const stmts = sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
    for (const s of stmts) await db.prepare(s).run();
  }
}
