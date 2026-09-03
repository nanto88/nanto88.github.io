---
title: "Protecting PII data through encrypting a live service"
description: "How to encrypt personal data in a database that is already running: the migration phases, how to read and write, how to search, and the mistakes to avoid."
pubDate: 2026-08-19
tags:
  - security
  - encryption
  - mysql
  - database
category: backend
draft: false
featured: false
---

Most systems start the same way. You create a `users` table. You add an `email` column. You add a `phone` column. You store the values as plain text, because that is the fastest way to ship.

Then the system grows. One day someone asks a simple question: *what happens if a copy of this database leaks?*

The answer is uncomfortable. Every email, every phone number, every address, and every tax ID is readable by anyone who opens the file. No password needed. No key needed. Just a text editor.

This is the story of adding encryption to a database that was already live, with real users and real data. I will keep it practical: the design choice, the migration phases, how to read and write, how to search, and the mistakes we made along the way.

## First, agree on what you are protecting

"Encryption" is a big word. Before writing any code, be clear about the threat you are stopping.

We were protecting against **data at rest**. Someone gets a database dump, a backup file, or read access to a replica. They should not be able to read personal data.

We were **not** trying to hide data from the application itself. The application needs to show an invoice to the finance team, so it must be able to decrypt. This is important, because it means the key must live somewhere the app can reach it. If someone takes over your server, encryption at rest will not save you. That is a different problem, with different solutions.

Being honest about this stops you from over-promising later.

## The first big decision: where does the ciphertext live?

There are two ways to store encrypted data. This one choice affects everything else, so think slowly here.

| | In place | Shadow column |
| --- | --- | --- |
| Where | Same column: `email` now holds ciphertext | New column: `email` + `email_enc` |
| Migration | Overwrite each row | Add a column, fill it, keep the old one |
| During migration | Plain text is gone after each write | Plain text is still there |
| Rollback | Decrypt everything back | Turn a flag off |
| Disk space | Same | More |

Many frameworks give you the first option out of the box. In Rails you write `encrypts :email` and the framework handles it. It is clean, it is well tested, and it wires into everything: `where`, `pluck`, dirty tracking, all of it.

We chose the second option anyway. Here is why.

With in-place encryption, the moment you write a row, the plain text is **destroyed**. If your key is wrong, or your config is wrong, or one model was set up badly, you find out later and by then the original value is gone. To go back you must decrypt every row, which needs a working key. But a broken key is exactly the thing that made you want to go back.

With a shadow column, the plain value stays in the old column while you build confidence. Rollback is one environment variable. That is worth the extra disk.

### **Lesson 1: during a migration, the ability to go back is worth more than clean code.**

## The shape of the design

For each personal field we ended up with three columns:

| Column | Holds | Example |
| --- | --- | --- |
| `email` | The original plain value | `budi@example.com` |
| `email_enc` | The encrypted value | `v1:k3Rf9t...` |
| `email_search_token` | A fingerprint for searching | `9f2c81...` (64 hex chars) |

The third column looks strange now. It will make sense when we get to searching.

## Migrate in phases, never in one jump

This is the part people rush, and it is the part that hurts. We used four phases, each behind its own flag:

```ruby
module Encryption
  IS_SAVE_ENCRYPTION_ENABLED   = ENV['WRITE_ENC_DATA'] == '1'   # Phase 1
  IS_USE_ENCRYPTION_ENABLED    = ENV['READ_ENC_DATA'] == '1'    # Phase 2
  IS_STOP_SAVE_PLAIN_PII_DATA  = ENV['STOP_SAVE_PLAIN'] == '1'  # Phase 3
end
```

Simple constants read from the environment. Nothing clever.

| Phase | What happens | Can you undo it? |
| --- | --- | --- |
| 1. Write both | Every save writes plain **and** encrypted | Yes, instantly. Flag off. |
| 1.5. Backfill | A job encrypts the old rows | Yes. It only touches the new columns. |
| 2. Read encrypted | Readers use the encrypted column | Yes, instantly. Flag off. |
| 3. Stop writing plain | New saves set the plain column to `NULL` | **No. But undo by decrypting from encrypted data** |
| 4. Wipe plain | A job clears the old plain data | **No. But undo by decrypting from encrypted data** |

Notice where the line is. Phases 1 and 2 are free to undo. Phase 3 is not.

And Phase 3 hides a trap we walked into. We had code that looked like this:

```ruby
if IS_STOP_SAVE_PLAIN_PII_DATA
  search_by_token
else
  search_by_plain_column
end
```

This looks correct, but **it is not**. The flag tells you what the app is doing **right now**. It doesn't tell you what the data looks like. If the flag was on for two hours last week, some rows already have `NULL` in the plain column forever. Turning the flag off does not bring them back.

