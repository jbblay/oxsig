# OxSig Backend Management Script for Windows
# PowerShell 5.1+

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

function Show-Help {
    Write-Host "OxSig Backend - Available Commands" -ForegroundColor Cyan
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host ".\backend.ps1 setup          - Initialize backend environment" -ForegroundColor Green
    Write-Host ".\backend.ps1 start          - Start all services" -ForegroundColor Green
    Write-Host ".\backend.ps1 stop           - Stop all services" -ForegroundColor Green
    Write-Host ".\backend.ps1 restart        - Restart all services" -ForegroundColor Green
    Write-Host ".\backend.ps1 status         - Show service status" -ForegroundColor Green
    Write-Host ".\backend.ps1 logs           - Show logs (all services)" -ForegroundColor Green
    Write-Host ".\backend.ps1 logs-ws        - Show WebSocket gateway logs" -ForegroundColor Green
    Write-Host ".\backend.ps1 logs-db        - Show Postgres logs" -ForegroundColor Green
    Write-Host ".\backend.ps1 build          - Build all Docker images" -ForegroundColor Green
    Write-Host ".\backend.ps1 clean          - Stop and remove all containers" -ForegroundColor Green
    Write-Host ".\backend.ps1 migrate        - Run database migrations" -ForegroundColor Green
    Write-Host ".\backend.ps1 backup-db      - Backup Postgres database" -ForegroundColor Green
    Write-Host ".\backend.ps1 shell-db       - Open Postgres shell" -ForegroundColor Green
    Write-Host ".\backend.ps1 shell-redis    - Open Redis CLI" -ForegroundColor Green
    Write-Host ".\backend.ps1 test           - Run tests" -ForegroundColor Green
    Write-Host ".\backend.ps1 security-scan  - Run security scanning" -ForegroundColor Green
    Write-Host ""
}

function Setup-Environment {
    Write-Host "Setting up backend environment..." -ForegroundColor Cyan
    
    if (-not (Test-Path .env)) {
        Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item .env.example .env
        Write-Host "Please edit .env with your configuration" -ForegroundColor Yellow
    }
    
    # Create directories
    $dirs = @(
        "backend\observability\grafana\dashboards",
        "backend\observability\grafana\datasources"
    )
    
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    
    Write-Host "Setup complete!" -ForegroundColor Green
}

function Start-Services {
    Write-Host "Starting backend services..." -ForegroundColor Cyan
    docker compose up -d
    Start-Sleep -Seconds 5
    Show-Status
}

function Stop-Services {
    Write-Host "Stopping backend services..." -ForegroundColor Cyan
    docker compose stop
}

function Restart-Services {
    Stop-Services
    Start-Services
}

function Show-Logs {
    param([string]$Service = "")
    
    if ($Service) {
        docker compose logs -f $Service
    } else {
        docker compose logs -f
    }
}

function Show-Status {
    Write-Host "Service Status:" -ForegroundColor Cyan
    docker compose ps
}

function Build-Images {
    Write-Host "Building Docker images..." -ForegroundColor Cyan
    docker compose build
}

function Clean-All {
    Write-Host "Stopping and removing all containers..." -ForegroundColor Yellow
    docker compose down -v
    Write-Host "Cleanup complete!" -ForegroundColor Green
}

function Run-Migrations {
    Write-Host "Running database migrations..." -ForegroundColor Cyan
    Get-Content backend\migrations\001_initial_schema.sql | docker compose exec -T postgres psql -U oxsig -d oxsig
    Write-Host "Migrations complete!" -ForegroundColor Green
}

function Backup-Database {
    Write-Host "Backing up Postgres database..." -ForegroundColor Cyan
    docker compose exec postgres bash /app/scripts/backup-postgres.sh
}

function Open-DatabaseShell {
    docker compose exec postgres psql -U oxsig -d oxsig
}

function Open-RedisShell {
    docker compose exec redis valkey-cli
}

function Run-Tests {
    Write-Host "Running Rust tests..." -ForegroundColor Cyan
    Push-Location backend\ws-gateway
    cargo test
    Pop-Location
    Write-Host "Tests complete!" -ForegroundColor Green
}

function Run-SecurityScan {
    Write-Host "Running security scans..." -ForegroundColor Cyan
    
    Write-Host "Scanning filesystem..." -ForegroundColor Yellow
    docker run --rm -v ${PWD}:/workspace aquasec/trivy fs /workspace
    
    Write-Host "Scanning WebSocket Gateway image..." -ForegroundColor Yellow
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock `
        aquasec/trivy image oxsig-backend-ws-gateway:latest
}

# Main command dispatcher
switch ($Command.ToLower()) {
    "help" { Show-Help }
    "setup" { Setup-Environment }
    "start" { Start-Services }
    "stop" { Stop-Services }
    "restart" { Restart-Services }
    "status" { Show-Status }
    "logs" { Show-Logs }
    "logs-ws" { Show-Logs "ws-gateway" }
    "logs-db" { Show-Logs "postgres" }
    "build" { Build-Images }
    "clean" { Clean-All }
    "migrate" { Run-Migrations }
    "backup-db" { Backup-Database }
    "shell-db" { Open-DatabaseShell }
    "shell-redis" { Open-RedisShell }
    "test" { Run-Tests }
    "security-scan" { Run-SecurityScan }
    default {
        Write-Host "Unknown command: $Command" -ForegroundColor Red
        Write-Host ""
        Show-Help
    }
}
