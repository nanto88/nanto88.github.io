---
title: "I finally used a recursive function because it's more suitable than using loops in the real project"
description: "A recursive Ruby function for colorizing JSON logs, and why recursion beat a loop-based approach for this particular problem."
pubDate: 2025-05-18
tags: ["ruby", "recursion", "logging"]
category: "programming"
---

A recursive function is a function that calls itself within its own definition. It performs part of a task, then calls itself again to handle a smaller instance of the same task. This continues until a base case is reached, at which point the function stops calling itself and returns a result.

Recursive functions show up constantly in competitive programming, thanks to the complexity and trickiness of the questions.

## We tend to avoid recursive functions

In real projects, recursion is rarely used because it's harder to read, harder to maintain, and easy to get wrong if not implemented properly. Developers tend to reach for simpler solutions that are easier to understand and maintain.

In this article I want to share a recursive function from a real project, in the hope that it helps address doubts about how and when to use recursion in practice.

## The function

When working with logs or CLI tools, colorizing your JSON output can make it dramatically easier to scan and debug structured data.

Here's a Ruby method that recursively walks through a JSON-like object (typically a `Hash`) and adds ANSI color codes based on the type of key or value.

```ruby
module Helper
  module Config
    # @return [Hash<Symbol, String>] A hash mapping color keys to ANSI escape codes.
    def self.colors
      {
        reset_color: "\e[0m", # normal
        key_color: "\e[36m", # cyan
        key_nested_color: "\e[34m", # blue
        value_color: "\e[0m", # normal
        DEBUG: "\e[35m", # magenta
        INFO: "\e[0m", # normal
        WARN: "\e[33m", # yellow
        ERROR: "\e[31m", # red
        FATAL: "\e[91m" # bright red
      }.freeze
    end
  end
end

# @param value [Object] The value to convert (String, Number, etc.).
# @return [String] JSON-safe string representation of the value.
def value_to_json(value)
  value.is_a?(String) ? "\"#{value}\"" : value.to_s
end

# recursive function
# @param value [Object] A Hash or scalar value to colorize.
# @param color [Symbol] The ANSI color key to use for values (e.g., :value_color).
# @return [String] A colorized string representation of the JSON structure.
def colorize_json_str(value, color)
  if value.is_a?(Hash)
    # For hash values, loop through key, val and colorize them with :key_nested_color
    colored_hash = value.map do |key, val|
      "#{colorize_json_str(key, :key_nested_color)}:#{colorize_json_str(val, color)}"
    end.join(',')
    "{#{colored_hash}}"
  else
    # For non-hash values, apply the specified color
    "#{Helper::Config.colors.fetch(color.to_sym,
        Helper::Config.colors[:key_color])}#{value_to_json(value)}#{Helper::Config.colors[:reset_color]}"
  end
end
```

Input and output:

```ruby
data = { name: "Alice", info: { age: 30, city: "London" } }
puts colorize_json_str(data, :value_color)

# {
#   \e[36m"name"\e[0m:\e[32m"Alice"\e[0m,
#   \e[36m"info"\e[0m:{
#     \e[36m"age"\e[0m:\e[32m30\e[0m,
#     \e[36m"city"\e[0m:\e[32m"London"\e[0m
#   }
# }
```

The logging has a color in every key of the JSON. It's a pleasure to read: you notice the log level first, then read each key.

Cyan means a top-level key, blue means a nested key. The log level's color changes depending on its severity, so you can spot it at a glance.

The key insight is that this problem has an endless number of possible shapes. I can't determine up front how many levels of nesting I'll need to walk through. It could probably be done with a `while` loop and an explicit stack, but recursion is a far more natural, suitable fit for this case.
