# Environment Variables Setup Guide

This guide explains how to set up environment variables for OxSig.

## Quick Start

1. Copy `.env.local` to create your local environment file
2. Fill in the required values (see sections below)
3. Restart your development server

## Required Services

### Essential (App won't work without these)

#### 1. **Supabase** (Database & Auth)
- Sign up at: https://supabase.com
- Create a new project
- Go to Settings → API
- Copy `URL` and `anon key`

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
```

#### 2. **Encryption Keys** (Security)
Generate secure keys:
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate NextAuth secret
openssl rand -base64 32
```

```env
ENCRYPTION_KEY=your_32_byte_hex_key
NEXTAUTH_SECRET=your_nextauth_secret
```

### Optional (Enable specific features)

#### 3. **IPFS / Web3.Storage** (Document Storage)
- Sign up at: https://web3.storage
- Generate API token
- Or use Pinata: https://pinata.cloud

```env
NEXT_PUBLIC_WEB3_STORAGE_TOKEN=your_token
# OR
PINATA_JWT=your_pinata_jwt
```

#### 4. **Alchemy** (Blockchain)
- Sign up at: https://alchemy.com
- Create app (Ethereum, Polygon, etc.)
- Copy API key

```env
ALCHEMY_API_KEY=your_key
NEXT_PUBLIC_ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

#### 5. **Web Push** (Notifications)
Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
```

#### 6. **OpenAI** (AI Assistant)
- Get API key: https://platform.openai.com/api-keys

```env
OPENAI_API_KEY=sk-...
```

## Feature Flags

Control which features are enabled:

```env
# Core Features (recommended: true)
NEXT_PUBLIC_ENABLE_VOICE_COMMANDS=true
NEXT_PUBLIC_ENABLE_QR_SIGNING=true
NEXT_PUBLIC_ENABLE_BIOMETRIC_AUTH=true
NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_OFFLINE_MODE=true

# Beta Features (recommended: false until implemented)
NEXT_PUBLIC_ENABLE_BLOCKCHAIN=false
NEXT_PUBLIC_ENABLE_IPFS=false
NEXT_PUBLIC_ENABLE_AI_ASSISTANT=false
NEXT_PUBLIC_ENABLE_COLLABORATION=false
NEXT_PUBLIC_ENABLE_GUARDIAN_RECOVERY=false
```

## Development Mode

For local development without external services:

```env
# Use mock services
NEXT_PUBLIC_USE_MOCK_RELAY=true
NEXT_PUBLIC_USE_MOCK_IPFS=true
NEXT_PUBLIC_USE_MOCK_BLOCKCHAIN=true

# Enable debug logging
NEXT_PUBLIC_DEBUG=true
DEBUG=true
```

## Production Deployment

When deploying to production:

1. **Update URLs:**
```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXTAUTH_URL=https://yourdomain.com
```

2. **Disable mocks:**
```env
NEXT_PUBLIC_USE_MOCK_RELAY=false
NEXT_PUBLIC_USE_MOCK_BLOCKCHAIN=false
NEXT_PUBLIC_DEBUG=false
```

3. **Add production keys:**
   - Use production Supabase project
   - Use mainnet blockchain endpoints
   - Add real SMTP credentials
   - Configure analytics

## Testing Checklist

Before committing, verify:

- [ ] `.env.local` is in `.gitignore`
- [ ] No secrets in `.env.example`
- [ ] All required variables are set
- [ ] Feature flags match your setup
- [ ] Development server starts without errors

## Troubleshooting

### "Missing environment variable" error
- Check variable name matches exactly
- Ensure `.env.local` is in project root
- Restart dev server after changes

### Services not connecting
- Verify API keys are correct
- Check URLs don't have trailing slashes
- Ensure feature flags are enabled

### Build errors
- Run `pnpm run build` to check
- Some vars must start with `NEXT_PUBLIC_`
- Server-only vars can't use `NEXT_PUBLIC_`

## Security Notes

⚠️ **NEVER commit:**
- `.env.local` (contains secrets)
- Any file with real API keys
- Private keys or passwords

✅ **Safe to commit:**
- `.env.example` (template only)
- This README
- Configuration without secrets

## Support

For issues:
1. Check this README
2. Review `.env.example`
3. See main README.md
4. Open GitHub issue

---

**Last Updated:** October 18, 2025
