export interface RoundStarted {
  ok: true;
  /** Opens the window in the browser. */
  url: string;
  /** Opens the window inside Discord. Null until your application ID is set on verify.hu. */
  activity_url: string | null;
  /** Seconds until the link stops working. */
  expires_in: number;
  questions: number;
  streak: number;
  rounds_left: number;
}

export interface RoundRefused {
  ok: false;
  reason: 'cap' | 'off' | 'no_questions';
  /** Only with reason "cap": when the next day starts (UTC). */
  resets_at?: string;
}

export interface FinishedRound {
  event: 'earn.finished';
  partner: string;
  /** Unique per round. Never pay the same round twice. */
  round: string;
  user_id: string;
  /** Answers that count. Can be 0. */
  answers: number;
  questions: number;
  quality: 'ok' | 'low';
  streak: number;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  finished_at: string;
}

export interface TestMessage {
  event: 'earn.test';
  partner: string;
}

export class VerifyHuError extends Error {
  /** HTTP status, or 0 when verify.hu could not be reached. */
  status: number;
}

export class VerifyHu {
  constructor(options: { key: string; baseUrl?: string });
  startRound(userId: string | bigint): Promise<RoundStarted | RoundRefused>;
  fetchFinished(since: string | Date): Promise<{ rounds: FinishedRound[]; next: string }>;
  verifyWebhook(rawBody: string | Buffer, timestamp: string, signature: string): FinishedRound | TestMessage;
}