So the `else` branch searched a column that was already empty for those rows, and users disappeared from search results.

### **Lesson 2: after a one-way phase, never ask "is the flag on?". The flag is about behaviour. Your data is about history.** We removed the branch and always use the new path.

One more thing about Phase 3: turn it on **one table at a time**. If something is wrong, you damaged one table, not thirty.

## Writing: hook into save, and keep it boring

The write path is three small jobs that run before every save:

```ruby
before_save :save_encrypted_data      # plain -> email_enc
before_save :save_search_tokens       # plain -> email_search_token
before_save :stop_save_plain_pii      # Phase 3: plain -> NULL
```

Two details matter more than they look.

**Only work when the value changed.** If you re-encrypt on every save, you rewrite rows for no reason, and you can overwrite a value that a backfill job just fixed:

```ruby
next unless will_save_change_to_attribute?(source_column)
```

**Never null the plain column unless the encrypted one is really there.** This guard costs one line and prevents permanent data loss:

```ruby
next if self[encrypted_column].blank?   # nothing to fall back to yet
self[source_column] = nil
```

Order matters too. Encrypt first, then check, then null. If you null first and the encryption fails, you have nothing.

## Reading: one method, with a fallback

Reading is where the shadow column pays you back. We generate a reader for each field:

```ruby
def email
  if use_encryption_enabled? && self[:email_enc].present?
    decrypt(self[:email_enc])
  else
    read_attribute(:email)     # the rollback path
  end
end
```

Four lines, and the last two are the safety net. If the flag is off, or the encrypted value is missing, you get the old value. Nobody sees an error page.

But be aware of what this does **not** cover. The generated method is a normal Ruby method, so anything that skips Ruby goes straight to the plain column:

```ruby
user.email              # decrypted
user.email_was          # plain column
User.pluck(:email)      # plain column
User.where(email: x)    # plain column
```

This is the honest cost of the shadow-column design. A framework attribute type covers all of these because it sits deeper. Our version does not, so every one of those call sites has to be found and fixed by hand. Write it down for your team; do not assume people will guess it.

## Searching: the hard part

Now the problem that surprises everyone.

Good encryption produces **different output every time**, even for the same input. Encrypt `budi@example.com` twice and you get two different strings. This is what you want for safety. It also means this query can never work:

```sql
SELECT * FROM users WHERE email_enc = '<encrypted value>'
```

Two encryptions of the same email do not match. So how do you let the support team search by email?

The answer is a **search token**: a one-way fingerprint of the value, stored in its own indexed column.

```ruby
def token(value)
  norm = value.to_s.strip.downcase          # normalise first!
  OpenSSL::HMAC.hexdigest('SHA256', @secret, norm)
end
```

Two rules make this safe and usable.

**Use HMAC, not a plain hash.** A plain `SHA256(phone)` can be broken by anyone who gets the column. There are only about ten billion possible phone numbers in one country, and a laptop can try all of them. HMAC mixes in a secret key, so the attacker cannot build that list without the key. Use a **different** key from your encryption key, so one leak does not break both.

**Normalise before hashing.** `Budi@Example.com ` and `budi@example.com` must produce the same token, or your search will fail in a way nobody can explain. Strip spaces, lowercase, and do it in exactly one place.

Then searching is a normal indexed lookup:

```ruby
User.where(email_search_token: token)
```

Fast, and no decryption needed.

What you lose is real, so plan for it:

- No `LIKE '%budi%'`. A fingerprint of part of a value has nothing to do with the fingerprint of the whole value.
- No `ORDER BY`, no `>` or `<`. Tokens have no order.
- Common values group together. Thousands of people named "Budi" produce the same token, so that query returns thousands of rows. We hit this and had to change a `pluck` + `IN (...)` into a subquery, because the `IN` list got huge.

Tell your product team early. "Search by exact email works, search by part of a name does not" is a design conversation, not a bug report.


## Key versions: put the version in the data

Keys get rotated. When they do, you want to know which key encrypted which row. We store the version as a prefix:

```
v1:k3Rf9tQm...
```

Now a row tells you its own key version. Rotating is easy: keep old keys for reading, use the new key for writing, backfill when convenient.

We also made one small change that improved our debugging a lot. The old code did this:

```ruby
key_for(version) || current_key      # WRONG: silent fallback
```

If version `v2` was missing from the key ring, it quietly tried the current key. Decryption then failed with a generic "authentication failed" error, and we spent time looking at the wrong thing. Now it raises a real error that names the missing version. Same failure, but the message tells you what to fix.

### **Lesson 3: a fallback that hides the cause is worse than an error.**

## Conclusion

Encryption itself is the easy part. Every library does AES correctly. The hard parts are the migration, the rollback, the searching, and being honest about what breaks.
