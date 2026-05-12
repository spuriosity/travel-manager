# Deploying travel-manager on hub

Serves travel-manager at `https://travel.spuriosity.io` behind Google OAuth (oauth2-proxy). Only emails listed in `allowed_emails.txt` (currently: `jacklysaght@gmail.com`) can authenticate.

## Topology

```
internet ──► Caddy (TLS, :443) ──► oauth2-proxy (:4180) ──► travel-manager (FastAPI, :8000)
                                       │
                                       └── Google OAuth (email allowlist)
```

oauth2-proxy is the upstream proxy: every request hits it first; only sessions whose Google account email is in the allowlist reach the app container.

## One-time setup

1. **Create Google OAuth credentials** at <https://console.cloud.google.com/apis/credentials>:
   - "Create credentials" → "OAuth client ID" → Application type: **Web application**
   - Authorized redirect URI: `https://travel.spuriosity.io/oauth2/callback`
   - Save the **Client ID** and **Client Secret**.

   (If you've never done OAuth in this project, you'll first be prompted to configure an OAuth consent screen. Pick "External", add yourself as a test user, scopes can stay default.)

2. **DNS**: point `travel.spuriosity.io` (A record) at hub's public IP. Caddy auto-provisions TLS.

3. **Clone on hub**:

   ```bash
   ssh hub-persistent
   git clone https://github.com/spuriosity/travel-manager.git /opt/travel-manager
   cd /opt/travel-manager/deploy
   cp .env.example .env
   ```

4. **Fill `.env`** with the OAuth client ID/secret and a fresh cookie secret:

   ```bash
   echo "OAUTH2_PROXY_COOKIE_SECRET=$(openssl rand -base64 32 | tr -- '+/' '-_')" >> .env
   # then edit .env to add OAUTH2_PROXY_CLIENT_ID and OAUTH2_PROXY_CLIENT_SECRET
   ```

5. **Add the Caddy site**: append `Caddyfile.snippet` to `/etc/caddy/Caddyfile`, then:

   ```bash
   systemctl reload caddy
   ```

6. **Build & start**:

   ```bash
   docker compose up -d --build
   ```

## Allowlist

`allowed_emails.txt` — one email per line. To add another user, append a line and restart oauth2-proxy:

```bash
docker compose restart oauth2-proxy
```

## Updating

```bash
cd /opt/travel-manager
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

## Notes

- The SQLite DB lives in the `travel_data` named volume (mounted at `/data` inside the container).
  Back up with: `docker run --rm -v travel_data:/data -v $PWD:/backup alpine tar czf /backup/travel.tgz /data`.
- The app trusts oauth2-proxy completely — it has no auth of its own. Never expose port 8000 publicly.
