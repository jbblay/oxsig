import { describe, expect, it } from "vitest";
import {
  SSM_PAYLOAD,
  buildHandshakeResponse,
  buildOpenDataChannelMessage,
  buildSsmAcknowledge,
  decodeSsmAgentMessage,
  encodeSsmAgentMessage,
  shouldInferStandardStreamReady,
  validateSsmAgentMessage,
} from "./ssm-browser-channel";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

describe("SSM browser channel protocol", () => {
  it("round-trips the AWS binary stream envelope", async () => {
    const messageId = "00112233-4455-6677-8899-aabbccddeeff";
    const encoded = await encodeSsmAgentMessage({
      messageType: "input_stream_data",
      sequenceNumber: 42,
      flags: 1,
      payloadType: SSM_PAYLOAD.OUTPUT,
      payload: encoder.encode("hello\r"),
      messageId,
      createdDate: 1_700_000_000_000,
    });

    const decoded = decodeSsmAgentMessage(encoded);
    expect(decoded.headerLength).toBe(116);
    expect(decoded.messageType).toBe("input_stream_data");
    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.createdDate).toBe(1_700_000_000_000);
    expect(decoded.sequenceNumber).toBe(42);
    expect(decoded.flags).toBe(1);
    expect(decoded.messageId).toBe(messageId);
    expect(decoded.payloadType).toBe(SSM_PAYLOAD.OUTPUT);
    expect(decoder.decode(decoded.payload)).toBe("hello\r");
    expect(await validateSsmAgentMessage(decoded)).toBe(true);
  });

  it("builds the acknowledgement envelope expected by Session Manager", async () => {
    const incoming = decodeSsmAgentMessage(await encodeSsmAgentMessage({
      messageType: "output_stream_data",
      sequenceNumber: 7,
      payloadType: SSM_PAYLOAD.OUTPUT,
      payload: encoder.encode("output"),
      messageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    }));

    const acknowledgement = decodeSsmAgentMessage(await buildSsmAcknowledge(incoming));
    const body = JSON.parse(decoder.decode(acknowledgement.payload));

    expect(acknowledgement.messageType).toBe("acknowledge");
    expect(acknowledgement.sequenceNumber).toBe(0);
    expect(acknowledgement.flags).toBe(3);
    expect(body).toEqual({
      AcknowledgedMessageType: "output_stream_data",
      AcknowledgedMessageId: incoming.messageId,
      AcknowledgedMessageSequenceNumber: 7,
      IsSequentialMessage: true,
    });
    expect(await validateSsmAgentMessage(acknowledgement)).toBe(true);
  });

  it("accepts the shell session handshake and rejects KMS encryption cleanly", () => {
    const { response, kmsRequested } = buildHandshakeResponse({
      AgentVersion: "3.3.0",
      RequestedClientActions: [
        { ActionType: "SessionType", ActionParameters: { SessionType: "Standard_Stream" } },
        { ActionType: "KMSEncryption", ActionParameters: { KMSKeyId: "example" } },
      ],
    });

    expect(kmsRequested).toBe(true);
    expect(response.ProcessedClientActions[0]).toMatchObject({ ActionType: "SessionType", ActionStatus: 1 });
    expect(response.ProcessedClientActions[1]).toMatchObject({ ActionType: "KMSEncryption", ActionStatus: 2 });
    expect(response.Errors).toHaveLength(1);
  });

  it("keeps the browser client below the SSM TCP-multiplexing threshold used by desktop port forwarding", () => {
    const open = JSON.parse(buildOpenDataChannelMessage("token", "client-id"));

    // amazon-ssm-agent selects multiplexed LocalPortForwarding at client version >= 1.1.70.
    // Oxsig intentionally stays at 1.0.0 so the browser desktop receives the documented basic
    // Output byte stream directly instead of the native session-manager-plugin smux framing.
    expect(open.ClientVersion).toBe("1.0.0");
  });

  it("treats standard-stream shell output as readiness when AWS skips the handshake", () => {
    expect(shouldInferStandardStreamReady(SSM_PAYLOAD.OUTPUT, false)).toBe(true);
    expect(shouldInferStandardStreamReady(SSM_PAYLOAD.STDERR, false)).toBe(true);
    expect(shouldInferStandardStreamReady(SSM_PAYLOAD.OUTPUT, true)).toBe(false);
    expect(shouldInferStandardStreamReady(SSM_PAYLOAD.HANDSHAKE_COMPLETE, false)).toBe(false);
  });
});
