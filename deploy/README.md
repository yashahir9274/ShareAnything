# Deploy: shareanything.yashkumarram.com

## Stack
- Docker Compose app on `127.0.0.1:3020` (container still listens on 3000)
- CloudPanel reverse proxy + SSL
- Cloudflare DNS A record → origin `137.23.57.199`
- GitHub Actions: push `main` = GitHub only; push `deploy` = upload to server

## Push commands

```bash
# Save code to GitHub only (no server update)
git push origin main

# Save to GitHub AND deploy to CloudPanel
git branch -f deploy HEAD
git push origin main deploy
```

`git push origin main deploy` pushes both branches; Actions deploys only when `deploy` moves.

## One-time server setup
```bash
sudo clpctl site:add:reverse-proxy \
  --domainName=shareanything.yashkumarram.com \
  --reverseProxyUrl='http://127.0.0.1:3020' \
  --siteUser=shareany \
  --siteUserPassword='<strong-password>'

sudo clpctl site:install:certificate \
  --domainName=shareanything.yashkumarram.com

mkdir -p /home/ubuntu/shareanything
cd /home/ubuntu/shareanything
# sync repo, then:
docker compose up -d --build
curl -fsS http://127.0.0.1:3020/healthz
```

## Cloudflare
- Type: A  
- Name: `shareanything`  
- Content: `137.23.57.199`  
- Proxy: **Proxied** (orange cloud) — hides origin IP like your other subdomains  
- SSL/TLS: **Full (strict)** (origin has Let’s Encrypt)  
- Network → **WebSockets** must stay on for live sync  
- Record: `shareanything.yashkumarram.com` → `137.23.57.199`

## GitHub Actions secrets
After `gh auth login`, from the repo root:

```powershell
powershell -File deploy/setup-github-secrets.ps1
```

| Secret | Value |
| --- | --- |
| `SSH_HOST` | `137.23.57.199` |
| `SSH_USER` | `ubuntu` |
| `SSH_PRIVATE_KEY` | Oracle SSH private key |
| `SSH_PORT` | `22` (optional) |
| `DEPLOY_PATH` | `/home/ubuntu/shareanything` (optional) |
