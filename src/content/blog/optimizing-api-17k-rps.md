---
title: "How Maintained and Optimized an API at peak 17K RPS [Still Writing...]"
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
The logs using an internal library to produced a log in json formatted. The json body has a request parameters, response status, backtrace, additional context (custom set attribute at code level) and standard convention logging (level/severity, timestamp, message. Reference: https://www.conventionallogs.org/en/v0.0.1/) 

### Metric

The metric set manually each API/gRPC endpoint, process worker, and so on. including the status response, client_id x request attributes, and other details that satisfied finding bottleneck and faster to identify issue.


### Trace
The trace only enabled in staging environment due costly and the team able to reproduce the bottlenecks in staging. It's instrumentation by `datadog` so the application will automatically set a trace each call a function or process in library. Other than that, we can set an additional trace if the instrumentation doesn't has a trace.

Sometimes we POC a new way of optimization in local by generate a flamegraph.

## How the google Bigtable works
Google Bigtable is a distributed, fully managed NoSQL wide-column database designed to handle petabyte-scale data with millisecond latency. I would like to share an introduction and a reason why the data team using this storage in software engineering perspective and beneficial in application side.

![bigtable](https://www.whizlabs.com/blog/wp-content/uploads/2021/09/3rd-Dimension-Cells-in-Bigtable.png)

Bigtable visualize data as a multidimensional table indexed by a Row Key, Column Family, Column Qualifier, and a Timestamp.
- Row Key: The primary index used to look up data. Data is stored in alphabetical order by this key.
- Column Families: Columns that are related to one another are grouped together. These must be defined upfront. 
- Column Qualifiers: Individual column names within a family, which can be created dynamically on the fly.
- Timestamps: Every data cell contains a timestamp version. This allows Bigtable to keep historical versions of the data in the same cell.
- Sparse Storage: Unused columns do not occupy any physical disk space or require NULL record

## Lessons learned

The bottleneck was never the language or the framework — it was a query
running far more often than the data underneath it actually changed. Cache
the read, invalidate on write, and measure before touching anything else.
