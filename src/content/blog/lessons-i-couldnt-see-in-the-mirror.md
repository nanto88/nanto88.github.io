---
title: "Lessons I Wish Someone Had Told Me: Bugs I Couldn't See in the Mirror"
description: "Six lessons about systems, humility, abstraction, and leverage that no tutorial taught me. Most of them I learned the slow way."
pubDate: 2025-05-25
tags: ["career", "system-design", "software-engineering"]
category: "engineering"
---

When I started out, I thought a great engineer was just a person with great technical skill. So I chased every new framework. I memorized syntax, solved Leetcode problems, and spent weekends on performance tuning.

All of that helped. None of it prepared me for the real problems.

After a few years of debugging systems, I noticed I was also debugging other things. Teams. Communication. Unclear requirements. Assumptions nobody said out loud. And quite often, myself.

The most painful bugs I have seen were not syntax errors. They came from rushed thinking, from goals that did not match, and from ignoring the human side of the work. Here are six lessons about that, in the order I learned them.

## Code is an opinion, systems are the truth

Your code will be rewritten. It will be refactored and deleted. APIs change, teams change, and one day you move to another team or another company.

But system behaviour tends to survive all of that. The operational patterns stay. The invisible contracts between services stay. Code is short lived, and design decisions last much longer.

So when you design something, do not stop at this question:

> "What API response do I need for this feature?"

Ask a few more:

- What happens when this fails?
- Who depends on this, and how will they know it broke?
- Can I observe it, debug it, and recover it?
- Will this design still make sense in a year?
- How much traffic will it get per day?
- What are the edge cases?

A system never lies. If you believe your code runs once per user, and the logs show it ran twice, that is not a logging problem. That is the truth about your code.

I have had this conversation with myself more than once:

📡 The logs: two runs.

👨‍💻 Me: impossible, my code is perfect, the system must be broken.

📡 The system: I am doing exactly what you told me to do.

Logs do not gaslight you. Metrics do not lie. Traces are the honest friend who shows you what happened, with the timestamps to prove it. They do not care about your assumptions at all.

Clean code today can be legacy code next year. A system that is resilient, observable, and easy to maintain stays useful much longer.

## Write code with humility and empathy

It is easy to think you are the smartest person in the room. You write a clever one liner. You invent a new pattern. You build the perfect abstraction.

Six months later somebody has to maintain it. Sometimes that person is you, and you have no idea what past you was thinking. That is why humility belongs in code.

- Write to be understood, not to impress.
- Choose clear over clever.
- Write down the reason for a decision, because the reason is the part people forget.

Empathy is the next step. It means thinking past your own ticket:

- How will a new engineer learn this codebase?
- Will this fail in a safe way when it is under pressure?
- How will this API feel to the frontend developer who uses it?
- Can the on call engineer debug this at 3am?
- What happens when this external service becomes slow or unreliable?

It is not enough that your service works. It has to work well with others, degrade in a predictable way, and make sense to the next maintainer.

Your code is not your legacy. How it makes other people feel is. Good engineers solve problems. Great engineers prevent suffering.

## Abstractions are power, and also a trap

Abstraction is how we handle complexity. It hides messy details so we can think at a higher level. It is also how we lie to ourselves.

A car is a good example. You press the start button and the engine starts. You do not need to know what happens under the hood, because the complexity is hidden from you.

That gift comes with a cost. Here is what a bad abstraction looks like.

### The endless wrapper

You build a `UserManagerService` that wraps a `UserHandler`, which calls a `UserClient`, which uses a `UserGateway` to reach the `UserService`.

Now nobody can find the line that makes the actual API call. You did not remove complexity. You added five middlemen with unclear jobs.

### The one function that does everything

```go
func HandleEverything(req Request, ctx Context, config Config, kind string, user User, flags map[string]bool) Result {
  // a long switch statement lives here
}
```

This is not an abstraction. It is a place to dump code. Three things are wrong with it:

- It handles too many concerns at once.
- Adding new behaviour feels risky, so people stop touching it.
- Writing a test for it is painful.

A good abstraction makes the scope smaller. When the parameter list and the conditionals keep growing, you have a god object wearing a nice name.

### The utility class that is too generic

```ruby
class Payment
  def process(data)
    # what does this do? nobody is sure any more
  end
end
```

The name says nothing. Ten different callers use it for ten different behaviours. Now no one can change it without the fear of breaking something far away.

My rule is simple. If I cannot describe a class in one clear sentence, it is too generic.

Respect abstraction, but do not worship it. Always understand the layer below the one you work in.

## Do not build features, build leverage

This sounds like advice to stop shipping product work. It is not.

It means you should not stop at the immediate problem. Build the tools and the primitives that make the next problem easier, faster, and safer to solve.

Most of us are trained to ask "how do I build this feature?". The better question is "what can I build so that this kind of feature becomes easy next time?".

Here is the difference in practice:

| The request | The feature answer | The leverage answer |
| --- | --- | --- |
| Add a new payment method for one client | Hard code the new provider | Build a plugin interface for providers |
| Next client, next provider | Repeat the same work | One day of config and one adapter |

Leverage in software usually looks like one of these:

- Tools that make you faster at your own job.
- Automation for boring and repeated work.
- Libraries, patterns, and infrastructure that help other people.

The value adds up over time. Your future self moves faster. Your team scales without pain. Your product changes with less risk.

## Know the why behind the what

You are not here to code a feature. You are here to solve a real problem for a real person, and that person is often not technical.

So ask why it matters, not only how to build it. Why does the product team want this? What user behaviour are we trying to change? Is this a quick fix or part of a longer plan?

When you understand the business goal and the customer pain, you make better decisions. You can propose a better option. Sometimes the right solution is not the one written in the ticket.

Here is a real example of that. A product manager asked for a "Resend verification email" button. Before I built it, I asked why so many users needed to resend.

The answer was uncomfortable. Around a third of the verification emails went to spam because of a wrong email header. We fixed the header, and we still shipped the button. Only one of those two changes was in the ticket.

## Think in systems, not only in code

Most of the bad incidents I remember did not come from bad logic. They came from system design:

- Ownership that nobody defined.
- Race conditions between services.
- One slow service that took three others down with it.

Software is not a set of isolated lines. It is an ecosystem of services, contracts, data flows, and people. Think about what sits upstream and downstream of you, not only about the function in front of you.

## What I would tell a new engineer

1. Trust the logs and metrics over your memory of what the code does.
2. Write for the person who reads this at 3am, because one day that person is you.
3. Keep the abstraction small enough to explain in one sentence.
4. Solve today's ticket, then ask what would make the next ten tickets smaller.
5. Ask why before you ask how. The ticket is a guess, not the truth.

Being a good engineer is not about following every trend. It is not about defending old principles either. It is about solving the right problem, in the right context, for real people.
