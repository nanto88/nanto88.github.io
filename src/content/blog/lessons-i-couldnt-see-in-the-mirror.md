---
title: "Lessons I Wish Someone Had Told Me: Bugs I Couldn't See in the Mirror in Software Engineering"
description: "Six hard-earned lessons about systems, humility, abstraction, and leverage that no tutorial teaches you."
pubDate: 2025-05-25
tags: ["career", "system-design", "software-engineering"]
category: "engineering"
---

When I first started out, I believed the key to becoming a great engineer was mastering the technical stuff. I chased every new trend, memorized syntax, solved Leetcode problems, and obsessed over performance tuning. And sure all of that helped. But none of it prepared me for the real challenges I'd face.

After years in this field, debugging not just systems, but also people, teams, communication breakdowns, unclear requirements, missed assumptions and even myself I started to see a different truth.

The most painful bugs aren't caused by bad syntax. They're caused by rushed thinking, misaligned objectives, and ignoring the human side of software.

This is the version of the truth they don't teach you in tutorials.

## Code is an opinion, systems are truth

Your code will be rewritten. Refactored. Deleted. APIs will change. Teams will change. You'll move to a different team or company.

But the system behaviors, the operational patterns, the invisible contracts between components those often live on. Technical artifacts are short-lived. System design decisions are forever.

So when you design, don't just ask:

> "What API response do I need for this feature?"

But ask also:

- "What happens if this fails?"
- "Who depends on this, and how will they know something broke?"
- "Is this observable? Diagnosable? Recoverable?"
- "Will this design still make sense a year from now?"
- "How much traffic per day?"
- "Any edge cases?"

**Systems are truth. A system doesn't lie.** If you thought the code should only run once per user, but it's running twice that's not a bug in the logs, that's a truth in behavior.

📡 : Twice logs

👨‍💻 : That's impossible! My code is perfect. The system must have a glitch!

Meanwhile, the system is in the corner like:

📡 : Bro… I'm literally just doing what you told me.

Logs don't gaslight you. Metrics don't lie. And traces? Traces are that brutally honest friend who shows you exactly what happened timestamped and all.

Logs, metrics, and traces don't care about your assumptions. They just reflect the truth. And the truth is where engineering lives.

What's "clean" today might be legacy tomorrow. But a system that is resilient, observable, and maintainable is timeless.

## Write code with humility and empathy

It's easy to fall into the trap of thinking you're the smartest person in the room. You write a clever one-liner. You invent a new pattern. You create a "perfect" abstraction.

But six months later, someone else (maybe even you) has to maintain that code, and they're cursing your name because they don't understand what you did, or why.

That's why humility matters in code.

- Don't write code to impress write it to be understood.
- Don't try to be over-engineered be clear.
- Don't assume others will know what you meant document your decisions.

And what about empathy? Empathy in this field means thinking beyond your immediate problem:

- How will a junior engineer onboard onto this codebase?
- Will this fail gracefully under pressure?
- How will this API feel to a frontend dev?
- Can ops debug this when alarms trigger at 3AM?
- What happens if this external dependency becomes unreliable?

It's not enough that your service works. It needs to play well with others, degrade gracefully, and be understandable by future maintainers.

Your code is not your legacy how it makes others feel is.

Good engineers solve problems. Great engineers prevent suffering.

## Abstractions are power, and a trap

Abstraction is how we manage complexity. It hides the messy details so we can think at a higher level. But abstraction is also how we lie to ourselves.

A car is a great example of abstraction in real life. You can start one by turning the key or pressing the start button. You don't need to know how the engine starts, or what components your car has under the hood. The internal implementation and complex logic is completely hidden from the user.

Abstraction is the greatest gift and the greatest danger in software.

Here's what bad abstraction looks like:

### The infinite wrapper pattern

You create a `UserManagerService` that wraps a `UserHandler` that calls a `UserClient` that uses a `UserGateway` to talk to the `UserService`.

No one knows where the actual API call is made. You've created a spaghetti of middlemen all with unclear responsibilities.

### The "one function to rule them all" abstraction

```go
func HandleEverything(req Request, ctx Context, config Config, kind string, user User, flags map[string]bool) Result {
  // switch hell
}
```

You didn't create a good abstraction you created a dumping function.

What's wrong?

- It tries to handle too many concerns.
- Adding new behavior is scary.
- Testing this function is a nightmare.

A good abstraction narrows scope. If it grows in parameters and conditionals, it's a God Object in disguise.

### The over-generic utility class

```ruby
class Payment
  def process(data)
    # Who knows what this does?
  end
end
```

What's wrong?

- Vague name.
- Used in ten places for ten different behaviors.
- Now nobody can change it without fear of breaking something else.

If a class can't be described clearly in one sentence, it's probably too generic.

Respect abstraction, but don't worship it. Understand the layers below you.

## Don't build features. Build leverage.

At first sight, this might sound like "so I should stop shipping product features?" Not at all.

It means: don't just solve the immediate problem. Build tools, systems, and primitives that make solving future problems easier, faster, and safer.

Most engineers are taught to ask, "How do I implement this feature?" The leverage question is: "What can I build so that this kind of feature becomes easier to implement in the future?" It's thinking one level up.

A feature might be: add a new payment method for one client.

A leveraged solution might be: build a plugin-based architecture for payment providers, so adding new ones is a one-day job in the future.

Leverage in software means:

- Building tools that scale yourself.
- Automating boring things.
- Creating libraries, patterns, and infra that enable others.

It compounds like interest:

- Your future self works faster.
- Your team scales better.
- Your product evolves more reliably.
- Your organization builds a culture of excellence.

## Know the why behind the what

You're not here to "code a feature." You're here to solve a real problem for a real person often a non-technical one.

Ask not just how to build something, but why it matters. Understanding the "why" forces us to zoom out. Why does the product team want this feature? What user behavior are we trying to change? Is this a temporary fix or part of a longer-term strategy? When you grasp the bigger context the business goal, the customer pain, the strategic importance you can make smarter decisions, propose better alternatives, and avoid wasted effort.

Sometimes the right solution isn't what's written in the ticket at all.

For example, a product manager asks you to add a "Resend verification email" button. Instead of blindly implementing it, you ask why users need to resend so often. You discover that 30% of verification emails are landing in spam because of a misconfigured email header. Now you don't just add the button you also fix the actual underlying issue. That's the power of knowing the why.

## Think in systems, not just code

Most bugs are not from bad logic they're from poor system design:

- Poorly defined ownership.
- Race conditions in distributed systems.
- Cascading failures from tight coupling.

Software is not isolated lines. It's an ecosystem of services, contracts, flows, and humans. Think upstream and downstream. Think flow, not just function.

> In the end, being a great software engineer isn't about following the trend or blindly sticking to old principles. It's about solving the right problems, in the right context, for real people.
