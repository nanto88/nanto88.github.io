---
title: "Kotlin Multiplatform: Share the Logic, Keep the UI Native"
description: "Why I started using Kotlin Multiplatform in a side project. The logic is shared, and each platform keeps its own native screens."
pubDate: 2026-10-04
tags:
  - kotlin
  - kotlin-multiplatform
  - android
  - ios
  - ai-sdlc
category: programming
draft: false
featured: true
---

Building an app for Android and iPhone usually means two code bases, or a framework that shares the screens too. Kotlin Multiplatform offers a third option. You share the logic and keep the screens native.

This post covers how it differs from React Native and Flutter, and what the public performance numbers say. Then I show what I moved into a shared module in my side project, what stayed native, and what I would tell a team that wants to try it.

## The idea I admired

Kotlin Multiplatform (KMP) lets one Kotlin code base compile for more than one platform. You write the logic once. Each platform then keeps its own screens, Compose on Android and SwiftUI on iPhone.

Many cross-platform tools ask you to give up something, usually the native feel. KMP does not ask for that. You share the part users never see, and the part they touch stays native.

## How it differs from React Native and Flutter

The three are not the same kind of tool. React Native and Flutter are UI frameworks. You write your screens once, and they run on both platforms. KMP is mainly about sharing logic, and you decide how much more to share.

| | Kotlin Multiplatform | React Native | Flutter |
| --- | --- | --- | --- |
| Language | Kotlin | JavaScript or TypeScript | Dart |
| What you share | Logic by default, and UI only if you choose | UI and logic | UI and logic |
| How screens are made | The native toolkit on each platform, such as Compose and SwiftUI | JavaScript describes the screens, and the platform shows real native views | Flutter draws every pixel itself with its own engine |
| Where native code appears | Wherever you decide to keep it native | When a platform feature has no JavaScript module | When a platform feature has no plugin |

So the real difference is where the line sits. React Native and Flutter put the line under the UI. KMP puts it under the logic. If you want shared screens too, Compose Multiplatform exists, and my plan keeps it as an option for the iPhone app.

Neither side is wrong. A small team that needs one UI on two platforms quickly may be happier with React Native or Flutter. I chose KMP because the money logic must match everywhere, and I want native screens. This first table compares how the tools are designed. Check each project's docs, because all three keep changing.

### What the performance numbers say

Design is one thing. Speed is another. I looked for real measurements and found two sources worth using.

The first is a benchmark by Software Mansion, [published in July 2026](https://swmansion.com/blog/we-built-the-same-app-in-kmp-and-react-native-here-s-what-we-found/). They built the same small app twice, once in KMP and once in React Native. They tested three Android phones and three iPhones. Software Mansion works with React Native, so the result does not look like it was written to favour Kotlin. Here are a few of their numbers, from a Pixel 7 and an iPhone 16:

| Test | Kotlin Multiplatform | React Native |
| --- | --- | --- |
| Android, download size | 2.0 MB | 15.8 MB |
| Android, time to first screen | 158 ms | 410 ms |
| Android, average memory | 120.5 MB | 232.2 MB |
| iPhone, time to first screen | 822 ms | 850 ms |
| iPhone, average memory | 230.2 MB | 56.4 MB |

On Android, KMP was smaller, faster to start and lighter on memory. On iPhone, start time was almost the same, but React Native used much less memory. The authors say React Native hands the drawing to the native UIKit.

There are three caveats, and I want you to read them before you quote these numbers:

- Their KMP app used Compose Multiplatform, so the screens were shared too. My plan is native screens with only the logic shared, so the iPhone memory number may not match mine.
- It is one small app, and the authors call both versions a baseline that is not tuned for production.
- They compared only KMP and React Native. They did not test Flutter.

The second source is a [2025 master's thesis by Sascha Bauer](https://pure.fh-ooe.at/en/studentTheses/kotlin-multiplatform-flutter-and-native-iosandroida-performance-c/). It compares KMP, Flutter and native apps. It gives no simple winner, but the findings are useful:

- Native iOS gave the best performance and resource use.
- Flutter had strong CPU speed, but it was heavier on memory and slower with the database.
- KMP gave good overall performance and native UI flexibility, with higher development complexity.

My reading is simple. On Android, the KMP numbers looked very good next to React Native. On iPhone, the picture is mixed, and native Swift still came out best in the thesis. Test your own app on your own devices before you decide.

## What I moved into the shared module

Saku is my side project, an Android money manager. Its `shared/` module holds the code that must give the same answer on every phone:

- `Money`, which stores amounts, categories, date time, and so on
- the parsers emoney notification or receipts
- the report and chart maths
- ask llm or rule based to find the transactions
- CSV import and the database entities

Here is the start of `Money`. It is plain Kotlin with no Android in sight.

```kotlin
/**
 * An amount in the currency's minor units (IDR has 2, so Rp25.000 = 2500000). Never a float.
 */
data class Money(val minor: Long, val currency: String = "IDR") {
    // format(), compact() and the rest live here
}
```

The hard part was not the move. It was the imports. Code in the shared folder cannot use `java.*` or `android.*`, so I had to swap a few things:

- `java.time` became `kotlinx-datetime`
- `BigDecimal` became a small decimal type of my own
- `org.json` became `kotlinx-serialization-json`

Now I have a rule. New code in that folder uses no `java.*` or `android.*` imports. Without the rule, the folder slowly fills with platform code again.

## What stays native

The screens stay native. So do a few features that only work on one platform. Notification capture is a good example. Android lets an app read notifications from other apps, but iOS does not. A widget and a share extension also need Swift on iPhone, even if the logic behind them is shared.

I find this honest. Some things are the same on both phones, and some are not. KMP lets me draw the line where it really is.

## Does sharing cost speed?

On Android, the shared module is compiled for the JVM, the same as Kotlin written directly in the app. The shared code runs like any other Kotlin code, so I see no difference.

On iPhone, the Kotlin code is compiled to a native library, and Swift calls into it. I expect a small cost where the two meet, in milliseconds and not in seconds. The public benchmark above points the same way, with almost the same start time on a modern iPhone. But it tested a shared-screen app, and I have not measured mine. Saku has no iPhone build yet, and my Mac has only the command line tools, not Xcode. I will add real numbers when I have them.

<!-- TODO: add measured iOS numbers (device, build type, what was timed) once the iOS target exists. -->

## Four reasons I chose this

- **One answer for money.** The same rounding, the same dates, the same reports on every phone.
- **Native screens.** The part people touch can use each platform's own tools and feel.
- **Small steps.** I did not rewrite the app. I moved code in pieces, and the old tests guarded each piece.
- **Simple tests.** The shared tests run on the JVM, with no emulator.

## How I built it

I built Saku with the loop from my other post, [Plan, Design, Implement, Test, Review, Repeat](/blog/plan-design-implement-test-review-repeat). The move to KMP was a plan file first. The file has a verdict, a list of what can be shared, a list of what must stay native, and a phase called K1 with a "Done when" check.

That check was my guard. The move happened in small steps, and the existing tests told me if anything broke. K1 is finished. The next phases, shared data and the iPhone app, are still only in the plan.

## What I would tell a team

Start with the logic that must match on every platform, and leave the UI alone. Add the "no platform imports" rule on day one, because it is cheap then and painful later. And check early that you have a Mac with Xcode, because you cannot build for iPhone without one.
