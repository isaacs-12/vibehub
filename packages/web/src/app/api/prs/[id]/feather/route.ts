/**
 * POST /api/prs/[id]/feather
 *
 * AI-powered intent merge for a single conflicting vibe file.
 * Reads both versions and a common base, then asks Claude to produce
 * a coherent merged version that preserves the intent of both sides.
 *
 * Body: { name, baseContent, headContent, mainContent }
 * Response: { mergedContent }
 */
import { NextResponse } from 'next/server';

interface Params { params: { id: string } }

interface FeatherBody {
  name: string;
  baseContent: string;
  headContent: string;
  mainContent: string;
}

export async function POST(req: Request, { _params }: { _params: Params }) {
  const body = await req.json().catch(() => null) as FeatherBody | null;
  if (!body?.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { name, baseContent, headContent, mainContent } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

  const prompt = `You are merging two diverging versions of a vibe file — a human-readable feature specification.
Both versions started from the same base and have evolved independently. Your task is to produce a single merged version that:
- Preserves all intent that is unique to each version
- Resolves genuine contradictions by choosing the more specific or more recent-sounding intent, or by noting the tension explicitly in the merged document
- Reads as a coherent, well-structured vibe specification — not a diff or a list of alternatives

## File name
${name}.md

## Base version (what main looked like when the branch was created)
\`\`\`markdown
${baseContent || '(file did not exist yet)'}
\`\`\`

## Feature branch version (incoming changes)
\`\`\`markdown
${headContent}
\`\`\`

## Main version (what main currently has)
\`\`\`markdown
${mainContent}
\`\`\`

Output ONLY the merged markdown content. No code fences, no explanation, no preamble. Just the raw markdown.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: `Anthropic API error: ${err}` }, { status: 502 });
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };
  const mergedContent = data.content.find((b) => b.type === 'text')?.text?.trim() ?? '';

  return NextResponse.json({ mergedContent });
}
