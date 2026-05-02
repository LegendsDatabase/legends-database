import { next } from '@vercel/functions';

const REALM = 'Legends Database Beta';

function decodeBasicAuth(value) {
  if (!value || !value.startsWith('Basic ')) return null;

  try {
    const decoded = atob(value.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;

    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function unauthorized() {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>Match Simulator Soon - Legends Database</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:grid;place-items:center;padding:28px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",sans-serif;background:#f2f2f7;color:#1d1d1f}
    main{width:min(420px,100%);background:#fff;border-radius:24px;padding:34px 30px;text-align:center;box-shadow:0 12px 42px rgba(0,0,0,.08)}
    .pill{display:inline-flex;margin-bottom:18px;padding:5px 10px;border-radius:999px;background:#eef4ff;color:#0071e3;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
    h1{font-size:34px;letter-spacing:-1px;line-height:1;margin-bottom:12px}
    p{font-size:14px;line-height:1.6;color:#6e6e73}
    strong{color:#1d1d1f}
  </style>
</head>
<body>
  <main>
    <span class="pill">Private Beta</span>
    <h1>Soon</h1>
    <p>The Legendary Match Simulator is currently protected while the beta is being refined. Enter the beta credentials to continue.</p>
  </main>
</body>
</html>`,
    {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Cache-Control': 'no-store',
      },
    },
  );
}

export default function middleware(request) {
  const expectedUser = process.env.MATCH_SIM_USER;
  const expectedPassword = process.env.MATCH_SIM_PASSWORD;
  const credentials = decodeBasicAuth(request.headers.get('authorization'));

  if (
    !expectedUser ||
    !expectedPassword ||
    !credentials ||
    credentials.user !== expectedUser ||
    credentials.password !== expectedPassword
  ) {
    return unauthorized();
  }

  return next({
    headers: {
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Cache-Control': 'private, no-store',
    },
  });
}

export const config = {
  matcher: ['/match-simulator', '/match-simulator/:path*'],
  runtime: 'edge',
};
