'use strict';

/**
 * verify.hu partner client.
 *
 * Three calls cover the whole integration:
 *   startRound(userId)   ask for a one-time link when a player runs your command
 *   verifyWebhook(...)   check that a "finished" message really came from verify.hu
 *   fetchFinished(since) ask who finished, for bots without a public web address
 *
 * Needs Node 18 or newer. No dependencies.
 */

const crypto = require('node:crypto');

const DEFAULT_BASE_URL = 'https://verify.hu';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_WEBHOOK_AGE_SECONDS = 300;

class VerifyHuError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'VerifyHuError';
    this.status = status;
  }
}

class VerifyHu {
  /**
   * @param {object} options
   * @param {string} options.key       Your partner key. Read it from the environment, never commit it.
   * @param {string} [options.baseUrl] Only change this for local testing.
   */
  constructor({ key, baseUrl = DEFAULT_BASE_URL } = {}) {
    if (!key) throw new TypeError('VerifyHu: "key" is required');
    this.key = key;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Ask for a one-time link for one player.
   *
   * Resolves to one of:
   *   { ok: true, url, activity_url, expires_in, questions, streak, rounds_left }
   *   { ok: false, reason: 'cap' | 'off' | 'no_questions', resets_at? }
   *
   * `activity_url` opens the window inside Discord and is null until your application ID
   * is set on our side. `url` always works and opens in the browser.
   *
   * @param {string} userId The player's Discord user ID. Nothing else about the player is sent.
   */
  async startRound(userId) {
    return this.#request('POST', '/api/partner/start', { user_id: String(userId) });
  }

  /**
   * Rounds finished after `since`, oldest first, at most 100 per call.
   * Store the returned `next` and pass it as `since` next time, so a restart misses nothing.
   *
   * @param {string|Date} since
   * @returns {Promise<{ rounds: FinishedRound[], next: string }>}
   */
  async fetchFinished(since) {
    const from = since instanceof Date ? since.toISOString() : String(since);
    return this.#request('GET', `/api/partner/results?since=${encodeURIComponent(from)}`);
  }

  /**
   * Check a webhook request and return its content.
   * Throws VerifyHuError if the signature is wrong or the message is too old to trust.
   *
   * @param {string|Buffer} rawBody The request body exactly as it arrived, before any JSON parsing.
   * @param {string} timestamp      The X-VerifyHu-Timestamp header.
   * @param {string} signature      The X-VerifyHu-Signature header.
   * @returns {FinishedRound | { event: 'earn.test', partner: string }}
   */
  verifyWebhook(rawBody, timestamp, signature) {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');
    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > MAX_WEBHOOK_AGE_SECONDS) {
      throw new VerifyHuError('webhook timestamp is missing or too old', 401);
    }

    const expected = crypto.createHmac('sha256', this.key).update(`${timestamp}.${body}`).digest();
    const given = Buffer.from(String(signature ?? ''), 'hex');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      throw new VerifyHuError('webhook signature does not match', 401);
    }

    return JSON.parse(body);
  }

  async #request(method, path, body) {
    let response;
    try {
      response = await fetch(this.baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new VerifyHuError(`verify.hu could not be reached: ${cause.message}`, 0);
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new VerifyHuError(data?.error ?? `verify.hu answered ${response.status}`, response.status);
    }
    return data;
  }
}

/**
 * @typedef {object} FinishedRound
 * @property {'earn.finished'} event
 * @property {string} partner     Your short name on verify.hu.
 * @property {string} round       Unique per round. Use it to make sure a reward is only given once.
 * @property {string} user_id     The player's Discord user ID.
 * @property {number} answers     Answers that count. Skipped and rushed answers are left out; can be 0.
 * @property {number} questions   Questions the player was shown.
 * @property {'ok'|'low'} quality 'low' means careless answers. Give less if you like; never show it to the player.
 * @property {number} streak      Days in a row with at least one counted answer.
 * @property {string} day         The UTC day of the round, as YYYY-MM-DD.
 * @property {string} finished_at ISO time.
 */

module.exports = { VerifyHu, VerifyHuError };
