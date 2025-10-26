# OxSig Local Testing - Quick Start (PowerShell)
# Run this script: .\quick-start.ps1

Write-Host "🚀 OxSig Local Testing - Quick Start" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker services
Write-Host "📦 Step 1: Checking Docker services..." -ForegroundColor Yellow
docker-compose ps
Write-Host ""

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Docker services are running" -ForegroundColor Green
} else {
    Write-Host "❌ Docker services not running. Run: docker-compose up -d" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "🔧 NEXT STEPS:" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1️⃣  Start the dev server:" -ForegroundColor White
Write-Host "   cd oxsig" -ForegroundColor Gray
Write-Host "   pnpm dev" -ForegroundColor Gray
Write-Host ""
Write-Host "   Wait for: ✓ Ready on http://localhost:3000" -ForegroundColor Green
Write-Host ""

Write-Host "2️⃣  Open browser:" -ForegroundColor White
Write-Host "   → http://localhost:3000" -ForegroundColor Gray
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "✨ OxSig is ready!" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

