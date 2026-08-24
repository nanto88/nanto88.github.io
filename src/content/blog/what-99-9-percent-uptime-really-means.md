---
title: "99.9% Uptime Is a Budget, Not a Promise"
description: "A single-cluster Bigtable gives you 99.9% uptime. That number doesn't mean smooth. It means 43 minutes of timeouts that show up with no warning and no cause you can see from your side."
pubDate: 2026-08-24
tags:
  - reliability
  - sla
  - bigtable
  - distributed-systems
  - observability
category: system-design
draft: false
featured: false
---

Someone on the team picks a database. The docs say 99.9% uptime. Everybody reads that as "it's basically always up," nods, and moves on to the interesting part of the design.

Then one Tuesday afternoon your API starts returning timeouts. Not all of them, just enough to page someone. Nobody deployed. No query changed. Traffic looks exactly like last Tuesday. You stare at a dashboard that says your service is healthy and cannot reach its storage, and twenty minutes later it stops on its own.

The number was never wrong. We just read it wrong.

## The number is an allowance, not a description

Uptime targets all look about the same when they're printed next to each other. The distance between them is enormous.

| Target | Down per 30-day month | Down per day |
| --- | --- | --- |
| 99% | 7 h 12 m | 14 m 24 s |
| 99.9% | 43 m 12 s | 1 m 26 s |
| 99.99% | 4 m 19 s | 8.6 s |
| 99.999% | 26 s | 0.9 s |

A 30-day month is 43,200 minutes. A tenth of a percent of that is 43.2 minutes. So 99.9% is a provider telling you, in advance and in writing, that you get about 43 minutes of failure a month and they owe you nothing for it. Those minutes aren't a bug. They're the product.

The useful way to hold this is as an error budget: a fixed amount of failure you're allowed to spend every month. The budget isn't a threat, it's a planning tool. The only real question is whether you decide what happens during those 43 minutes now, or discover it live at 2am.

## Bigtable makes this very easy to see

Google Cloud Bigtable publishes different uptime targets for different shapes of the same product. A single cluster sits at the bottom tier. Multi-cluster routing, where your traffic can land on more than one cluster, sits higher. (Pull the exact tiers off the current SLA page before you quote them to anyone — they change, and the exclusions matter more than the headline anyway.)

The reason for the gap isn't mysterious. One cluster lives in one zone, and one zone is one failure domain. If that zone is having a bad day, your data is unreachable, and no amount of retrying inside that zone is going to help you.

There's a subtler version of the same thing that bites more often. Bigtable rearranges itself while it's running: it splits a tablet when the tablet gets big, and it moves tablets between nodes to balance load. Requests to that key range wait while it happens. What you see on your end is a single line in the logs — `DEADLINE_EXCEEDED` — and nothing else.

That's the part that catches people. The timeout absolutely has a cause. The cause is just on the other side of a wall you can't look over.

## The budget doesn't arrive evenly

Those 43 minutes do not show up as 1.4 seconds a day. Distributed storage doesn't sag gracefully; it fails in whole events. You get nothing for forty days, then eleven minutes all at once, then nothing again for three weeks.

Which is exactly why the first incident feels like a bug in your own code. It's sudden, it's total, and it goes away without anyone fixing it. Someone reads the logs, finds nothing, writes "transient issue, monitoring" in the ticket and closes it. That ticket is completely accurate and completely useless, and six weeks later it happens again.

## You inherit every number underneath you

Your service is never more available than the chain it sits on. Multiply the targets and the arithmetic gets ugly fast:

- One dependency at 99.9% → 99.9%, or 43 minutes a month.
- Three dependencies at 99.9% → 99.7%, or about 129 minutes a month.
- Ten dependencies at 99.9% → 99.0%, or roughly 7 hours a month.

You cannot promise a customer 99.99% while your storage promises 99.9%. Not with tidier code, not with a nicer dashboard, not with a more senior on-call rotation.

There are exactly two ways past the ceiling: add redundancy (a second cluster), or hide the failure (a cache, a queue, a degraded path). Both cost money. The point is to choose one deliberately, with the price written down, instead of finding out during an incident that you chose neither.

## Read the SLA the way a lawyer would

