# 🛡️ OxSig Developer Security Setup Guide

## Overview

This guide provides comprehensive security hardening steps for OxSig development environments. Following these practices ensures that contributors maintain the same high security standards as the production system.

---

## 🔧 Initial Environment Setup

### Prerequisites

Before starting development, ensure your system meets these security requirements:

```bash
# Verify system security features
# 1. Check for hardware security support
echo "Checking TPM support..."
ls /dev/tpm* 2>/dev/null && echo "✅ TPM available" || echo "❌ TPM not found"

# 2. Verify secure boot (Linux)
mokutil --sb-state 2>/dev/null && echo "✅ Secure Boot enabled" || echo "❌ Secure Boot disabled"

# 3. Check disk encryption
lsblk -f | grep -i crypt && echo "✅ Disk encryption detected" || echo "⚠️  Consider enabling disk encryption"

# 4. Verify firewall status
sudo ufw status | grep "Status: active" && echo "✅ Firewall active" || echo "❌ Enable firewall"
```

### Required Software Versions

| Tool | Minimum Version | Recommended | Security Notes |
|------|----------------|-------------|----------------|
| Node.js | 18.17.0 | 20.10.0+ | LTS versions only, verify signatures |
| pnpm | 8.6.0 | 8.14.0+ | Use lockfile for reproducible builds |
| Git | 2.39.0 | 2.43.0+ | Enable GPG signing for commits |
| Docker | 20.10.0 | 24.0.0+ | Rootless mode recommended |
| VS Code | 1.75.0 | Latest | Enable security extensions |

---

## 📦 Secure Installation Process

### 1. Repository Setup

```bash
# Clone with verification
git clone --recurse-submodules https://github.com/jbblay/oxsig.git
cd oxsig

# Verify repository integrity
git verify-commit HEAD || echo "⚠️  Commit signature verification failed"

# Set up GPG signing for your commits
git config user.signingkey YOUR_GPG_KEY_ID
git config commit.gpgsign true
git config tag.gpgSign true

# Configure security-focused Git settings
git config --global user.email "your-secure-email@example.com"
git config --global init.defaultBranch main
git config --global pull.rebase true
git config --global fetch.prune true
```

### 2. Dependency Management

```bash
# Install pnpm securely
curl -fsSL https://get.pnpm.io/install.sh | sh -
# OR use npm with verification
npm install -g pnpm --verify-signatures

# Verify package integrity before installation
pnpm audit --audit-level high
pnpm install --frozen-lockfile

# Set up security auditing hooks
echo "pnpm audit --audit-level high" > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### 3. Environment Configuration

Create your `.env.local` file with security best practices:

```bash
# Copy example environment file
cp .env.example .env.local

# Generate secure random values
echo "Generating secure environment values..."

# Generate VAPID keys for push notifications
echo "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=$(openssl rand -base64 87 | tr -d '\n')" >> .env.local
echo "WEB_PUSH_VAPID_PRIVATE_KEY=$(openssl rand -base64 43 | tr -d '\n')" >> .env.local

# Generate session secrets
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env.local

# Set secure CSP nonce
echo "CSP_NONCE=$(openssl rand -base64 16)" >> .env.local

# Database encryption key
echo "DATABASE_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env.local

# Set appropriate file permissions
chmod 600 .env.local
```

**Complete `.env.local` Template:**

```bash
# =============================================================================
# OxSig Development Environment Configuration
# Security Notice: Never commit this file to version control
# =============================================================================

# -----------------------------------------------------------------------------
# Core Application Settings
# -----------------------------------------------------------------------------
NODE_ENV=development
NEXT_PUBLIC_APP_URL=https://localhost:3000
NEXT_PUBLIC_APP_NAME=OxSig

# -----------------------------------------------------------------------------
# Database Configuration (Optional - uses IndexedDB by default)
# -----------------------------------------------------------------------------
# NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
# DATABASE_ENCRYPTION_KEY=generated_key_above

