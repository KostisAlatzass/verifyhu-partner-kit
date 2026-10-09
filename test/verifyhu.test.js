'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { VerifyHu, VerifyHuError } = require('../verifyhu');

const KEY = 'vhp_test_0123456789abcdefghijklmn';
const client = new VerifyHu({ key: KEY, baseUrl: 'http://localhost:9' });

const now = () => String(Math.floor(Date.now() / 1000));
const sign = (timestamp, body, key = KEY) => crypto.createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
const body = JSON.stringify({ event: 'earn.finished', round: 'r1', user_id: '123456789012345678', answers: 4 });

test('a key is required', () => {
  assert.throws(() => new VerifyHu({}), TypeError);
});

test('verifyWebhook returns the message when the signature is right', () => {
  const timestamp = now();
  assert.equal(client.verifyWebhook(body, timestamp, sign(timestamp, body)).round, 'r1');
  assert.equal(client.verifyWebhook(Buffer.from(body), timestamp, sign(timestamp, body)).answers, 4);
});

test('verifyWebhook refuses a changed body', () => {
  const timestamp = now();
  assert.throws(() => client.verifyWebhook(body.replace('"answers":4', '"answers":40'), timestamp, sign(timestamp, body)), VerifyHuError);
});

test('verifyWebhook refuses a signature made with another key', () => {
  const timestamp = now();
  assert.throws(() => client.verifyWebhook(body, timestamp, sign(timestamp, body, 'another-key')), VerifyHuError);
});

test('verifyWebhook refuses a missing or malformed signature', () => {
  const timestamp = now();
  for (const signature of [undefined, '', 'abc', 'not hex at all']) {
    assert.throws(() => client.verifyWebhook(body, timestamp, signature), VerifyHuError);
  }
});

test('verifyWebhook refuses an old message, even with a valid signature', () => {
  const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
  assert.throws(() => client.verifyWebhook(body, timestamp, sign(timestamp, body)), /too old/);
});

test('startRound rejects something that is not a Discord user ID', async () => {
  await assert.rejects(client.startRound('abc'), TypeError);
  await assert.rejects(client.startRound(''), TypeError);
});

test('an unreachable server is reported as VerifyHuError with status 0', async () => {
  await assert.rejects(client.startRound('123456789012345678'), (error) => error instanceof VerifyHuError && error.status === 0);
});
