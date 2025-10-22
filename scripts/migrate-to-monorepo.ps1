#!/usr/bin/env pwsh
# OxSig Monorepo Migration Script
# Safely restructures the repository into a monorepo layout

$ErrorActionPreference = "Stop"

Write-Host "🔄 Starting OxSig Monorepo Migration..." -ForegroundColor Cyan

# Create new directory structure
Write-Host "`n📁 Creating directory structure..." -ForegroundColor Yellow
$directories = @(
    "packages",
    "packages/frontend",
    "packages/backend-ws",
    "packages/shared",
    "infrastructure",
    "infrastructure/docker",
    "infrastructure/observability"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "   ✓ Created $dir" -ForegroundColor Green
    }
}

# Move frontend files
Write-Host "`n📦 Moving frontend files..." -ForegroundColor Yellow
$frontendFiles = @(
    "src",
    "public",
    "app",
    "components.json",
    "next.config.ts",
    "next-env.d.ts",
    "tsconfig.json",
    "tailwind.config.ts",
    "postcss.config.mjs",
    "vitest.config.ts"
)

foreach ($item in $frontendFiles) {
    if (Test-Path $item) {
        Move-Item -Path $item -Destination "packages/frontend/" -Force
        Write-Host "   ✓ Moved $item" -ForegroundColor Green
    }
}

# Move backend files
Write-Host "`n🦀 Moving backend files..." -ForegroundColor Yellow
if (Test-Path "backend/ws-gateway") {
    Move-Item -Path "backend/ws-gateway/*" -Destination "packages/backend-ws/" -Force
    Write-Host "   ✓ Moved ws-gateway" -ForegroundColor Green
}

# Move infrastructure files
Write-Host "`n🐳 Moving infrastructure files..." -ForegroundColor Yellow
$infraFiles = @(
    "docker-compose.yml",
    "backend/observability",
    "backend/caddy",
    "backend/coturn",
    "backend/migrations"
)

foreach ($item in $infraFiles) {
    if (Test-Path $item) {
        $dest = if ($item -eq "docker-compose.yml") { "infrastructure/docker/" } else { "infrastructure/" }
        Move-Item -Path $item -Destination $dest -Force
        Write-Host "   ✓ Moved $item" -ForegroundColor Green
    }
}

# Move documentation
Write-Host "`n📚 Organizing documentation..." -ForegroundColor Yellow
# docs/ stays at root - no move needed

# Create package.json for frontend
Write-Host "`n📝 Creating package configs..." -ForegroundColor Yellow
$frontendPackageJson = @"
{
  "name": "@oxsig/frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest"
  }
}
"@

Set-Content -Path "packages/frontend/package.json" -Value $frontendPackageJson
Write-Host "   ✓ Created frontend package.json" -ForegroundColor Green

# Create package.json for backend-ws
$backendPackageJson = @"
{
  "name": "@oxsig/backend-ws",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "cargo build --release",
    "dev": "cargo run",
    "test": "cargo test"
  }
}
"@

Set-Content -Path "packages/backend-ws/package.json" -Value $backendPackageJson
Write-Host "   ✓ Created backend-ws package.json" -ForegroundColor Green

# Create package.json for shared
$sharedPackageJson = @"
{
  "name": "@oxsig/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
"@

Set-Content -Path "packages/shared/package.json" -Value $sharedPackageJson
Write-Host "   ✓ Created shared package.json" -ForegroundColor Green

# Update root package.json
Write-Host "`n🔧 Updating root package.json..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    $rootPkg = Get-Content "package.json" | ConvertFrom-Json
    $rootPkg.scripts = @{
        "dev" = "pnpm --filter @oxsig/frontend dev"
        "build" = "pnpm -r build"
        "lint" = "pnpm -r lint"
        "test" = "pnpm -r test"
        "docker:up" = "docker compose -f infrastructure/docker/docker-compose.yml up -d"
        "docker:down" = "docker compose -f infrastructure/docker/docker-compose.yml down"
        "docker:logs" = "docker compose -f infrastructure/docker/docker-compose.yml logs -f"
    }
    $rootPkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"
    Write-Host "   ✓ Updated root package.json" -ForegroundColor Green
}

# Cleanup empty directories
Write-Host "`n🧹 Cleaning up..." -ForegroundColor Yellow
if (Test-Path "backend" -and (Get-ChildItem "backend").Count -eq 0) {
    Remove-Item "backend" -Recurse -Force
    Write-Host "   ✓ Removed empty backend/" -ForegroundColor Green
}

Write-Host "`n✅ Migration complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Run: pnpm install" -ForegroundColor White
Write-Host "  2. Test: pnpm dev" -ForegroundColor White
Write-Host "  3. Review: git status" -ForegroundColor White
Write-Host "  4. Commit: git add . && git commit -m 'refactor: migrate to monorepo structure'" -ForegroundColor White
