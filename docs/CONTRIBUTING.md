# 🤝 Contributing to OxSig

Thank you for your interest in contributing to OxSig! This guide will help you get started with contributing to the project.

## 🎯 Project Mission

OxSig aims to provide quantum-safe, privacy-preserving secure communications and document management tools that are accessible, usable, and trustworthy. We believe in:

- **Security by Design** - Security is built into every component
- **Privacy First** - User privacy is never compromised
- **Open Source** - Transparency builds trust
- **Accessibility** - Security tools should be usable by everyone
- **Innovation** - Pushing the boundaries of web-based security

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **pnpm** (preferred) or npm
- **Git**
- **Modern browser** with WebAuthn support

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/oxsig.git
cd oxsig

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Open http://localhost:3000
```

### Project Structure

```
oxsig/
├── src/
│   ├── app/              # Next.js pages (App Router)
│   ├── components/       # React components
│   │   ├── ui/          # Reusable UI primitives
│   │   ├── app/         # Feature components
│   │   └── layout/      # Layout components
│   ├── lib/             # Business logic & utilities
│   ├── hooks/           # Custom React hooks
│   └── types/           # TypeScript definitions
├── docs/                # Documentation
├── public/              # Static assets
└── scripts/             # Build & deployment scripts
```

## 📋 How to Contribute

### 1. Issues & Bug Reports

**Before creating an issue:**
- Search existing issues to avoid duplicates
- Check if it's already fixed in the latest version
- Gather relevant information (browser, OS, steps to reproduce)

**Creating a good issue:**
```markdown
## Bug Description
Brief description of the issue

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- Browser: Chrome 120
- OS: macOS 14
- Version: 0.1.0

## Additional Context
Any other relevant information
```

### 2. Feature Requests

**Feature request template:**
```markdown
## Feature Description
Clear description of the proposed feature

## Problem Statement
What problem does this solve?

## Proposed Solution
How should this feature work?

## Alternatives Considered
Other approaches you've considered

## Additional Context
Mockups, examples, or references
```

### 3. Pull Requests

**Before submitting a PR:**
- Fork the repository
- Create a feature branch: `git checkout -b feature/amazing-feature`
- Make your changes
- Test thoroughly
- Update documentation if needed
- Commit with clear messages

**PR Guidelines:**
- One feature/fix per PR
- Include tests for new functionality
- Update documentation
- Follow the coding standards
- Ensure CI passes

## 🎨 Coding Standards

### TypeScript Guidelines

```typescript
// ✅ Good: Explicit types
interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  autoSave: boolean;
}

function updatePreferences(preferences: UserPreferences): void {
  // Implementation
}

// ✅ Good: Descriptive names
const isAuthenticationValid = checkUserCredentials(user);

// ❌ Bad: Unclear names
const check = validate(u);

