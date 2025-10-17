import Debug "mo:base/Debug";

actor Anchor {
  stable var anchors : [(Text, Text)] = []; // (digest, txId)

  public func anchorDigest(digest : Text, chain : Text) : async Text {
    let txId = "stub-" # chain # "-" # digest;
    anchors := anchors # [(digest, txId)];
    Debug.print("Anchored " # digest # " on " # chain # " as " # txId);
    return txId;
  };

  public query func getAnchors() : async [(Text, Text)] {
    return anchors;
  };
}