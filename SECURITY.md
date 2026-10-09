# Security

## Reporting a problem

If you find a way to forge a webhook, start rounds without a key, or learn anything about a player beyond what this README says is sent, please tell us privately through the contact form on [verify.hu](https://verify.hu) before opening a public issue. We answer within a few days.

Ordinary bugs in the examples are welcome as normal issues.

## If your key leaks

Ask us for a new one. The old key stops working the moment the new one is made, so put the new key into your bot straight away.

Signs a key has leaked: rounds started for users who never ran your command, or `429` answers you did not cause.

## What the client trusts

- It only talks to `https://verify.hu` unless you pass another `baseUrl`.
- A webhook is accepted only if its signature matches your key and it is less than five minutes old.
- It never logs your key and never sends it anywhere except in the `Authorization` header to verify.hu.
