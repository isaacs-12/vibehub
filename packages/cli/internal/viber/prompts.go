package viber

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ---------- Pass 1: Architecture Discovery ----------

// ArchInventory is the structured output from Pass 1.
type ArchInventory struct {
	Framework     string        `json:"framework"`
	Language      string        `json:"language"`
	Description   string        `json:"description"`
	DataEntities  []DataEntity  `json:"dataEntities"`
	Features      []FeaturePlan `json:"features"`
	GlobalNevers  []string      `json:"globalConstraints"`
}

type DataEntity struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	SourceFiles []string `json:"sourceFiles"`
}

type FeaturePlan struct {
	Name        string   `json:"name"`
	GrammarName string   `json:"grammarName"`
	Description string   `json:"description"`
	Uses        []string `json:"uses"`
	Data        []string `json:"data"`
	Never       []string `json:"never"`
	SourceFiles []string `json:"sourceFiles"`
}

func buildPass1Prompt(repoName string, tree []string, files []CollectedFile, commits []string) string {
	treeStr := strings.Join(tree, "\n")
	if len(tree) > 800 {
		treeStr = strings.Join(tree[:800], "\n") + fmt.Sprintf("\n… +%d more files", len(tree)-800)
	}
	commitsStr := strings.Join(commits, "\n")
	filesStr := FormatFilesForPrompt(files)

	return fmt.Sprintf(`You are a senior software architect performing a thorough analysis of the Git repository %q.

Your task: read every file below and produce a precise inventory of the project's features, data entities, and their relationships. This inventory will be used to generate formal specifications, so accuracy is critical.

## Complete File Tree (%d files)
`+"```"+`
%s
`+"```"+`

## Recent Git History
`+"```"+`
%s
`+"```"+`

## Source Code

Read every file carefully. Your analysis must be grounded in what the code ACTUALLY does.
%s
---

Respond with ONLY valid JSON (no markdown fences, no commentary).

Schema:
{
  "framework": "detected stack (e.g. Next.js 14 + Drizzle + Tailwind, Django REST Framework, Express + Prisma)",
  "language": "primary language (e.g. TypeScript, Python, Go)",
  "description": "2-3 sentence project summary based on what the code does",
  "dataEntities": [
    {
      "name": "PascalCaseName (e.g. User, BlogPost, Invoice)",
      "description": "what this entity represents and its key fields/columns",
      "sourceFiles": ["path/to/where/it/is/defined"]
    }
  ],
  "features": [
    {
      "name": "kebab-case-slug (e.g. user-authentication, payment-processing)",
      "grammarName": "PascalCaseEquivalent (e.g. UserAuthentication, PaymentProcessing)",
      "description": "What this feature does from a user/system perspective — 1-3 sentences",
      "uses": ["GrammarNameOfFeatureThisDependsOn"],
      "data": ["PascalCaseEntityName"],
      "never": ["specific hard constraint for this feature"],
      "sourceFiles": ["paths/that/implement/this"]
    }
  ],
  "globalConstraints": ["constraints that apply across ALL features (e.g. 'never store passwords in plaintext', 'all API responses must include proper error codes')"]
}

RULES — read these carefully:

1. FEATURES represent user-visible capabilities or distinct system behaviors.
   Good: "user-authentication", "file-upload", "search", "billing", "notifications"
   Bad: "utils", "helpers", "types", "database" (these are infrastructure, not features)

2. Aim for 5-25 features depending on project complexity.
   A simple CRUD app: 5-8 features.
   A complex platform: 15-25 features.
   Do NOT over-split — group related endpoints/pages into one feature.

3. DATA ENTITIES are the core domain objects (database tables, API resources, key types).
   Include every table/model/schema you find. Name them in PascalCase.

4. DEPENDENCIES ("uses") declare when Feature A requires Feature B to function.
   If user-profiles renders data that requires authentication, then UserProfiles uses Authentication.
   Only declare DIRECT dependencies — not transitive ones.
   Uses references MUST be grammarName values of other features in YOUR list.

5. Dependencies MUST NOT form cycles. A→B→C→A is forbidden.
   If two features are tightly coupled, consider merging them.

6. "never" constraints must be SPECIFIC and ACTIONABLE.
   Good: "never expose user email addresses in public API responses"
   Bad: "be secure", "handle errors properly"
   Derive them from what the code actually enforces or what would break if violated.

7. "sourceFiles" MUST be real paths from the file tree. Do NOT invent paths.

8. Do NOT hallucinate features not evidenced by the code.
   Do NOT miss features that are clearly implemented.
   When uncertain, include the feature with a conservative description.

9. Every entity in "data" must reference a name from your dataEntities list.

10. "globalConstraints" should capture cross-cutting rules you observe in the code:
    authentication patterns, error handling conventions, data validation approaches, etc.`,
		repoName, len(tree), treeStr, commitsStr, filesStr)
}

