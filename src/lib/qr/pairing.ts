import QRCode from 'qrcode';

// Generate a QR code data URL from text
export async function generatePairingQR(text: string): Promise<string> {
  if (!text || !text.trim()) throw new Error('Nothing to encode');
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
  });
}

// Simple barcode/QR scanner using the Shape Detection API when available
export class SimpleBarcodeScanner {
  private detector: any | null = null;
  private running = false;
  private timer: number | null = null;

  async start(
    video: HTMLVideoElement,
    onResult: (text: string) => void,
    intervalMs: number = 500
  ) {
    const AnyWin: any = window as any;
    if (!('BarcodeDetector' in AnyWin)) {
      throw new Error('BarcodeDetector API not supported');
    }
    // Some browsers require format support query
    const supported = await AnyWin.BarcodeDetector.getSupportedFormats?.();
    if (supported && !supported.includes('qr_code')) {
      throw new Error('QR code format not supported by BarcodeDetector');
    }

    this.detector = new AnyWin.BarcodeDetector({ formats: ['qr_code'] });
    // Request camera stream
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();

    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      try {
        const results = await this.detector.detect(video);
        if (results && results.length) {
          const text = results[0].rawValue || results[0].rawText || '';
          if (text) {
            onResult(text);
            // Keep running; the caller can stop once handled
          }
        }
      } catch {}
      this.timer = (setTimeout(tick, intervalMs) as unknown) as number;
    };
    tick();
  }

  stop(video?: HTMLVideoElement) {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }
}
