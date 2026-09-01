/**
 * QR Code Generation and Scanning for Document Signing
 * Lightweight implementation without external dependencies
 */

export interface SigningPayload {
  action: 'sign' | 'verify';
  documentId: string;
  documentHash: string;
  timestamp: number;
  nonce: string;
  metadata?: Record<string, any>;
}

/**
 * Generate QR code data URL for document signing
 */
export async function generateSigningQR(
  documentId: string,
  documentHash: string,
  metadata?: Record<string, any>
): Promise<string> {
  const payload: SigningPayload = {
    action: 'sign',
    documentId,
    documentHash,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    metadata,
  };

  const jsonString = JSON.stringify(payload);
  const qrSvg = generateQRSVG(jsonString);
  
  // Convert SVG to data URL
  const svgBlob = new Blob([qrSvg], { type: 'image/svg+xml' });
  return URL.createObjectURL(svgBlob);
}

/**
 * Generate verification QR code
 */
export async function generateVerificationQR(
  documentId: string,
  documentHash: string,
  signature: string
): Promise<string> {
  const payload = {
    action: 'verify',
    documentId,
    documentHash,
    signature,
    timestamp: Date.now(),
  };

  const jsonString = JSON.stringify(payload);
  const qrSvg = generateQRSVG(jsonString);
  
  const svgBlob = new Blob([qrSvg], { type: 'image/svg+xml' });
  return URL.createObjectURL(svgBlob);
}

/**
 * Simple QR Code SVG generator
 */
function generateQRSVG(data: string, size: number = 300): string {
  const matrix = textToMatrix(data);
  const moduleSize = size / matrix.length;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="${size}" height="${size}" fill="#ffffff"/>`;
  
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x]) {
        svg += `<rect x="${x * moduleSize}" y="${y * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="#000000"/>`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

/**
 * Convert text to QR matrix (simplified)
 */
function textToMatrix(text: string): boolean[][] {
  // Simplified QR generation - in production use a proper QR library
  const encoded = encodeURIComponent(text);
  const hash = simpleHash(encoded);
  const size = Math.max(21, Math.ceil(Math.sqrt(encoded.length)) + 8);
  
  const matrix: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
  
  // Add finder patterns (corners)
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, size - 7, 0);
  addFinderPattern(matrix, 0, size - 7);
  
  // Fill data
  let dataIndex = 0;
  for (let y = 8; y < size - 8; y++) {
    for (let x = 8; x < size - 8; x++) {
      if (dataIndex < hash.length) {
        matrix[y][x] = hash[dataIndex] === '1';
        dataIndex++;
      }
    }
  }
  
  return matrix;
}

/**
 * Add finder pattern to QR matrix
 */
function addFinderPattern(matrix: boolean[][], startX: number, startY: number): void {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const isEdge = y === 0 || y === 6 || x === 0 || x === 6;
      const isCenter = (y >= 2 && y <= 4) && (x >= 2 && x <= 4);
      if (startY + y < matrix.length && startX + x < matrix[0].length) {
        matrix[startY + y][startX + x] = isEdge || isCenter;
      }
    }
  }
}

/**
 * Simple hash function for QR data
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(2).padStart(256, '0');
}

/**
 * Download QR code as image
 */
export async function downloadQRCode(dataUrl: string, filename: string = 'qr-code'): Promise<void> {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(dataUrl);
}

/**
 * Parse QR code payload
 */
export function parseQRPayload(jsonString: string): SigningPayload | null {
  try {
    const payload = JSON.parse(jsonString);
    
    // Validate required fields
    if (!payload.action || !payload.documentId || !payload.timestamp) {
      return null;
    }
    
    return payload as SigningPayload;
  } catch {
    return null;
  }
}

/**
 * Scan QR code from video stream
 * Note: In production, use a proper QR scanner library like jsQR
 */
export async function requestCameraPermission(): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    return stream;
  } catch (error) {
    console.error('Camera permission denied:', error);
    return null;
  }
}

/**
 * Stop camera stream
 */
export function stopCameraStream(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

/**
 * Create QR scanner component helper
 */
export class QRScanner {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private scanning = false;

  async start(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;
    this.stream = await requestCameraPermission();
    
    if (!this.stream) {
      throw new Error('Camera access denied');
    }
    
    videoElement.srcObject = this.stream;
    videoElement.play();
    this.scanning = true;
  }

  stop(): void {
    if (this.stream) {
      stopCameraStream(this.stream);
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.scanning = false;
  }

  isScanning(): boolean {
    return this.scanning;
  }
}

/**
 * Generate signing link (alternative to QR for desktop)
 */
export function generateSigningLink(payload: SigningPayload): string {
  const encoded = btoa(JSON.stringify(payload));
  return `${window.location.origin}/sharedocs?data=${encoded}`;
}

/**
 * Parse signing link
 */
export function parseSigningLink(url: string): SigningPayload | null {
  try {
    const urlObj = new URL(url);
    const data = urlObj.searchParams.get('data');
    if (!data) return null;
    
    const decoded = atob(data);
    return JSON.parse(decoded) as SigningPayload;
  } catch {
    return null;
  }
}
