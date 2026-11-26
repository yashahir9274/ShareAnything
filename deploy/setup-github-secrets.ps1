# One-time: after `gh auth login`, run from the repo root:
#   powershell -File deploy/setup-github-secrets.ps1
#
# Sets GitHub Actions secrets used by .github/workflows/deploy.yml

$ErrorActionPreference = "Stop"
$Repo = "yashahir9274/ShareAnything"
$KeyPath = "D:\Yash Ahir\test\oracle-private.key"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "Install GitHub CLI (gh) first."
}

gh auth status | Out-Host

gh secret set SSH_HOST -R $Repo -b "137.23.57.199"
gh secret set SSH_USER -R $Repo -b "ubuntu"
gh secret set SSH_PORT -R $Repo -b "22"
gh secret set DEPLOY_PATH -R $Repo -b "/home/ubuntu/shareanything"
Get-Content -Raw $KeyPath | gh secret set SSH_PRIVATE_KEY -R $Repo

Write-Host "Secrets set on $Repo. Trigger Deploy via Actions → Deploy ShareAnything → Run workflow."
