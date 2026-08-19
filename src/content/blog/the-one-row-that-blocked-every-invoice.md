---
title: "The One Database Row That Blocked Every Invoice"
description: "How a shared counter row for invoice numbers caused lock timeouts and duplicate numbers, and how one line of SQL fixed both."
pubDate: 2026-08-15
tags:
  - ruby
  - rails
  - mysql
  - concurrency
  - database
category: backend
draft: false
featured: false
---

Some features look boring until they break. Invoice numbers are one of them.

Every invoice in a billing system needs a number. Something like `BPI/2026/08/00025`. It has a prefix, a year, a month, and a counter that goes up by one each time. The counter resets every month. Finance teams rely on these numbers being unique and in order.

It sounds simple. But this small feature once took down an API endpoint in a system I work on. This is the story of what happened, why it happened, and how we fixed it.

## How the numbers were made

We used a Ruby gem that stores counters in a database table. The table is simple. One row per document type, with a counter value.

| counter_model_name | counter | updated_at |
| --- | --- | --- |
| invoice | 24 | 2026-08-17 |

When a new invoice is created, the gem does three steps:

```ruby
element = CustomAutoIncrement.find_or_create_by(...)  # 1. read the counter
element.counter += 1                                  # 2. add one, in Ruby
element.save!                                         # 3. write it back
```

Read. Add one. Write. In normal use, this works fine. With one user at a time, you get 24, 25, 26, and everyone is happy.

The problem starts when two users create an invoice at the same moment.

## Problem one: two users, one number

Look at those three steps again. The reading and the writing are two separate trips to the database. Ruby does the adding in between.

Now imagine two requests arriving together:

1. Request A reads the counter. It sees 24.
2. Request B reads the counter. It also sees 24.
3. Request A writes 25.
4. Request B writes 25.

Both invoices get the number 25. This is a classic bug called a **lost update**. The database never had a chance to protect us, because we asked it to do two small jobs instead of one.

## Problem two: the lock that lasted too long (row locking)

The second problem is worse, and it is less obvious.

When DB updates a row, it locks that row. Other transactions that want the same row must wait. The lock is released when the transaction finishes.

Here is the catch. The counter update ran **inside the request's own transaction**. And that transaction did a lot of other work: creating the invoice, creating the customer record, creating the subscriptions. All of that happened *after* the counter was updated.

So the timeline for one request looked like this:

```
transaction starts
  update the counter      <- lock taken here
  create the invoice
  create the customer record
  create the subscriptions
transaction commits       <- lock finally released
```

The counter row was locked for the entire transaction. Not for the few milliseconds the update needed, but for however long the rest of the work took.

And remember, there is only **one counter row per document type**. Every single invoice creation in the whole system wants **update that same row**. So every request had to wait in line behind the slowest transaction in front of it.

MySQL does not wait forever. There is a setting called `innodb_lock_wait_timeout`. When a request waits longer than that, MySQL gives up and throws an error:

```
Mysql2::Error::TimeoutError: Lock wait timeout exceeded; try restarting transaction
```

## The impact

This is not a theory. It caused a real incident.

When traffic increased, requests began to queue behind each other on that one row. The requests at the back of the queue hit the timeout and failed. Users saw errors. Invoices were not created.

And there was a hidden cost that made it worse. The code already had a retry for duplicate numbers. When a duplicate was detected, it would ask for a new number and try again.

Three problems, stacked:

- Duplicate numbers were possible.
- Requests failed with lock timeouts under normal concurrency.

## Reproducing it on purpose

Before fixing anything, I wanted to see the failure with my own eyes. Guessing is not proof.

I added a `15 seconds sleep inside the transaction`, right after the counter was claimed, and set the `innodb_lock_wait_timeout` to `5 seconds`. Then I sent two requests to the invoice creation endpoint, ~0.5 seconds apart.

The result:

| Request | Status | Time | Result |
| --- | --- | --- | --- |
| A | 201 Created | 15.4s | got number `00025` |
| B | 500 Error | 5.1s | `Lock wait timeout exceeded` |

Request B never got a number. It never created an invoice. It just waited for a row that request A was holding, gave up after 5 seconds, and returned an error to the user.

That 5 second failure is the whole bug in one line.

One more thing I learned here: which request fails is **random**. In an earlier run, the first request was the one that died. The loser is simply whoever reaches the counter second.

## The solution: let the database do the counting

The fix has two parts. Both are small.


### Part one: give the counter its own connection

Making the statement atomic fixes duplicates, but the lock is still held for the whole transaction. So the second part is to run that statement on a **separate database connection**.