# -----------------------------------------------------------------------------
# Authentication Settings
# -----------------------------------------------------------------------------
NEXTAUTH_URL=https://localhost:3000
NEXTAUTH_SECRET=generated_secret_above

# WebAuthn Configuration
NEXT_PUBLIC_WEBAUTHN_RPID=localhost
NEXT_PUBLIC_WEBAUTHN_ORIGIN=https://localhost:3000

# -----------------------------------------------------------------------------
# Push Notifications (VAPID Keys)
# -----------------------------------------------------------------------------
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=generated_public_key_above
WEB_PUSH_VAPID_PRIVATE_KEY=generated_private_key_above

# -----------------------------------------------------------------------------
# Security Headers
# -----------------------------------------------------------------------------
CSP_NONCE=generated_nonce_above
SECURITY_HEADERS_ENABLED=true

# -----------------------------------------------------------------------------
# Development Tools
# -----------------------------------------------------------------------------
ANALYZE_BUNDLE=false
DEBUG_MODE=true
LOG_LEVEL=info

# -----------------------------------------------------------------------------
# Optional: External Services
# -----------------------------------------------------------------------------
# MONITORING_API_KEY=your_monitoring_key
# ERROR_REPORTING_DSN=your_sentry_dsn
```

---

## 🔒 Security Hardening Steps

### 1. System-Level Hardening

#### macOS Security Setup
```bash
# Enable system integrity protection
csrutil status | grep enabled || echo "⚠️  Enable SIP in Recovery Mode"

# Configure firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setloggingmode on

# Enable FileVault disk encryption
sudo fdesetup status | grep "On" || echo "⚠️  Enable FileVault in Security & Privacy"

# Secure browser settings for development
defaults write com.apple.Safari WebKitDeveloperExtras -bool true
defaults write com.apple.Safari IncludeDeveloperMenu -bool true
```

#### Linux Security Setup
```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 3000/tcp comment "OxSig dev server"

# Set up fail2ban for brute force protection
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Secure SSH configuration
echo "PasswordAuthentication no" | sudo tee -a /etc/ssh/sshd_config
echo "PermitRootLogin no" | sudo tee -a /etc/ssh/sshd_config
sudo systemctl reload ssh

# Enable automatic security updates
sudo apt install unattended-upgrades -y
echo 'Unattended-Upgrade::Automatic-Reboot "false";' | sudo tee -a /etc/apt/apt.conf.d/50unattended-upgrades
```

#### Windows Security Setup
```powershell
# Enable Windows Defender real-time protection
Set-MpPreference -DisableRealtimeMonitoring $false

# Configure Windows Firewall
New-NetFirewallRule -DisplayName "OxSig Dev" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# Enable BitLocker (requires TPM)
Enable-BitLocker -MountPoint "C:" -EncryptionMethod XtsAes256 -RecoveryPasswordProtector

# Secure PowerShell execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2. Development Environment Hardening

#### VS Code Security Extensions
```json
{
  "recommendations": [
    "ms-vscode.vscode-json",
    "ms-vscode.references-view", 
    "github.vscode-github-actions",
    "ms-vscode.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense",
    "ms-vscode.vscode-security-scan",
    "snyk-security.snyk-vulnerability-scanner",
    "sonarsource.sonarlint-vscode"
  ]
}
```

#### Secure VS Code Settings
```json
{
  "security.workspace.trust.enabled": true,
  "security.workspace.trust.startupPrompt": "always",
  "extensions.ignoreRecommendations": false,
  "git.autofetch": false,
  "git.confirmSync": true,
  "typescript.disableAutomaticTypeAcquisition": false,
  "npm.fetchOnlinePackageInfo": false,
  "telemetry.telemetryLevel": "off"
}
```

### 3. Git Security Configuration

