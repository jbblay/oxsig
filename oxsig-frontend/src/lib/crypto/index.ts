/**
 * Cryptographic System Initialization
 * 
 * Sets up the crypto providers and configures algorithm preferences
 */

import { cryptoRegistry, migrationManager, CRYPTO_SUITES, AlgorithmNegotiator } from './agility';
import { WebCryptoProvider } from './webCryptoProvider';

// Initialize crypto system
export async function initializeCrypto(): Promise<void> {
  // Register WebCrypto provider
  const webCryptoProvider = new WebCryptoProvider();
  await webCryptoProvider.initialize();
  cryptoRegistry.register(webCryptoProvider);
  
  // TODO: Register additional providers when available
  // - Noble crypto provider (pure JS implementation)
  // - WebAssembly provider (for performance)
  // - Post-quantum provider (when standards are finalized)
  
  // Set up algorithm migration plans
  setupMigrationPlans();
  
  console.log('Cryptographic system initialized');
  console.log('Available providers:', cryptoRegistry.listProviders());
  console.log('Default suite:', CRYPTO_SUITES.STANDARD);
}

function setupMigrationPlans(): void {
  // Example: Plan to migrate from ECDSA to Ed25519 (already complete)
  // Example: Future migration to post-quantum algorithms
  
  migrationManager.addMigrationPlan('pq-transition', {
    from: CRYPTO_SUITES.STANDARD,
    to: CRYPTO_SUITES.HYBRID_PQ,
    timeline: {
      deprecationDate: new Date('2029-01-01'), // When NIST finalizes PQ standards
      migrationDeadline: new Date('2030-01-01'), // Start hybrid mode
      removalDate: new Date('2035-01-01') // Full post-quantum only
    },
    compatibilityPeriod: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years
    steps: [
      {
        description: 'Deploy post-quantum crypto libraries',
        automated: true,
        estimatedDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
        dependencies: ['browser-support', 'library-updates']
      },
      {
        description: 'Enable hybrid mode for new keys',
        automated: true,
        estimatedDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
        dependencies: ['pq-libraries', 'testing']
      },
      {
        description: 'Migrate existing keys to hybrid',
        automated: false,
        estimatedDuration: 365 * 24 * 60 * 60 * 1000, // 1 year
        dependencies: ['user-consent', 'backup-strategy']
      }
    ]
  });
}

// Utility functions for common operations
export class CryptoUtils {
  /** Get the default crypto provider */
  static getProvider() {
    const provider = cryptoRegistry.getProvider();
    if (!provider) {
      throw new Error('No crypto provider available. Call initializeCrypto() first.');
    }
    return provider;
  }
  
  /** Negotiate crypto suite for a given context */
  static negotiateSuite(
    preferredSuites: string[] = ['standard'],
    securityLevel: 'standard' | 'high' | 'post-quantum' = 'standard'
  ) {
    const clientSuites = preferredSuites.map(name => {
      const suite = (CRYPTO_SUITES as any)[name.toUpperCase()];
      if (!suite) {
        throw new Error(`Unknown crypto suite: ${name}`);
      }
      return suite;
    });
    
    const provider = this.getProvider();
    const serverSuites = provider.capabilities.suites;
    
    return AlgorithmNegotiator.negotiate({
      clientSuites,
      serverSuites,
      securityLevel
    });
  }
  
  /** Check if current algorithms are deprecated */
  static checkDeprecation(suite: any) {
    return migrationManager.isDeprecated(suite);
  }
  
  /** Get active migration plans */
  static getActiveMigrations() {
    return migrationManager.getActivePlans();
  }
}

// Export commonly used suites for convenience
export { CRYPTO_SUITES };