// ---------- Pass 2: Detailed Spec Generation ----------

func buildPass2Prompt(repoName string, inventory *ArchInventory, files []CollectedFile) string {
	invJSON, _ := json.MarshalIndent(inventory, "", "  ")
	filesStr := FormatFilesForPrompt(files)

	return fmt.Sprintf(`You are generating detailed Vibe specifications for the repository %q.

You previously analyzed this codebase and produced this architecture inventory:

`+"```json"+`
%s
`+"```"+`

Your task: generate a COMPLETE Vibe specification file for EACH feature in the inventory above. These specs will be parsed by a compiler that reads YAML frontmatter and markdown prose to generate implementation code. Quality and precision matter enormously.

## Source Code (reference — read to verify your specs are accurate)
%s
---

SPEC FORMAT — every feature MUST follow this EXACT structure:

`+"```"+`
---
Uses: [ExactPascalCaseGrammarName, AnotherFeature]
Data: [EntityName, AnotherEntity]
Never:
  - Specific hard constraint this feature must never violate
  - Another actionable constraint
---

# Human Readable Feature Name

## What it does
2-4 sentences describing what this feature enables from a user or system perspective.
What are the key user actions? What does the system do in response?

## Behavior
- Each bullet is a specific, implementable rule the compiler must follow
- Include input validation: what inputs are accepted, what is rejected
- Include error handling: what happens when things go wrong
- Include state transitions: how does the system state change
- Include edge cases the implementation must handle
- Reference data entities by PascalCase name when relevant (e.g. "Creates a new User record")
- Be concrete: "passwords hashed with bcrypt, minimum 8 characters" not "passwords should be secure"

## Acceptance criteria
- Each bullet is a testable condition that proves this feature works correctly
- Include happy-path scenarios with specific inputs → expected outputs
- Include error scenarios: invalid input → expected error behavior
- Include boundary conditions where applicable
`+"```"+`

Respond with ONLY valid JSON (no markdown fences, no commentary):
{
  "features": [
    {
      "name": "kebab-case-slug",
      "content": "FULL markdown content starting with ---\nUses: [...]\n... including all sections"
    }
  ],
  "requirements": [
    {
      "name": "tech-stack",
      "data": {"framework": "...", "language": "...", "database": "...", "deployment": "..."}
    }
  ],
  "mapping": {
    "features/kebab-slug.md": ["source/files/that/implement.ts", "another/file.ts"]
  }
}

CRITICAL RULES:

1. Generate EXACTLY one spec per feature in the inventory — no more, no fewer.
   Use the exact "name" (kebab-case) from the inventory.

2. Every "content" field MUST begin with "---\n" and contain valid YAML frontmatter.
   The frontmatter parser expects:
     Uses: [PascalName1, PascalName2]    — array on one line
     Data: [PascalName1, PascalName2]    — array on one line
     Never:                               — block list on subsequent lines
       - constraint one
       - constraint two

3. "Uses" in frontmatter MUST exactly match grammarName values from the inventory.
   If the inventory says feature X uses ["Authentication"], the frontmatter must say:
   Uses: [Authentication]

4. "Never" constraints must be grounded in the actual code behavior.
   Do NOT pad with generic security advice. Every constraint should reflect
   something this specific feature must enforce based on what the code does.
   If a feature has no meaningful constraints, use "Never: []".

5. BEHAVIOR BULLETS must be specific enough for a code generator to implement
   without guessing. Each bullet should be independently implementable.
   Target 4-12 bullets per feature depending on complexity.

6. ACCEPTANCE CRITERIA must be independently testable.
   Good: "POST /api/users with valid email returns 201 and a User object with id"
   Bad: "users can register" (too vague to test)

7. Do NOT add generic boilerplate. Every line must carry information specific
   to THIS feature and THIS codebase. No filler.

8. The "requirements" array should capture cross-cutting technical decisions:
   - "tech-stack": framework, language, runtime, key libraries
   - "database": database type, ORM, migration approach
   - "deployment": hosting, containerization, CI/CD if evident
   Add only what you can determine from the actual code.

9. The "mapping" object connects each feature spec to the source files that
   implement it. Use real paths from the file tree.`,
		repoName, string(invJSON), filesStr)
}
