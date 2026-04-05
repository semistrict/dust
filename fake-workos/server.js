/**
 * Fake WorkOS server for local development.
 *
 * Implements the subset of the WorkOS API that Dust uses for authentication:
 *   - GET  /user_management/authorize      → AuthKit login page
 *   - POST /user_management/authenticate   → code/refresh_token exchange
 *   - POST /user_management/sessions/revoke → session revocation
 *   - GET  /.well-known/jwks.json          → JWKS for JWT validation
 *   - GET  /sso/connections                → stub (empty list)
 *   - GET  /user_management/users          → stub (empty list)
 *   - POST /user_management/users          → stub (create user)
 *   - POST /user_management/organization_memberships → stub
 *   - POST /organizations                  → stub
 *   - GET  /organizations/by_external_id/* → stub
 *   - PUT  /organizations/*                → stub
 *
 * Usage:
 *   COOKIE_PASSWORD=<same-as-WORKOS_COOKIE_PASSWORD> node server.js
 *
 * Then configure the Dust front service with:
 *   WORKOS_API_KEY=fake-api-key
 *   WORKOS_CLIENT_ID=fake-client-id
 *
 * And point the WorkOS SDK at this server by setting apiHostname in the
 * WorkOS constructor to "fake-workos:3100" (or wherever this runs).
 */

const express = require("express");
const crypto = require("crypto");
const { sealData } = require("iron-session");
const { exportJWK, SignJWT, generateKeyPair } = require("jose");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 7600;
const COOKIE_PASSWORD =
  process.env.COOKIE_PASSWORD || "change-me-to-32-char-password-xx";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// In-memory state
const pendingCodes = new Map(); // code → { user, redirectUri, state }
const sessions = new Map(); // sessionId → { user, refreshToken }
let keyPair = null;
let jwk = null;

// Pre-built fake users (email → user)
const users = new Map();

function getOrCreateUser(email) {
  if (!users.has(email)) {
    const name = email.split("@")[0] || "User";
    users.set(email, {
      object: "user",
      id: `user_fake_${crypto.randomUUID().slice(0, 8)}`,
      email,
      email_verified: true,
      profile_picture_url: null,
      first_name: name.charAt(0).toUpperCase() + name.slice(1),
      last_name: "User",
      last_sign_in_at: new Date().toISOString(),
      locale: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      external_id: null,
      metadata: {},
    });
  }
  return users.get(email);
}

async function initKeys() {
  const kp = await generateKeyPair("RS256");
  keyPair = kp;
  const pub = await exportJWK(kp.publicKey);
  pub.kid = "fake-workos-key-1";
  pub.use = "sig";
  pub.alg = "RS256";
  jwk = pub;
}

async function createAccessToken(user, sessionId) {
  return new SignJWT({
    sub: user.id,
    sid: sessionId,
    email: user.email,
    "https://dust.tt/region": "us-central1",
  })
    .setProtectedHeader({ alg: "RS256", kid: "fake-workos-key-1" })
    .setIssuer(BASE_URL)
    .setAudience("fake-client-id")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(keyPair.privateKey);
}

// ─── JWKS ────────────────────────────────────────────────────────────────────

app.get("/.well-known/jwks.json", (_req, res) => {
  res.json({ keys: [jwk] });
});

// WorkOS SDK fetches JWKS from /sso/jwks/{clientId}
app.get("/sso/jwks/:clientId", (_req, res) => {
  res.json({ keys: [jwk] });
});

// ─── AuthKit Login Page ──────────────────────────────────────────────────────

app.get("/user_management/authorize", (req, res) => {
  const { client_id, redirect_uri, state, screen_hint } = req.query;

  const title =
    screen_hint === "sign-up" ? "Create Account" : "Sign In";

  res.type("html").send(`<!DOCTYPE html>
<html>
<head>
  <title>Fake WorkOS - ${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); width: 380px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #666; margin-bottom: 24px; font-size: 14px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
    button { width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #2563eb; }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">FAKE WORKOS - LOCAL DEV</div>
    <h1>${title}</h1>
    <p>Enter any email to log in. No password required.</p>
    <form method="POST" action="/user_management/authorize/submit">
      <input type="hidden" name="client_id" value="${client_id || ""}" />
      <input type="hidden" name="redirect_uri" value="${redirect_uri || ""}" />
      <input type="hidden" name="state" value="${state || ""}" />
      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="admin@dust.local" value="admin@dust.local" required autofocus />
      <button type="submit">Continue</button>
    </form>
  </div>
</body>
</html>`);
});

