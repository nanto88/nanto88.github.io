---
title: "How We Maintained and Optimized an API at peak 17K RPS"
description: "Lessons learned while optimizing a high-throughput backend service."
pubDate: 2024-03-10
tags:
  - backend
  - performance
  - golang
  - system-design
category: backend
draft: false
featured: true
---



## Background

I would like to share experience how the team handle a service at peak ~17000 Requests per second (RPS). The service domain is a micro service delivering user data attributes for other services via Bigtable and Redis Cluster to REST API and gRPC in e-commerce company.

## The service

the service delivering a user data attributes like an age, fullname, address, region, city and so on. the user data will utilized for campaign banner the users would see, the data scientist to modeling data, and other micro service that display and process the user data.

mainly the request will processed through gRPC, so there's a central repository for contract of gRPC services. Every request to fetch this data is through postgres, redis, and google bigtable.

## Monitoring

The team monitoring every logging, metric, and traces within clean and encriched attributes. All of optimization and faster resolving problems comes from high quality observability.

### Log
The logs using an internal library to produced a log in json formatted. The json body has a request parameters, response status, backtrace, additional context (custom set attribute at code level) and standard convention logging (level/severity, timestamp, message. Reference: https://www.conventionalogs.org/en/v0.0.1/) 

### Metric

The metric set manually each API/gRPC endpoint, process worker, and so on. including the status response, client_id x request attributes, and other details that satisfied finding bottleneck and faster to identify issue.


### Trace
The trace only enabled in staging environment due costly and the team able to reproduce the bottlenecks in staging. It's instrumentation by `datadog` so the application will automatically set a trace each call a function or process in library. Other than that, we can set an additional trace if the instrumentation doesn't has a trace.

Sometimes we POC a new way of optimization in local by generate a flamegraph.

## The service use Bigtable. How the Bigtable works.
Google Bigtable is a distributed, fully managed NoSQL wide-column database designed to handle petabyte-scale data with millisecond latency. I would like to share an introduction and a reason why the data team using this storage in software engineering perspective and beneficial in application side.

![bigtable](https://www.whizlabs.com/blog/wp-content/uploads/2021/09/3rd-Dimension-Cells-in-Bigtable.png)

Bigtable visualize data as a multidimensional table indexed by a Row Key, Column Family, Column Qualifier, and a Timestamp.
- Row Key: The primary index used to look up data. Data is stored in alphabetical order by this key.
- Column Families: Columns that are related to one another are grouped together. These must be defined upfront. 
- Column Qualifiers: Individual column names within a family, which can be created dynamically on the fly.
- Timestamps: Every data cell contains a timestamp version. This allows Bigtable to keep historical versions of the data in the same cell.
- Sparse Storage: Unused columns do not occupy any physical disk space or require NULL record

### Reason

Our read pattern is simple: give me one user, give me a few attributes. Bigtable is built for exactly this.

- **One lookup by row key.** The row key is the only index, and the row key is the user id. There is no join and no query planner. The read cost is the same with 10 million rows or 10 billion rows.
- **A new attribute is not a migration.** Column qualifiers are created when we write them. When the data team adds a new attribute, we do not run `ALTER TABLE` and we do not deploy anything. Old rows simply do not have that column.
- **Sparse data stays cheap.** Most users only have some of the attributes. In a SQL table those become NULL columns that still cost space. In Bigtable an empty cell costs nothing.
- **Writes do not block reads.** The ingestion jobs rewrite many rows on a schedule. In Postgres that means lock and vacuum pressure on our read traffic. In Bigtable it is only more writes, and we add nodes when we need more throughput.
- **History is free.** Every cell keeps versions with a timestamp, so "what was this value last week" is a read filter, not another table.

The trade-offs are:

- There is no secondary index and no join. Any query that is not by row key or row key range becomes a full scan. At our size that is not possible.
- So the row key design *is* the schema design. If it is wrong, you cannot add an index later. You have to rewrite the table.

### Data Type 
all of data has a suffix data type, let's say age_int, amount_float64, transaction_at_timestamp. the application level will cast datatype by that suffix.

The reason for this convention is that Bigtable stores cell contents as raw bytes. If no type information is provided, it treats the value as bytes with an unknown encoding ([Bigtable data types](https://cloud.google.com/bigtable/docs/data-types)). The database will never tell us that `age` is a number. So we put the type in the column name, and the application casts by that suffix when it reads.

### Data availability and ingestion
there's realtime data, hourly data, daily data, and weekly data
every updates we have received event pubsub so we can update that data to redis if we already cache

These four tiers are the most useful thing to remember, because the cache TTL must follow the refresh cadence of each attribute, not one global number. A weekly attribute with a 5 minute TTL means thousands of useless Bigtable reads. A realtime attribute with a 1 hour TTL is a correctness bug that looks like a tuning problem.

The ingestion jobs belong to the data team and write to Bigtable directly. We are never in that path. What we own is the reaction:

- **The Pub/Sub event is a signal to invalidate, not the data itself.** It tells us which user and which attribute changed. We delete the Redis key, and the next request fills it again from Bigtable. If we write the event payload into the cache, one late or partial message leaves a wrong value that no TTL can fix in time.
- **Keep the source timestamp inside the cached value.** Delivery is at least once and the order is not guaranteed, so an update older than what we already hold is dropped.
- **Make the handler idempotent.** The same event twice must give the same result as one time.
- **Backfill is the dangerous case.** A daily or weekly job rewrites millions of rows, so we receive a flood of events. If we invalidate all of them at once, a large part of the cache becomes empty and every next request goes to Bigtable together. We group invalidations per user, add jitter to the TTL so keys do not expire at the same second, and use single flight so one miss triggers one read, not one read per waiting request.

## Mastering the cache: BT - DB - Redis Cache - Storage Cache?
there's an OAuth client in postgres db, caching to the redis, and we have a caching to the 
`localStorage` under backend instance. the cache key is a timestamp x client_id. if the timestamp + now is under 5mins, the OAuth's access_token will read through that `localstorage` otherwise call to redis or db. Im not sure whether it's best practice, but it works and has been optimized through legacy :).

There are 3 layers. Each one exists because the layer below it is much more expensive.

| layer | holds | lifetime | why |
| --- | --- | --- | --- |
| local storage (in process) | OAuth access_token per `client_key` | 5 minutes (every last call each instance) | no network call at all |
| Redis Cluster | user attributes, hot OAuth client rows | seconds to days, per freshness tier | shared by all instances |
| Postgres | OAuth clients, config | source of truth | small, relational, rarely read directly |

**Why the token cache is in the process and not in Redis.** Every request needs it. At 17K RPS, one Redis round trip only to check a token is 17K extra network calls per second, for a value of a few hundred bytes that is the same in every instance. A copy per process is free. Asking the network is not. The price is revocation lag: a revoked client can still work until the 5 minute window ends. So revocation needs its own invalidation path and cannot depend only on the timestamp check.

### Pre-cache by Usecase
we have a monitoring request API and has a specific attributes client_id x user_data_attributes. so we able to grouping to request bigtable by many attributes in onetime then when client start to request, we have a data in redis cache

Here the `client_id x request attributes` metric from the monitoring section becomes useful. After a few weeks the shape of the traffic is clear: a small number of `(client, attribute set)` pairs cover most of the volume, and each client asks for the same set almost every time. That is a predictable workload, and a predictable workload can be moved off the critical path.

So a warmer job runs before the peak window:

1. take the top `(client_id, attribute_set)` pairs by request volume,
2. read their users from Bigtable in batches, with the same server side filter that the request path uses,
3. write them to Redis with a pipeline, using exactly the same key shape and encoding as the request path, and a TTL from the freshness tier of the attribute.

Two rules keep this safe:

- **The request path does not change.** It is still Redis, then miss, then Bigtable. Pre-cache only moves the hit ratio, so it can never become a correctness dependency. A failed warmer run means a slower peak, not an outage.
- **Only warm stable data.** If we warm an attribute that changes every minute, the value is already invalid before anyone reads it. We paid for the read twice and cached nothing.

Campaign traffic is the clearest example. The schedule and the audience are both known in advance, so the data is already in Redis before the banner goes live. Then the peak is not a spike of Bigtable reads. It is only a lot of cache hits.

## Lessons learned

The bottleneck usually in how we query
running far more often than the data it actually changed. Cache
the read, invalidate on write, and measure before touching anything else.
