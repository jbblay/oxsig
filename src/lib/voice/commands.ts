/**
 * Voice Commands System
 * Provides hands-free operation and accessibility
 */

export interface VoiceCommand {
  pattern: RegExp;
  action: () => void;
  description: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export class VoiceCommandSystem {
  private recognition: any = null;
  private isListening = false;
  private commands: VoiceCommand[] = [];
  private onResultCallback?: (transcript: string) => void;
  private onErrorCallback?: (error: string) => void;
  private initialized = false;

  constructor() {
    // Don't initialize during SSR
    if (typeof window === 'undefined') return;
    this.initialize();
  }

  /**
   * Initialize the system (lazy initialization)
   */
  private initialize(): void {
    if (this.initialized) return;
    if (this.isSupported()) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
      this.registerDefaultCommands();
      this.initialized = true;
    }
  }

  /**
   * Check if speech recognition is supported
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Setup recognition instance
   */
  private setupRecognition(): void {
    if (!this.recognition) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript.toLowerCase().trim();
      
      console.log('Voice command:', transcript);
      
      if (this.onResultCallback) {
        this.onResultCallback(transcript);
      }

      this.executeCommand(transcript);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }

      // Auto-restart on network errors
      if (event.error === 'network') {
        setTimeout(() => {
          if (this.isListening) {
            this.start();
          }
        }, 1000);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if still listening
      if (this.isListening) {
        this.recognition.start();
      }
    };
  }

  /**
   * Register default commands
   */
  private registerDefaultCommands(): void {
    // Navigation commands
    this.registerCommand(/go (to )?home/, () => {
      window.location.href = '/';
    }, 'Navigate to home page');

    this.registerCommand(/sign document/, () => {
      window.location.href = '/sign';
    }, 'Open document signing');

    this.registerCommand(/open (my )?profile/, () => {
      window.location.href = '/profile';
    }, 'Open user profile');

    this.registerCommand(/open security/, () => {
      window.location.href = '/security';
    }, 'Open security center');

    this.registerCommand(/open (collaboration|collab)/, () => {
      window.location.href = '/collab';
    }, 'Open collaboration');

    this.registerCommand(/open identity/, () => {
      window.location.href = '/identity';
    }, 'Open identity management');

    this.registerCommand(/open (privacy|private mode)/, () => {
      window.location.href = '/privacy';
    }, 'Open privacy controls');

    // Theme commands
    this.registerCommand(/dark mode/, () => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }, 'Switch to dark mode');

    this.registerCommand(/light mode/, () => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }, 'Switch to light mode');

    this.registerCommand(/toggle theme/, () => {
      document.documentElement.classList.toggle('dark');
      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      localStorage.setItem('theme', theme);
    }, 'Toggle dark/light mode');

    // Action commands
    this.registerCommand(/refresh (page)?/, () => {
      window.location.reload();
    }, 'Refresh current page');

    this.registerCommand(/go back/, () => {
      window.history.back();
    }, 'Go back to previous page');

    this.registerCommand(/go forward/, () => {
      window.history.forward();
    }, 'Go forward');

    // Utility commands
    this.registerCommand(/what can (you|i) (do|say)/, () => {
      this.showCommandsList();
    }, 'Show available commands');

    this.registerCommand(/help/, () => {
      this.showCommandsList();
    }, 'Show help');

    // Security commands
    this.registerCommand(/lock screen/, () => {
      // Trigger lock screen
      window.location.href = '/?locked=true';
    }, 'Lock the application');

    this.registerCommand(/show (security )?score/, () => {
      window.location.href = '/security';
    }, 'Show security score');
  }

  /**
   * Register custom command
   */
  registerCommand(pattern: RegExp, action: () => void, description: string): void {
    this.commands.push({ pattern, action, description });
  }

  /**
   * Execute matching command
   */
  private executeCommand(transcript: string): void {
    for (const command of this.commands) {
      if (command.pattern.test(transcript)) {
        console.log('Executing command:', command.description);
        command.action();
        this.speak(`${command.description}`);
        return;
      }
    }
    
    console.log('No matching command found for:', transcript);
    this.speak('Command not recognized');
  }

  /**
   * Start listening
   */
  start(): void {
    if (typeof window === 'undefined') return;
    if (!this.initialized) this.initialize();
    
    if (!this.isSupported()) {
      console.warn('Speech recognition not supported');
      return;
    }

    if (this.isListening) {
      console.log('Already listening');
      return;
    }

    try {
      this.recognition.start();
      this.isListening = true;
      console.log('Voice commands activated');
      this.speak('Voice commands activated');
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
    }
  }

  /**
   * Stop listening
   */
  stop(): void {
    if (!this.recognition || !this.isListening) return;

    this.isListening = false;
    this.recognition.stop();
    console.log('Voice commands deactivated');
    this.speak('Voice commands deactivated');
  }

  /**
   * Toggle listening
   */
  toggle(): void {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * Text-to-speech
   */
  speak(text: string): void {
    if (typeof window === 'undefined') return;
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }

  /**
   * Show available commands
   */
  private showCommandsList(): void {
    const commandsList = this.commands.map(cmd => cmd.description).join(', ');
    this.speak(`Available commands: ${commandsList}`);
    
    // Also log to console
    console.group('Available Voice Commands');
    this.commands.forEach(cmd => {
      console.log(`- ${cmd.description}`);
    });
    console.groupEnd();
  }

  /**
   * Set result callback
   */
  onResult(callback: (transcript: string) => void): void {
    this.onResultCallback = callback;
  }

  /**
   * Set error callback
   */
  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Get listening status
   */
  getListeningStatus(): boolean {
    return this.isListening;
  }

  /**
   * Get all registered commands
   */
  getCommands(): VoiceCommand[] {
    return this.commands;
  }
}

// Singleton instance
export const voiceCommands = new VoiceCommandSystem();

/**
 * Initialize voice commands on page load
 */
export function initVoiceCommands(): void {
  if (typeof window === 'undefined') return;
  
  if (!voiceCommands.isSupported()) {
    console.warn('Voice commands not supported on this browser');
    return;
  }

  console.log('Voice commands system initialized. Say "help" to see available commands.');
  
  // Auto-start if user has enabled it
  const autoStart = localStorage.getItem('voice-commands-auto-start') === 'true';
  if (autoStart) {
    voiceCommands.start();
  }
}

/**
 * Quick start helper
 */
export function startVoiceCommands(): void {
  voiceCommands.start();
  localStorage.setItem('voice-commands-auto-start', 'true');
}

/**
 * Quick stop helper
 */
export function stopVoiceCommands(): void {
  voiceCommands.stop();
  localStorage.setItem('voice-commands-auto-start', 'false');
}

/**
 * Toggle voice commands
 */
export function toggleVoiceCommands(): boolean {
  voiceCommands.toggle();
  const isListening = voiceCommands.getListeningStatus();
  localStorage.setItem('voice-commands-auto-start', String(isListening));
  return isListening;
}
