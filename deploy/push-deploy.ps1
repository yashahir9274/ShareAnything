# Point local `deploy` at HEAD, then push main + deploy (server updates).
$ErrorActionPreference = "Stop"
git branch -f deploy HEAD
git push origin main deploy
Write-Host "Pushed main (GitHub) and deploy (CloudPanel)."