An SLA is a refund policy. It is not a performance guarantee, and it never claimed to be. Four questions get you most of the way:

1. **What's the measurement window?** A monthly window means your pain resets on the first of the month, no matter how bad the 30th was.
2. **What counts as an error?** Plenty of contracts count failed requests only. A request that takes nine seconds and succeeds is not a failure to them, even though it's a failure to your user.
3. **What's excluded?** Usually your own malformed requests, quota limits, preview features, and planned maintenance.
4. **What do you actually get?** A service credit, almost always. A credit against next month's bill does not pay for the customer who left.

Worth saying out loud in the design review, because it reframes everything: the provider pays you a small credit, and you pay the full cost of the outage.

## Then respect the number in code

The budget is fixed. What your service does with it is entirely up to you, and most of it comes down to six habits.

**Put a deadline on every call.** A call with no deadline can hold a connection until it dies of old age, and one slow dependency will quietly eat your entire pool. Think of your deadline as a promise to whoever is calling *you*.

**Retry only what's worth retrying.** `UNAVAILABLE` and `DEADLINE_EXCEEDED` are fair game. `INVALID_ARGUMENT` and `PERMISSION_DENIED` are not — retrying a permanent error just gets you the same failure, slower.

**Back off, and add jitter.** Without jitter every client retries on the same tick, and the retry storm holds the dependency down well after it was ready to recover.

```go
const maxAttempts = 3

func retryable(err error) bool {
	switch status.Code(err) {
	case codes.Unavailable, codes.DeadlineExceeded:
		return true
	}
	return false
}

func withRetry(ctx context.Context, op func(context.Context) error) error {
	var err error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err = op(ctx)
		if err == nil || !retryable(err) {
			return err
		}
		// exponential backoff, plus jitter so clients do not sync up
		ms := float64(int64(1)<<attempt) * 50 * (0.5 + rand.Float64())
		select {
		case <-time.After(time.Duration(ms) * time.Millisecond):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return err
}
```

**Make writes idempotent before you make them retryable.** A retry must not create a second row or charge a customer twice. A deterministic row key does it, or a request token the write checks first. Retries without idempotency turn a blip into a data problem.

**Cap the retry budget globally, not just per request.** Three attempts each sounds modest until the cluster is down and you're sending three times your normal load into it. Shed the retries at the service level when the failure rate stays high.

**Decide the fallback before the incident, not during it.** A read can serve something stale from cache. A write can go on a queue and land later. A non-critical feature can switch itself off and say so plainly. The worst fallback is the one you didn't pick: a blank page and a 500.

## Alert on the burn rate, not on the error

One timeout at 02:00 is inside the budget. If that timeout wakes someone up, the only thing it teaches them is to stop trusting the pager, and that's a much more expensive problem than the timeout.

Alert on speed instead. The question isn't "did something fail," it's "at this rate, when is the month's budget gone?"

```
budget_minutes  = 43.2
burn_per_hour   = error_rate * 60
hours_remaining = budget_minutes / burn_per_hour
```

Burning through the month in three days needs a human right now. Burning through it in six weeks needs a ticket and a coffee. Two thresholds, two very different responses, and nobody gets woken up for arithmetic that could have waited.

## And tell the truth to whoever asks

Product will ask for a number. Give them the real one, along with the price of a better one:

- "Our storage tier allows 43 minutes a month. We inherit that, we don't get to argue with it."
- "A second cluster brings it down. It also raises the bill by this much."
- "When it goes, it goes suddenly and briefly. Users will see errors, not slowness."

It's a short, slightly uncomfortable conversation. The one after a silent outage is much longer and much worse.

## What I'd tell a team starting out

1. List the uptime target of every dependency in one table. All of them, including the boring internal ones.
2. Multiply them. That product is your actual ceiling, whatever the roadmap says.
3. Convert it to minutes per month, because minutes feel real and percentages don't.
4. Pick the behaviour for those minutes: retry, degrade, queue, or fail fast and say so.
5. Alert on the burn rate. Never on a single error.
6. Tell the business the real number before the first incident, not after.

99.9% was never a promise that the system stays up. It's a statement about how much failure the provider is comfortable with. Everything after that sentence is your job.