A separate connection means a separate transaction. The counter update commits immediately. The lock is released in milliseconds, not after all the other work finishes.

In Rails, this is a few lines:

```ruby
class Conn < ActiveRecord::Base
  self.abstract_class = true
  establish_connection(:"serial_counter_#{Rails.env}")
end
```

Same database, just its own connection pool.

Here is the important part: **neither half works alone.**

- Atomic statement, same connection: correct numbers, but requests still queue and time out.
- Separate connection, old Ruby code: no more queueing, but *more* duplicates. The long lock was accidentally keeping requests apart. Remove it and they collide more often.

They have to ship together.

### The same test, after the fix

Same 15 second pause. Same 5 second lock timeout. Same two requests.

| Request | Status | Time | Result |
| --- | --- | --- | --- |
| A | 201 Created | 16.1s | got number `00026` |
| B | 201 Created | 15.8s | got number `00027` |

Both succeeded. Both numbers are different and in order. The 15 seconds is only the artificial pause I added, not waiting for a lock. Before the fix, request B failed in 5 seconds. After it, request B succeeds.

## One small detail that saved a migration

There is a column called `counter_model_scope`. Some document types use it to keep separate counters. Most do not, and for those it is `NULL`.

In SQL, `column = NULL` is never true. Not false — unknown. So a normal `WHERE counter_model_scope = ''` would match **zero rows** for most of our document types. The code would then think there was no counter yet, insert a new row, and start counting from 1 again. Every new invoice would collide with numbers already issued.

That is why the query uses `<=>` instead of `=`. It is MySQL's null-safe equality operator. `NULL <=> NULL` is true.

That one operator is the reason this fix needed no database migration at all. Worth checking before writing any query that matches on a nullable column.

### Part two: make it one statement

Instead of read, add, write in Ruby, we ask MySQL to do all of it in a single statement:

```sql
UPDATE custom_auto_increments
   SET counter = LAST_INSERT_ID(IF(updated_at < ?, ?, counter + 1)),
       updated_at = ?
 WHERE counter_model_name = ? AND counter_model_scope <=> ?
```

Two MySQL tricks are doing the work here.

`IF(updated_at < ?, ?, counter + 1)` handles the monthly reset. If the row was last touched before the current month began, start over from the beginning. **If not, add one**. The decision and the increment now happen together, in one statement, instead of being split across a Ruby if-statement.

`LAST_INSERT_ID(expr)` is the important part. It saves the value into the column **and** remembers it for the current connection. Right after, we can ask:

```sql
SELECT LAST_INSERT_ID()
```

and get back exactly the number we just wrote. Even if fifty other connections updated that same row in the meantime, this returns *our* number. It is a way to make an `UPDATE` give you a value back, without locking the row for a read first.

Because it is one statement, two requests can no longer both read 24. MySQL handles them one after the other, and each one gets its own number.


## Three things we decided not to do

While designing this, some obvious-looking options turned out to be traps.

**`INSERT ... ON DUPLICATE KEY UPDATE`.** It looks perfect for a counter. But with a `NULL` scope the duplicate condition never triggers, so it inserts a fresh row every time and always returns 1. The nasty part is that it works fine for the document types that *do* use a scope. Tests on those would pass, and the bug would only appear for the others.

**Using SQL `NOW()` for the monthly reset.** The app server clock and the database clock are not always in the same timezone. Near the end of a month, one can think it is August while the other thinks it is September. Then the counter resets while the printed number still shows the old month. So the reset decision is made in Ruby, using the same timestamp that is printed on the invoice.

## The trade-off we accepted

There is a price for this fix, and it is worth stating clearly.

Because the counter now commits on its own connection, it no longer rolls back with the request. If the request fails after taking a number, that number is gone. The sequence gets gaps: 25, 26, 28.

For us this was acceptable. Gaps are a bookkeeping question. Duplicates and failed requests are a customer problem. But this is a decision to make with the people who read those numbers, not one to make quietly in a pull request.


## What I took away from this

**Read-modify-write across two queries is a race, always.** It does not matter how fast your code is. If you read a value, change it in your application, and write it back, two requests can read the same value. Either do it in one statement, or lock it properly.

**Locks last as long as the transaction, not as long as the statement.** This is the part that surprises people. A one millisecond `UPDATE` inside a two second transaction holds its lock for two seconds. If a single row is shared by every request in the system, that becomes your throughput limit.

**Reproduce the bug before fixing it.** Adding a deliberate pause and firing two requests took me an afternoon. It turned "I think this is the problem" into "here is the 5 second failure, and here it is gone." That difference matters when you are asking people to trust a change to how invoice numbers are made.
