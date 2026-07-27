# Sync UEP expected env vars to Vercel (Production / Preview / Development)
# Prerequisites: npx vercel login && npx vercel link

$ErrorActionPreference = "Stop"
$APP = "https://uep-proyect-w15h.vercel.app"

$envMap = [ordered]@{
  "DATABASE_URL"       = "sqlserver://190.231.14.131:1433;database=UEP;user=sa;password=isource;encrypt=false;trustServerCertificate=true"
  "BETTER_AUTH_SECRET" = "a5baff2d1ad5d3f80ec3e43ae0ae280670c017ffed98a2ed3a747ba7da5e85c6"
  "BETTER_AUTH_URL"    = "https://uep-proyect-w15h.vercel.app"
}

Write-Host "=== Expected values ===" -ForegroundColor Cyan
$envMap.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key)=$($_.Value)" }

Write-Host "`n=== Checking Vercel auth ===" -ForegroundColor Cyan
$who = npx vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "No hay login. Ejecutá: npx vercel login" -ForegroundColor Red
  Write-Host $who
  exit 1
}
Write-Host "Logged in as: $who"

$targets = @("production", "preview", "development")
foreach ($key in $envMap.Keys) {
  $value = $envMap[$key]
  foreach ($target in $targets) {
    Write-Host "`nUpsert $key @ $target ..." -ForegroundColor Yellow
    npx vercel env rm $key $target -y 2>$null | Out-Null
    $value | npx vercel env add $key $target
    if ($LASTEXITCODE -eq 0) {
      Write-Host "OK $key @ $target" -ForegroundColor Green
    } else {
      Write-Host "FAIL $key @ $target" -ForegroundColor Red
    }
  }
}

Write-Host "`n=== Redeploy production ===" -ForegroundColor Cyan
npx vercel --prod --yes

Write-Host "`n=== Probe health ===" -ForegroundColor Cyan
Start-Sleep -Seconds 15
try {
  $r = Invoke-RestMethod -Uri "$APP/api/health" -TimeoutSec 60
  $r | ConvertTo-Json -Depth 6
} catch {
  Write-Host "Health still failing: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nDone. Si health.ok=true, probá login." -ForegroundColor Cyan