// ✅ Good: Error handling
async function fetchUserData(id: string): Promise<User | null> {
  try {
    const response = await api.get(`/users/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}
```

### React Component Guidelines

```typescript
// ✅ Good: Component structure
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  onClick?: () => void;
}

export function Button({ 
  children, 
  variant = 'primary', 
  disabled = false, 
  onClick 
}: ButtonProps) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded',
        variant === 'primary' ? 'bg-blue-500' : 'bg-gray-500',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ✅ Good: Custom hooks
function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setStoredValue = useCallback((value: T) => {
    setValue(value);
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key]);

  return [value, setStoredValue] as const;
}
```

### CSS/Styling Guidelines

```typescript
// ✅ Good: Tailwind utility classes
<div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
    Title
  </h2>
  <Button variant="primary">Action</Button>
</div>

// ✅ Good: Component variants with cva
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

## 🧪 Testing Guidelines

### Unit Tests

```typescript
// ✅ Good: Test structure
describe('encryptData', () => {
  it('should encrypt data successfully', async () => {
    const plaintext = 'sensitive data';
    const key = await generateKey();
    
    const encrypted = await encryptData(plaintext, key);
    
    expect(encrypted.data).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.algorithm).toBe('AES-256-GCM');
  });

  it('should handle encryption errors gracefully', async () => {
    const plaintext = 'test data';
    const invalidKey = null;
    
    await expect(encryptData(plaintext, invalidKey))
      .rejects
      .toThrow('Invalid encryption key');
  });
});

// ✅ Good: Component testing
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('should render children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should handle click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Tests

```typescript
// ✅ Good: End-to-end test
import { test, expect } from '@playwright/test';

test('document signing workflow', async ({ page }) => {
  await page.goto('/sign');
  
  // Upload document
  await page.setInputFiles('[data-testid="file-upload"]', 'test-document.txt');
  await expect(page.getByText('test-document.txt')).toBeVisible();
  
  // Edit document
  await page.fill('[data-testid="editor"]', 'Updated content');
  
  // Sign document
  await page.click('[data-testid="sign-button"]');
  await expect(page.getByText('Document signed successfully')).toBeVisible();
});
```

## 🔒 Security Guidelines

### Cryptographic Code

```typescript
// ✅ Good: Secure random generation
const nonce = crypto.getRandomValues(new Uint8Array(12));

// ❌ Bad: Weak randomness
const weakNonce = Math.random().toString();

// ✅ Good: Constant-time comparison
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

// ❌ Bad: Timing attack vulnerable
function insecureEqual(a: string, b: string): boolean {
  return a === b; // Fails fast
}
```

### Input Validation

```typescript
// ✅ Good: Input validation with Zod
import { z } from 'zod';

const DocumentSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().max(1000000),
  tags: z.array(z.string()).max(10)
});

function validateDocument(data: unknown): Document {
  return DocumentSchema.parse(data);
}

// ✅ Good: Sanitize HTML
import DOMPurify from 'dompurify';

function sanitizeHTML(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'p', 'br'],
    ALLOWED_ATTR: []
  });
}
```

## 📚 Documentation Standards

### Code Documentation

```typescript
/**
 * Encrypts sensitive data using AES-256-GCM
 * 
 * @param data - The plaintext data to encrypt
 * @param key - The encryption key (must be AES-256 compatible)
 * @returns Promise resolving to encrypted data with IV
 * 
 * @example
 * ```typescript
 * const key = await generateEncryptionKey();
 * const encrypted = await encryptData('secret message', key);
 * ```
 * 
 * @throws {Error} If encryption fails or key is invalid
 */
async function encryptData(
  data: string, 
  key: CryptoKey
): Promise<EncryptedData> {
  // Implementation
}
```

### Component Documentation

```typescript
/**
 * A secure file upload component with validation and preview
 * 
 * @param acceptedTypes - MIME types to accept (default: all)
 * @param maxSize - Maximum file size in bytes (default: 10MB)
 * @param onUpload - Callback when file is successfully uploaded
 * @param onError - Callback when upload fails
 * 
 * @example
 * ```tsx
 * <FileUpload
 *   acceptedTypes={['text/plain', 'application/pdf']}
 *   maxSize={5 * 1024 * 1024} // 5MB
 *   onUpload={(file) => console.log('Uploaded:', file.name)}
 *   onError={(error) => console.error('Upload failed:', error)}
 * />
 * ```
 */
interface FileUploadProps {
  acceptedTypes?: string[];
  maxSize?: number;
  onUpload?: (file: File) => void;
  onError?: (error: Error) => void;
}
```

## 🔄 Development Workflow

### Git Workflow

```bash
# 1. Create feature branch
git checkout main
git pull origin main
git checkout -b feature/add-new-encryption

# 2. Make changes
# ... code changes ...

# 3. Commit with conventional commits
git add .
git commit -m "feat: add ChaCha20-Poly1305 encryption option"

# 4. Push and create PR
git push origin feature/add-new-encryption
# Create PR via GitHub
```

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(auth): add WebAuthn biometric authentication
fix(editor): resolve canvas drawing performance issue
docs(security): update cryptographic implementation guide
test(crypto): add unit tests for key derivation functions
```

### Code Review Process

**As a contributor:**
1. Ensure all CI checks pass
2. Write clear PR description
3. Respond to review comments promptly
4. Update based on feedback

**As a reviewer:**
1. Focus on security implications
2. Check for proper error handling
3. Verify test coverage
4. Ensure documentation updates
5. Test functionality locally

## 🏷️ Issue Labels

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Documentation improvements
- `security` - Security-related issues
- `performance` - Performance improvements
- `accessibility` - Accessibility improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `priority:high` - High priority
- `priority:low` - Low priority

## 🎯 Contribution Areas

### High-Impact Areas

1. **Security Features**
   - Post-quantum cryptography implementation
   - Zero-knowledge proof integration
   - Advanced threat detection

2. **User Experience**
   - Accessibility improvements
   - Mobile responsiveness
   - Performance optimization

3. **Documentation**
   - API documentation
   - Tutorial videos
   - Usage examples

4. **Testing**
   - Unit test coverage
   - Integration tests
   - Security testing

### Beginner-Friendly Areas

1. **UI Components**
   - Icon updates
   - Color scheme improvements
   - Animation enhancements

2. **Documentation**
   - Typo fixes
   - Example additions
   - Translation

3. **Bug Fixes**
   - Minor UI bugs
   - Console warning fixes
   - Browser compatibility

## 🏆 Recognition

Contributors are recognized through:

- **GitHub Contributors** - Automatic recognition in repository
- **Changelog Credits** - Mentioned in release notes
- **Documentation Credits** - Listed in project documentation
- **Special Thanks** - Recognition for significant contributions

## 📞 Getting Help

- **GitHub Discussions** - General questions and ideas
- **GitHub Issues** - Bug reports and feature requests
- **Discord** - Real-time chat (link in repository)
- **Email** - security@oxsig.dev for security-related questions

## 📜 Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) for details on our community standards.

### Our Pledge

- **Be respectful** - Treat everyone with respect and kindness
- **Be inclusive** - Welcome people of all backgrounds and identities
- **Be collaborative** - Work together constructively
- **Be patient** - Help others learn and grow
- **Be professional** - Maintain professional standards

## 📄 License

By contributing to OxSig, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to OxSig! Together, we can build better security tools for everyone. 🚀