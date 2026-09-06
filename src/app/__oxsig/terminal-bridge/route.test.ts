import { describe, expect, it } from 'vitest';
import { terminalFrameRequiresControlRevalidation } from '@/lib/labs/terminal-bridge-frame';

function ssmFrame(messageType: string) {
  const frame = Buffer.alloc(120);
  frame.fill(0x20, 4, 36);
  frame.write(messageType, 4, 'utf8');
  return frame;
}

describe('terminal bridge shared-control frame classification', () => {
  it('does not treat the initial Session Manager open-channel JSON as terminal input', () => {
    expect(terminalFrameRequiresControlRevalidation('{"TokenValue":"opaque"}')).toBe(false);
  });

  it('requires live lease revalidation for every SSM input_stream_data frame', () => {
    expect(terminalFrameRequiresControlRevalidation(ssmFrame('input_stream_data'))).toBe(true);
  });

  it('does not require an additional input lease lookup for SSM acknowledgements', () => {
    expect(terminalFrameRequiresControlRevalidation(ssmFrame('acknowledge'))).toBe(false);
  });

  it('fails closed for unknown complete binary browser frames', () => {
    expect(terminalFrameRequiresControlRevalidation(ssmFrame('unexpected_type'))).toBe(true);
  });

  it('fails closed for malformed binary browser frames', () => {
    expect(terminalFrameRequiresControlRevalidation(Buffer.from([1, 2, 3]))).toBe(true);
  });
});
