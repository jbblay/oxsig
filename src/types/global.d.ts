/**
 * Global type declarations for OxSig frontend
 */

// Lucide React icons
declare module 'lucide-react' {
  import { ComponentType } from 'react';
  
  interface IconProps {
    className?: string;
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
  }

  export const Phone: ComponentType<IconProps>;
  export const PhoneOff: ComponentType<IconProps>;
  export const Mic: ComponentType<IconProps>;
  export const MicOff: ComponentType<IconProps>;
  export const Volume2: ComponentType<IconProps>;
  export const VolumeX: ComponentType<IconProps>;
  export const Settings: ComponentType<IconProps>;
  export const User: ComponentType<IconProps>;
  export const Download: ComponentType<IconProps>;
  export const Upload: ComponentType<IconProps>;
  export const Shield: ComponentType<IconProps>;
  export const Trash2: ComponentType<IconProps>;
  export const Clock: ComponentType<IconProps>;
  export const File: ComponentType<IconProps>;
  export const Check: ComponentType<IconProps>;
  export const X: ComponentType<IconProps>;
  export const HardDrive: ComponentType<IconProps>;
  export const Archive: ComponentType<IconProps>;
}

// Node.js global process
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_TURN_URL?: string;
      NEXT_PUBLIC_TURN_USERNAME?: string;
      NEXT_PUBLIC_TURN_CREDENTIAL?: string;
      NODE_ENV?: 'development' | 'production' | 'test';
      DATABASE_URL?: string;
      POSTGRES_HOST?: string;
      POSTGRES_PORT?: string;
      POSTGRES_DB?: string;
      POSTGRES_USER?: string;
      POSTGRES_PASSWORD?: string;
      POSTGRES_SSL?: string;
      POSTGRES_SSL_REJECT_UNAUTHORIZED?: string;
      JWT_PRIVATE_KEY?: string;
      JWT_PUBLIC_KEY?: string;
    }
    
    interface Process {
      env: ProcessEnv;
    }
  }

  var process: NodeJS.Process;
}

// JSX namespace for React 19 compatibility
declare namespace JSX {
  type Element = React.ReactElement<any, any>;
  type ElementClass = React.Component<any>;
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

// Module declarations for missing packages
declare module '@noble/ed25519' {
  export function verify(sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): Promise<boolean>;
  export function getPublicKey(priv: Uint8Array): Promise<Uint8Array>;
  export function sign(msg: Uint8Array, priv: Uint8Array): Promise<Uint8Array>;
}

declare module '@noble/hashes/sha256' {
  export function sha256(input: Uint8Array): Uint8Array;
}

declare module '@noble/hashes/utils' {
  export function hexToBytes(hex: string): Uint8Array;
  export function bytesToHex(bytes: Uint8Array): string;
}

declare module 'next/server' {
  export class NextRequest {
    url: string;
    method: string;
    headers: Headers;
    json(): Promise<any>;
    ip?: string;
  }
}

export {};