// Handle login form submission
app.post("/user_management/authorize/submit", (req, res) => {
  const { email, redirect_uri, state } = req.body;
  const user = getOrCreateUser(email || "admin@dust.local");
  const code = crypto.randomUUID();

  pendingCodes.set(code, {
    user,
    redirectUri: redirect_uri,
    state,
  });

  // Expire code after 5 minutes
  setTimeout(() => pendingCodes.delete(code), 5 * 60 * 1000);

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) {
    url.searchParams.set("state", state);
  }

  res.redirect(url.toString());
});

// ─── Authenticate (code exchange + refresh) ──────────────────────────────────

app.post("/user_management/authenticate", async (req, res) => {
  const {
    code,
    grant_type,
    refresh_token,
    client_id,
    session,
  } = req.body;

  try {
    // Refresh token flow
    if (grant_type === "refresh_token") {
      // Find session by refresh token
      let foundSession = null;
      for (const [sid, s] of sessions) {
        if (s.refreshToken === refresh_token) {
          foundSession = { sessionId: sid, ...s };
          break;
        }
      }

      if (!foundSession) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid refresh token",
        });
      }

      const newRefreshToken = crypto.randomUUID();
      const accessToken = await createAccessToken(
        foundSession.user,
        foundSession.sessionId
      );

      // Update stored session
      sessions.set(foundSession.sessionId, {
        ...foundSession,
        refreshToken: newRefreshToken,
      });

      const response = {
        user: foundSession.user,
        access_token: accessToken,
        refresh_token: newRefreshToken,
        authentication_method: "GoogleOAuth",
      };

      if (session?.seal_session) {
        const sessionData = await sealData(
          {
            accessToken,
            refreshToken: newRefreshToken,
            user: foundSession.user,
            authenticationMethod: "GoogleOAuth",
          },
          { password: session.cookie_password || COOKIE_PASSWORD, ttl: 0 }
        );
        response.sealed_session = sessionData;
      }

      return res.json(response);
    }

    // Authorization code flow
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const pending = pendingCodes.get(code);
    if (!pending) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired code",
      });
    }
    pendingCodes.delete(code);

    const sessionId = `session_${crypto.randomUUID().slice(0, 12)}`;
    const refreshToken = crypto.randomUUID();
    const accessToken = await createAccessToken(pending.user, sessionId);

    sessions.set(sessionId, {
      user: pending.user,
      refreshToken,
    });

    const response = {
      user: pending.user,
      access_token: accessToken,
      refresh_token: refreshToken,
      authentication_method: "GoogleOAuth",
    };

    // If the client requested a sealed session (cookie-based auth)
    if (session?.seal_session) {
      const sessionData = await sealData(
        {
          accessToken,
          refreshToken,
          user: pending.user,
          authenticationMethod: "GoogleOAuth",
        },
        { password: session.cookie_password || COOKIE_PASSWORD, ttl: 0 }
      );
      response.sealed_session = sessionData;
    }

    return res.json(response);
  } catch (err) {
    console.error("Authenticate error:", err);
    return res.status(500).json({ error: "internal_error", message: String(err) });
  }
});

// ─── Revoke Session ──────────────────────────────────────────────────────────

app.post("/user_management/sessions/revoke", (req, res) => {
  const { session_id } = req.body;
  if (session_id) {
    sessions.delete(session_id);
  }
  res.status(200).json({});
});

// ─── SSO Stubs ───────────────────────────────────────────────────────────────

app.get("/sso/connections", (_req, res) => {
  res.json({ data: [], list_metadata: { after: null, before: null } });
});

app.delete("/sso/connections/:id", (_req, res) => {
  res.status(204).end();
});

// ─── User Management Stubs ──────────────────────────────────────────────────

