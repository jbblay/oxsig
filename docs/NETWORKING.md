# P2P Networking (Manual Signaling)

This app now includes a lightweight peer-to-peer layer using WebRTC Data Channels. No server signup is required. You can connect two browsers (or Tauri desktop + browser) using copy/paste signaling.

## How it works
- Transport: WebRTC DataChannels
- Signaling: Manual copy/paste (offer/answer text)
- ICE: Public STUN only (no TURN)
- Health: Heartbeats (pings) and RTT calculation

## Pairing steps
1) On one device (Initiator):
   - Go to Network page → Manual Signaling → Generate Offer → Copy the offer text
   - Share the offer text with the peer (paste in chat or as a QR)
2) On the other device (Responder):
   - Paste the offer into “Paste remote offer here” → Create Answer → Copy Answer
   - Send the answer text back to the initiator
3) On the initiator:
   - Paste the received answer into “Paste remote answer here” → Accept Answer

Once connected, the peer should appear with RTT in the Active Connections list and the topology view.

## Limitations
- No TURN/relay: Some strict NATs/firewalls may prevent a direct connection. In that case, pairing may fail.
- Manual signaling: You must share the SDP text out-of-band (chat, QR, etc.).
- Security demo: WebRTC DTLS/SRTP secures transport, but application-level authentication is not enforced yet.

## Troubleshooting
- If connection stalls, try generating a fresh Offer/Answer and ensure the full text is copied.
- Try a different network (mobile hotspot vs. enterprise Wi-Fi) to avoid restrictive NATs.
- Browser privacy settings or extensions can block WebRTC; test in a fresh profile.

## Next steps
- Optional QR pairing UX (render offer/answer as QR and scan)
- TURN fallback for NAT-restricted environments
- Multi-hop routing improvements and peer introduction
- Application-level auth and signed peer identities