#### Commit Signing Setup
```bash
# Generate GPG key for commit signing
gpg --full-generate-key
# Select: RSA and RSA, 4096 bits, expires in 1 year

# List keys and get key ID
gpg --list-secret-keys --keyid-format LONG

# Configure Git to use GPG key
git config --global user.signingkey YOUR_KEY_ID
git config --global commit.gpgsign true
git config --global gpg.program $(which gpg)

# Add GPG key to GitHub/GitLab
gpg --armor --export YOUR_KEY_ID
# Copy output and add to your Git provider
```

#### Git Security Hooks
```bash
# Create comprehensive pre-commit hook
cat << 'EOF' > .git/hooks/pre-commit
#!/bin/bash
set -e

echo "🔍 Running security checks..."

# 1. Dependency audit
echo "Checking for vulnerable dependencies..."
pnpm audit --audit-level high

# 2. Secret detection
echo "Scanning for secrets..."
git diff --cached --name-only | xargs grep -l "password\|secret\|key\|token" && {
  echo "❌ Potential secrets detected in staged files"
  exit 1
} || echo "✅ No secrets detected"

# 3. Lint security issues
echo "Running security linting..."
pnpm run lint:security || {
  echo "❌ Security linting failed"
  exit 1
}

# 4. Type checking
echo "Running type checking..."
pnpm run type-check || {
  echo "❌ Type checking failed" 
  exit 1
}

echo "✅ All security checks passed"
EOF

chmod +x .git/hooks/pre-commit
```

---

## 🧪 Security Testing & Validation

### Automated Security Checks

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "security:audit": "pnpm audit --audit-level high",
    "security:deps": "pnpm dlx audit-ci --high",
    "security:secrets": "pnpm dlx detect-secrets scan --all-files",
    "security:lint": "pnpm dlx eslint . --ext .ts,.tsx --config .eslintrc.security.js",
    "security:test": "pnpm run security:audit && pnpm run security:deps && pnpm run security:secrets && pnpm run security:lint",
    "security:csp": "pnpm dlx csp-evaluator",
    "security:headers": "curl -I https://localhost:3000 | grep -E '(Content-Security-Policy|X-Frame-Options|X-Content-Type-Options)'",
    "type-check": "tsc --noEmit",
    "build:secure": "pnpm run security:test && pnpm run build"
  }
}
```

### Security-Focused ESLint Configuration

Create `.eslintrc.security.js`:

```javascript
module.exports = {
  extends: [
    '@next/next/core-web-vitals',
    'plugin:security/recommended'
  ],
  plugins: ['security'],
  rules: {
    // Security-specific rules
    'security/detect-object-injection': 'error',
    'security/detect-non-literal-regexp': 'error',
    'security/detect-non-literal-fs-filename': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-unsafe-regex': 'error',
    
    // Crypto-specific rules
    'no-restricted-globals': ['error', 
      { name: 'crypto', message: 'Use Web Crypto API instead' }
    ],
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['crypto'],
        message: 'Use secure crypto implementations from lib/crypto'
      }]
    }],
    
    // Prevent dangerous patterns
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error'
  }
};
```

### Local Security Testing

```bash
# Run comprehensive security test suite
pnpm run security:test

# Test HTTPS development server
pnpm dev:secure

# Manual security verification
echo "🔍 Manual Security Checklist:"
echo "1. Check HTTPS certificate validity"
echo "2. Verify CSP headers in browser DevTools"
echo "3. Test WebAuthn functionality"
echo "4. Validate crypto operations in console"
echo "5. Check for console errors/warnings"
echo "6. Verify service worker registration"
```

---

## 🏗️ Secure Development Workflow

### Branch Protection & Code Review

```bash
# Create feature branch with security focus
git checkout -b feature/secure-implementation

# Regular security commits with signing
git add .
git commit -S -m "feat: implement secure key management

- Add hardware-backed key storage
- Implement biometric authentication
- Add audit logging for key operations
- Security audit: passed"

# Security-focused pull request template
cat << 'EOF' > .github/pull_request_template.md
## Security Checklist

