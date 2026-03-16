package project

// FeatureTemplate is the default content written to a new vibe feature file.
// The single %s verb is replaced with the feature name.
const FeatureTemplate = `---
Uses: []
Data: []
Never: []
---

# %s

## What it does
Describe the feature in plain language. What can a user do, and what happens when they do it?

## Behavior
- Add specific rules, edge cases, or conditions here
- Each bullet is something the compiler should implement

## Acceptance criteria
- How do you know this feature is working correctly?
`