app.get("/user_management/users", (req, res) => {
  const { email } = req.query;
  if (email && users.has(email)) {
    res.json({ data: [users.get(email)], list_metadata: { after: null, before: null } });
  } else {
    res.json({ data: [], list_metadata: { after: null, before: null } });
  }
});

app.post("/user_management/users", (req, res) => {
  const user = getOrCreateUser(req.body.email || "user@dust.local");
  if (req.body.first_name) user.first_name = req.body.first_name;
  if (req.body.last_name) user.last_name = req.body.last_name;
  res.status(201).json(user);
});

app.put("/user_management/users/:id", (req, res) => {
  // Find user by ID and update
  for (const [, user] of users) {
    if (user.id === req.params.id) {
      Object.assign(user, req.body);
      return res.json(user);
    }
  }
  res.status(404).json({ error: "User not found" });
});

// ─── Organization Membership Stubs ──────────────────────────────────────────

app.post("/user_management/organization_memberships", (req, res) => {
  res.status(201).json({
    object: "organization_membership",
    id: `om_${crypto.randomUUID().slice(0, 8)}`,
    user_id: req.body.user_id,
    organization_id: req.body.organization_id,
    role: { slug: "member" },
    status: { type: "active" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

app.get("/user_management/organization_memberships", (req, res) => {
  res.json({ data: [], list_metadata: { after: null, before: null } });
});

app.delete("/user_management/organization_memberships/:id", (_req, res) => {
  res.status(204).end();
});

// ─── Organization Stubs ─────────────────────────────────────────────────────

app.post("/organizations", (req, res) => {
  res.status(201).json({
    object: "organization",
    id: `org_${crypto.randomUUID().slice(0, 8)}`,
    name: req.body.name || "Dev Organization",
    external_id: req.body.external_id,
    domains: req.body.domains || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

app.get("/organizations/by_external_id/:externalId", (req, res) => {
  res.json({
    object: "organization",
    id: `org_${crypto.randomUUID().slice(0, 8)}`,
    name: "Dev Organization",
    external_id: req.params.externalId,
    domains: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

app.get("/organizations/:id", (req, res) => {
  res.json({
    object: "organization",
    id: req.params.id,
    name: "Dev Organization",
    external_id: null,
    domains: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

app.put("/organizations/:id", (req, res) => {
  res.json({
    object: "organization",
    id: req.params.id,
    name: req.body.name || "Dev Organization",
    external_id: req.body.external_id,
    domains: req.body.domains || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

app.delete("/organizations/:id", (_req, res) => {
  res.status(204).end();
});

// ─── Directory Sync Stubs ───────────────────────────────────────────────────

app.get("/directory_sync/directories", (_req, res) => {
  res.json({ data: [], list_metadata: { after: null, before: null } });
});

app.delete("/directory_sync/directories/:id", (_req, res) => {
  res.status(204).end();
});

app.get("/directory_sync/groups/:id", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Portal Stubs ───────────────────────────────────────────────────────────

app.post("/portal/generate_link", (_req, res) => {
  res.json({ link: `${BASE_URL}/portal/stub` });
});

// ─── Audit Log Stubs ────────────────────────────────────────────────────────

app.post("/audit_logs/events", (_req, res) => {
  res.status(201).json({});
});

// ─── Password Reset Stub ────────────────────────────────────────────────────

app.post("/user_management/password_reset", (_req, res) => {
  res.status(201).json({ id: `pr_${crypto.randomUUID().slice(0, 8)}` });
});

// ─── Catch-all for debugging ────────────────────────────────────────────────

app.all("*", (req, res) => {
  console.log(`[fake-workos] Unhandled: ${req.method} ${req.url}`);
  console.log(`  Body:`, JSON.stringify(req.body).slice(0, 200));
  res.status(404).json({ error: "not_found", path: req.url });
});

// ─── Start ──────────────────────────────────────────────────────────────────

async function main() {
  await initKeys();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[fake-workos] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[fake-workos] JWKS at ${BASE_URL}/.well-known/jwks.json`);
    console.log(`[fake-workos] Login at ${BASE_URL}/user_management/authorize`);
  });
}

main().catch((err) => {
  console.error("Failed to start fake-workos:", err);
  process.exit(1);
});
