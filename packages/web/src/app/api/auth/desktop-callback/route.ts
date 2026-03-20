/**
 * GET /api/auth/desktop-callback
 *
 * After Google login completes, the desktop app redirects here.
 * This endpoint reads the NextAuth session, issues a long-lived JWT,
 * and renders a page that:
 *  1. Tries to launch vibehub://auth?token=... (works with built .app)
 *  2. Shows a copyable token for pasting into VibeStudio (works always)
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { SignJWT } from 'jose';

export async function GET() {
  const session = await auth();
  const userId = (session as any)?.userId;
  const handle = (session as any)?.handle;

  if (!userId || !handle) {
    const base = process.env.AUTH_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${base}/login?error=not_authenticated&desktop=1`);
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 });
  }

  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({
    sub: userId,
    handle,
    email: session!.user?.email ?? '',
    name: session!.user?.name ?? handle,
    avatarUrl: (session as any)?.avatarUrl ?? session!.user?.image ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(key);

  const deepLink = `vibehub://auth?token=${token}`;
  const name = session!.user?.name ?? handle;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in to VibeStudio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { text-align: center; max-width: 440px; padding: 2.5rem; }
    .check { color: #3fb950; font-size: 2rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    .sub { font-size: 0.875rem; color: #8b949e; margin-bottom: 1.5rem; line-height: 1.5; }
    .name { color: #7c3aed; }
    .divider { display: flex; align-items: center; gap: 0.75rem; margin: 1.25rem 0; color: #484f58; font-size: 0.75rem; }
    .divider::before, .divider::after { content: ''; flex: 1; border-top: 1px solid #21262d; }
    .section { margin-bottom: 1.25rem; }
    .section-label { font-size: 0.75rem; color: #8b949e; margin-bottom: 0.5rem; }
    .btn { display: inline-block; padding: 0.625rem 1.5rem; background: #7c3aed; color: white; border: none; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; text-decoration: none; transition: background 0.15s; }
    .btn:hover { background: #6d28d9; }
    .token-box { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
    .token-input { flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 0.5rem 0.75rem; font-family: 'SF Mono', SFMono-Regular, monospace; font-size: 0.7rem; color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .token-input:focus { outline: none; border-color: #7c3aed; }
    .copy-btn { padding: 0.5rem 0.75rem; background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; cursor: pointer; font-size: 0.75rem; transition: all 0.15s; white-space: nowrap; }
    .copy-btn:hover { background: #30363d; border-color: #484f58; }
    .copy-btn.copied { background: #238636; border-color: #2ea043; }
    .hint { font-size: 0.7rem; color: #484f58; margin-top: 0.75rem; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&check;</div>
    <h1>Signed in as <span class="name">${escapeHtml(name)}</span></h1>
    <p class="sub">Now connect your VibeStudio desktop app.</p>

    <div class="section">
      <a href="${deepLink}" class="btn" id="open-btn">Open VibeStudio</a>
    </div>

    <div class="divider">or paste the token manually</div>

    <div class="section">
      <div class="token-box">
        <input type="text" class="token-input" id="token" value="${token}" readonly onclick="this.select()" />
        <button class="copy-btn" id="copy-btn" onclick="copyToken()">Copy</button>
      </div>
      <p class="hint">In VibeStudio, click <strong>Sign in</strong> in the status bar, then paste this token.</p>
    </div>
  </div>
  <script>
    // Try deep link automatically
    window.location.href = ${JSON.stringify(deepLink)};

    function copyToken() {
      var input = document.getElementById('token');
      input.select();
      navigator.clipboard.writeText(input.value).then(function() {
        var btn = document.getElementById('copy-btn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