- [ ] No hardcoded secrets or API keys
- [ ] All crypto operations use approved libraries
- [ ] Input validation implemented for all user inputs
- [ ] Error messages don't leak sensitive information
- [ ] CSRF protection enabled for state-changing operations
- [ ] XSS protection via CSP and input sanitization
- [ ] Dependency audit passed (pnpm audit)
- [ ] Security tests added/updated
- [ ] Documentation updated for security-relevant changes

## Changes Made

<!-- Describe your changes -->

## Security Impact

<!-- Describe any security implications -->

## Testing

- [ ] Manual testing completed
- [ ] Automated tests pass
- [ ] Security test suite passes
- [ ] Cross-browser testing completed (Chrome, Firefox, Safari)
EOF
```

### Continuous Security Integration

#### GitHub Actions Security Workflow

```yaml
name: Security Checks
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Security audit
        run: pnpm audit --audit-level high
      
      - name: Dependency scan
        uses: actions/dependency-review-action@v3
        
      - name: Secret detection
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD
      
      - name: Security linting
        run: pnpm run lint:security
        
      - name: SAST scan
        uses: github/codeql-action/analyze@v3
        with:
          languages: typescript
```

---

## 🚨 Incident Response for Developers

### Security Issue Reporting

If you discover a security vulnerability:

1. **DO NOT** create a public GitHub issue
2. **DO NOT** discuss in public channels
3. **DO** email security@oxsig.com immediately
4. **DO** include:
   - Detailed vulnerability description
   - Steps to reproduce
   - Potential impact assessment
   - Suggested mitigation (if known)

### Emergency Procedures

```bash
# Immediate response to suspected compromise
echo "🚨 SECURITY INCIDENT RESPONSE"

# 1. Isolate the environment
docker-compose down  # Stop all services
git stash           # Preserve work
git checkout main   # Return to known-good state

# 2. Preserve evidence
cp -r .git /tmp/git-backup-$(date +%s)
pnpm audit --json > /tmp/audit-$(date +%s).json

# 3. Check for compromise indicators
find . -name "*.js" -o -name "*.ts" | xargs grep -l "eval\|Function\|setTimeout.*string"
git log --oneline -10 --grep="malicious\|backdoor\|exploit"

# 4. Reset to clean state
git reset --hard HEAD
rm -rf node_modules
pnpm install

# 5. Verify integrity
pnpm run security:test
```

### Development Security Monitoring

```bash
# Set up local security monitoring
echo "Setting up security monitoring..."

# File integrity monitoring
echo "audit watch ~/{.env,.env.local,package.json,pnpm-lock.yaml}" | crontab -

# Process monitoring for suspicious activity
ps aux | grep -E "(crypto|miner|tor)" && echo "⚠️  Suspicious processes detected"

# Network monitoring during development
lsof -i :3000 | grep LISTEN && echo "✅ Dev server running on expected port"
```

---

## 📚 Security Resources & Training

### Recommended Reading

1. **OWASP Top 10 2021** - https://owasp.org/Top10/
2. **NIST Cybersecurity Framework** - https://www.nist.gov/cyberframework
3. **Web Crypto API Security** - https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
4. **Secure Coding Practices** - https://owasp.org/www-pdf-archive/OWASP_SCP_Quick_Reference_Guide_v2.pdf

### Security Training Checklist

- [ ] Complete OWASP WebGoat exercises
- [ ] Review OxSig security architecture documentation
- [ ] Practice secure coding patterns
- [ ] Understand cryptographic implementations used
- [ ] Learn incident response procedures
- [ ] Stay updated on security advisories

### Community & Support

- **Security Questions**: security@oxsig.com
- **General Development**: GitHub Discussions
- **Code Review**: Pull Request reviews
- **Documentation**: `/docs` directory

---

Following this security setup guide ensures that your OxSig development environment maintains the same high security standards as our production systems. Remember: security is everyone's responsibility!