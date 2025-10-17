# Icon Generation Guide

## Required Icons for PWA

### Favicon
- favicon.ico (48x48) - ✅ Already exists

### PWA Icons (PNG format)
1. **icon-192.png** (192x192) - Android Chrome, small icon
2. **icon-512.png** (512x512) - Android Chrome, large icon, splash screens

### Apple Touch Icons
3. **apple-touch-icon.png** (180x180) - iOS devices

### Screenshots (Optional but recommended)
4. **screenshot-wide.png** (1280x720) - Desktop/tablet view
5. **screenshot-narrow.png** (750x1334) - Mobile view

## How to Generate Icons

### Using ImageMagick (Command Line)
```bash
# From a source SVG or high-res PNG (logo.png)

# Generate 192x192
magick logo.png -resize 192x192 icon-192.png

# Generate 512x512
magick logo.png -resize 512x512 icon-512.png

# Generate Apple icon
magick logo.png -resize 180x180 apple-touch-icon.png

# Generate favicon
magick logo.png -resize 48x48 favicon.ico
```

### Using Online Tools
1. **RealFaviconGenerator** (https://realfavicongenerator.net/)
   - Upload your logo
   - Auto-generates all sizes
   - Provides optimized manifest

2. **PWA Asset Generator** (https://www.pwabuilder.com/)
   - Upload base image
   - Generates all PWA assets
   - Creates manifest.json

### Design Requirements

#### Icon Design Best Practices
- Use square format (1:1 aspect ratio)
- Minimum 512x512 source image
- SVG preferred for scalability
- Include padding (safe area)
- Test on light and dark backgrounds
- Ensure recognizability at small sizes

#### Recommended Colors (OxSig)
- Primary: Blue (#3b82f6)
- Secondary: Purple (#8b5cf6)
- Background: Dark (#0a0a0a) or White (#ffffff)

#### Maskable Icons
- Add 10% safe zone padding
- Important content in center 80%
- Set "purpose": "any maskable" in manifest

### Temporary Placeholders

Until custom icons are generated, the app uses:
- `/favicon.ico` - Existing Next.js favicon
- Fallback for all other sizes

### Generating Screenshots

#### Desktop Screenshot (1280x720)
1. Navigate to `/` (home page)
2. Resize browser to 1280x720
3. Take screenshot
4. Save as `screenshot-wide.png`

#### Mobile Screenshot (750x1334)
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select iPhone 8 (or similar)
4. Navigate to home page
5. Take screenshot
6. Save as `screenshot-narrow.png`

### File Locations
Place all generated icons in:
```
oxsig/
  public/
    favicon.ico           ✅ Exists
    icon-192.png          🔴 To generate
    icon-512.png          🔴 To generate
    apple-touch-icon.png  🔴 To generate
    screenshot-wide.png   🔴 To generate
    screenshot-narrow.png 🔴 To generate
```

### Testing Icons
After generation:
1. Clear browser cache
2. Reload app
3. Check DevTools > Application > Manifest
4. Verify all icons load correctly
5. Test PWA installation
6. Check app icon on home screen/desktop

## Quick Setup Script

```bash
cd oxsig/public

# If you have a logo.svg or logo.png in root:
# Run these commands:

# Generate PWA icons
convert ../logo.png -resize 192x192 icon-192.png
convert ../logo.png -resize 512x512 icon-512.png
convert ../logo.png -resize 180x180 apple-touch-icon.png

# Or use npm package
npx pwa-asset-generator logo.png ./public --icon-only
```
