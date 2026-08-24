---
title: "99.9% Uptime Is a Budget, Not a Promise"
description: "A single-cluster Bigtable gives 99.9% uptime. That number does not mean smooth. It means 43 minutes of timeouts that arrive with no warning and no cause you can see."
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

A team picks a database. The documentation shows a number: 99.9% uptime. The team reads it as "always up". Work continues.

Then one Tuesday the API returns timeouts for twenty minutes. Nobody deployed code. No query changed. Traffic was normal. The dashboards show a healthy service that cannot reach its storage.

The number was correct. The way we read the number was wrong.

## The number is an allowance

Uptime targets look similar on paper. The gap between them is large.

| Target | Down per 30-day month | Down per day |
| --- | --- | --- |
| 99% | 7 h 12 m | 14 m 24 s |
| 99.9% | 43 m 12 s | 1 m 26 s |
| 99.99% | 4 m 19 s | 8.6 s |
| 99.999% | 26 s | 0.9 s |

A 30-day month holds 43,200 minutes. One tenth of one percent of that is 43.2 minutes. So 99.9% permits 43 minutes of failure each month. The provider owes you nothing for those minutes. Those minutes are part of the deal.

Engineers call this space the error budget. The budget is not a threat. The budget is a plan. You must decide in advance what your service does when the budget is spent.

## Bigtable is the clearest example

Google Cloud Bigtable states different targets for different shapes of the same product. A single cluster gets the lowest target. Multi-cluster routing sends your traffic to more than one cluster, and it gets a higher target.

Check the current SLA page before you quote an exact figure to a customer. The tiers change, and the exclusions matter more than the headline number.

The reason is simple. One cluster lives in one zone. One zone is one failure domain. If that zone has a problem, your data is unreachable. No retry inside that zone helps you.

Bigtable also moves work while it runs. It splits a tablet when the tablet grows. It moves a tablet to another node to balance load. A request to that key range waits during the move. From your side you see one thing only: `DEADLINE_EXCEEDED`.

This is the part that surprises people. The timeout has a cause not visible to you.

## Your uptime is the product of your dependencies

A service is never more available than the chain it depends on. Multiply the targets.

- One dependency at 99.9%: 99.9%. That is 43 minutes per month.
- Three dependencies at 99.9%: 99.7%. That is 129 minutes per month.
- Ten dependencies at 99.9%: 99.0%. That is 7 hours per month.

You cannot promise a customer 99.99% when your storage promises 99.9%. Not with better code. Not with a better dashboard.

You can only beat that number in two ways. You add redundancy, such as a second cluster. Or you make the failure invisible, such as a cache or a queue. Both cost money. Pick one on purpose.

## Read the SLA as a lawyer reads it

An SLA is a refund policy. It is not a performance guarantee. Four questions matter.

1. What is the measurement window? A monthly window resets your pain every month.
2. What counts as an error? Some contracts count failed requests only. A slow request is not always a failed request.
3. What is excluded? Common exclusions are your own bad requests, quota limits, preview features, and planned maintenance.
4. What do you get back? Usually a service credit. A credit does not pay for the customer that left.

Say this out loud in the design review. The provider pays you a small credit. You pay the full cost of the outage.

## Respect the number in code

The budget is fixed. Your response to the budget is not. Six rules cover most cases.

**Set a deadline on every call.** A call with no deadline can hold a thread until the connection dies. One slow dependency then consumes your whole pool. Your deadline is a promise to your own caller.

**Retry the right errors only.** `UNAVAILABLE` and `DEADLINE_EXCEEDED` are worth a retry. `INVALID_ARGUMENT` and `PERMISSION_DENIED` are not. A retry on a permanent error is a slower failure.

**Add backoff and jitter.** Without jitter, every client retries at the same moment. The retry storm then keeps the dependency down after it recovers.

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

**Make the write idempotent.** A retry must not create a second row. A retry must not charge a customer twice. Use a deterministic row key, or a request token that the write checks first.

**Cap the total retry budget.** Three attempts per request against a dead cluster still triples your load. Stop the retries at the service level when the failure rate stays high.

**Decide the fallback before the incident.** A read can serve stale data from a cache. A write can go to a queue and land later. A non-critical feature can turn itself off and show a clear message. The worst fallback is a blank page and a 500.

## Alert on the burn rate, not on one error

A single timeout at 02:00 is inside the budget. If that timeout pages an engineer, the engineer learns to ignore the page. That is the real damage.

Alert on speed instead. Ask one question: at the current failure rate, when is the monthly budget gone?

```
budget_minutes  = 43.2
burn_per_hour   = error_rate * 60
hours_remaining = budget_minutes / burn_per_hour
```

A rate that spends the month in three days needs a human now. A rate that spends the month in six weeks needs a ticket. Two thresholds, two responses.

## Tell the truth to the people who ask

Product asks for a number. Give them the honest one, and give them the price of a better one.

- "Our storage tier permits 43 minutes per month. We inherit that."
- "A second cluster reduces it. It also raises the monthly bill by a known amount."
- "The failure is sudden and short. Users see errors, not slowness."

This conversation is short and uncomfortable. The conversation after a silent outage is long and worse.

## What I tell a team now

99.9% is not a promise that the system stays up. It is a statement about how much failure the provider accepts. Your job starts after that sentence.
