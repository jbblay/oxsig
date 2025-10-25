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
Write-Host "   cd oxsig-frontend" -ForegroundColor Gray
Write-Host "   pnpm dev" -ForegroundColor Gray
Write-Host ""
Write-Host "   Wait for: ✓ Ready on http://localhost:3000" -ForegroundColor Green
Write-Host ""

Write-Host "2️⃣  Open browser and test:" -ForegroundColor White
Write-Host "   → http://localhost:3000/auth-test" -ForegroundColor Gray
Write-Host ""

Write-Host "3️⃣  Test user registration:" -ForegroundColor White
Write-Host "   • Email: test@example.com" -ForegroundColor Gray
Write-Host "   • Password: SecurePass123!" -ForegroundColor Gray
Write-Host "   • Click 'Register'" -ForegroundColor Gray
Write-Host ""

Write-Host "4️⃣  Test login:" -ForegroundColor White
Write-Host "   • Use same credentials" -ForegroundColor Gray
Write-Host "   • Click 'Login'" -ForegroundColor Gray
Write-Host ""

Write-Host "5️⃣  Run integration tests (optional):" -ForegroundColor White
Write-Host "   • Open NEW terminal" -ForegroundColor Gray
Write-Host "   • cd oxsig-frontend" -ForegroundColor Gray
Write-Host "   • pnpm test:run" -ForegroundColor Gray
Write-Host "   • All 56 tests should PASS ✅" -ForegroundColor Green
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "🎯 Expected Results:" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "✓ User registration succeeds" -ForegroundColor Green
Write-Host "✓ Login succeeds (httpOnly cookie set)" -ForegroundColor Green
Write-Host "✓ Can access /profile, /vault routes" -ForegroundColor Green
Write-Host "✓ Security headers present" -ForegroundColor Green
Write-Host "✓ Rate limiting works (6th login blocked)" -ForegroundColor Green
Write-Host "✓ Offline indicator visible" -ForegroundColor Green
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "📖 Full Guide: TESTING_GUIDE.md" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
