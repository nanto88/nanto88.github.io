---
title: "How I Optimized an API to 10K RPS"
description: "Lessons learned while optimizing a high-throughput backend service."
pubDate: 2026-08-10
tags:
  - backend
  - performance
  - golang
  - system-design
category: backend
draft: false
featured: true
---

A few months ago I was handed a service that fell over at around 800 requests
per second. Here's what it took to get it comfortably past 10,000.

## The problem

The service sat behind an API gateway and answered a single hot endpoint:
look up a user's entitlements by ID. Traffic was spiky — mostly idle, then a
burst during business hours that would spike p99 latency from 40ms to well
over a second and start timing out.

## Finding the bottleneck

Before changing anything, I profiled the request path end to end. The
culprit wasn't the application code — it was a database call happening on
every single request, even though the underlying data changed maybe once an
hour.

```go
func GetEntitlements(userID string) (*Entitlements, error) {
    row := db.QueryRow("SELECT * FROM entitlements WHERE user_id = $1", userID)
    // ...
}
```

Every request paid the full round trip to Postgres, connection pool
contention included.

## Redis caching

The fix was a read-through cache in front of the query, keyed by user ID
with a short TTL and an explicit invalidation on writes.

```go
func GetEntitlements(userID string) (*Entitlements, error) {
    if cached, ok := cache.Get(userID); ok {
        return cached, nil
    }

    entitlements, err := queryEntitlements(userID)
    if err != nil {
        return nil, err
    }

    cache.Set(userID, entitlements, 5*time.Minute)
    return entitlements, nil
}
```

That single change took the database out of the hot path for over 95% of
requests.

## Database optimization

For the remaining cache misses, two things helped:

- An index on `user_id` that was missing entirely.
- Switching from `SELECT *` to the specific columns the endpoint actually
  used, which mattered more than expected once row sizes grew.

## Results

| Metric        | Before | After |
| ------------- | ------ | ----- |
| Throughput    | 800 rps | 12,000 rps |
| p99 latency   | 1,100ms | 35ms |
| DB CPU        | 90%    | 12%   |

## Lessons learned

The bottleneck was never the language or the framework — it was a query
running far more often than the data underneath it actually changed. Cache
the read, invalidate on write, and measure before touching anything else.
