/**
 * Global type declarations for OxSig frontend
 */

// React types
declare module 'react' {
  export = React;
  export as namespace React;
  namespace React {
    type FC<P = {}> = FunctionComponent<P>;
    type ReactNode = any;
    type ReactElement = any;
    type ComponentType<P = {}> = any;
    type RefObject<T> = { current: T | null };
    type MutableRefObject<T> = { current: T };
    
    interface FunctionComponent<P = {}> {
      (props: P, context?: any): ReactElement | null;
      propTypes?: WeakValidationMap<P>;
      contextTypes?: ValidationMap<any>;
      defaultProps?: Partial<P>;
    }

    interface Component<P = {}, S = {}> {
      props: Readonly<P>;
      state: Readonly<S>;
    }

    interface ComponentClass<P = {}, S = Component['state']> {
      new (props: P, context?: any): Component<P, S>;
    }

    type ValidationMap<T> = { [K in keyof T]?: any };
    type WeakValidationMap<T> = { [K in keyof T]?: any };

    function useState<S>(initialState: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void];
    function useEffect(effect: () => void | (() => void), deps?: any[]): void;
    function useRef<T>(initialValue: T): MutableRefObject<T>;
    function useRef<T>(initialValue: T | null): RefObject<T>;
    function useRef<T = undefined>(): MutableRefObject<T | undefined>;
    
    function createElement(type: any, props?: any, ...children: any[]): ReactElement;
  }
}

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
      POSTGRES_HOST?: string;
      POSTGRES_PORT?: string;
      POSTGRES_DB?: string;
      POSTGRES_USER?: string;
      POSTGRES_PASSWORD?: string;
    }
    
    interface Process {
      env: ProcessEnv;
    }
  }

  var process: NodeJS.Process;
}

// JSX namespace
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    
    interface Element {
      type: any;
      props: any;
      key: any;
    }
  }
}

// UI component props
export interface BadgeProps {
  children?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

declare module '@/components/ui/badge' {
  export const Badge: React.ComponentType<BadgeProps>;
}

declare module '@/components/ui/button' {
  export interface ButtonProps {
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
  }
  export const Button: React.ComponentType<ButtonProps>;
}

declare module '@/components/ui/card' {
  export interface CardProps {
    children?: React.ReactNode;
    className?: string;
  }
  export const Card: React.ComponentType<CardProps>;
  export const CardContent: React.ComponentType<CardProps>;
  export const CardHeader: React.ComponentType<CardProps>;
  export const CardTitle: React.ComponentType<CardProps>;
  export const CardDescription: React.ComponentType<CardProps>;
}

declare module '@/components/ui/dialog' {
  export interface DialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  }
  export const Dialog: React.ComponentType<DialogProps>;
  export const DialogContent: React.ComponentType<DialogProps>;
  export const DialogHeader: React.ComponentType<DialogProps>;
  export const DialogTitle: React.ComponentType<DialogProps>;
  export const DialogDescription: React.ComponentType<DialogProps>;
  export const DialogTrigger: React.ComponentType<{ asChild?: boolean; children?: React.ReactNode }>;
}

declare module '@/components/ui/slider' {
  export interface SliderProps {
    value?: number[];
    onValueChange?: (value: number[]) => void;
    max?: number;
    step?: number;
    className?: string;
  }
  export const Slider: React.ComponentType<SliderProps>;
}

declare module '@/components/ui/progress' {
  export interface ProgressProps {
    value?: number;
    className?: string;
  }
  export const Progress: React.ComponentType<ProgressProps>;
}

declare module '@/components/ui/checkbox' {
  export interface CheckboxProps {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }
  export const Checkbox: React.ComponentType<CheckboxProps>;
}

declare module '@/components/ui/input' {
  export interface InputProps {
    id?: string;
    type?: string;
    accept?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    value?: string;
    placeholder?: string;
  }
  export const Input: React.ComponentType<InputProps>;
}

declare module '@/components/ui/textarea' {
  export interface TextareaProps {
    id?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    className?: string;
  }
  export const Textarea: React.ComponentType<TextareaProps>;
}

declare module '@/components/ui/label' {
  export interface LabelProps {
    htmlFor?: string;
    children?: React.ReactNode;
    className?: string;
  }
  export const Label: React.ComponentType<LabelProps>;
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
  
  export class NextResponse {
    static json(data: any, init?: ResponseInit): NextResponse;
    static redirect(url: string): NextResponse;
  }
  
  interface ResponseInit {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  }
}

export {};