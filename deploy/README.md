# Deploy: shareanything.yashkumarram.com

## Stack
- Docker Compose app on `127.0.0.1:3020` (container still listens on 3000)
- CloudPanel reverse proxy + SSL
- Cloudflare DNS A record → origin `137.23.57.199`
- GitHub Actions deploys on push to `main`

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
- Proxy: DNS-only (grey cloud) is preferred for Socket.io live sync  
- If you orange-cloud it later: SSL/TLS **Full (strict)** + Network → WebSockets on  
- Record is already created for `shareanything.yashkumarram.com`

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
