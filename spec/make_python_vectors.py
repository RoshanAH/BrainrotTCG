#!/usr/bin/env python3
"""Generate spec/vectors-python.json: extra test vectors for spec/PULL_SPEC.md.

They come from the Python implementation (spec/verify_pull.py) and a deterministic test key, so
the TypeScript engine can be checked against them. Every proof is signed with
seed = SHA-256("brainrot-tcg/verify_pull.py/test-key/v1"), so re-running this script gives the
same file byte for byte. Nonces for rare combos were mined once and are hardcoded below.

Usage: python3 -I spec/make_python_vectors.py [--out FILE]   (default: spec/vectors-python.json)
Standard library plus `cryptography`; helpers are loaded from verify_pull.py next to this file.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

# Load verify_pull.py by path: `python3 -I` doesn't put this directory on sys.path.
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
_module_spec = importlib.util.spec_from_file_location("verify_pull", HERE / "verify_pull.py")
vp = importlib.util.module_from_spec(_module_spec)
sys.modules["verify_pull"] = vp
_module_spec.loader.exec_module(vp)

SETS = vp.load_sets(vp.DEFAULT_SETS_DIR)

# ---------------------------------------------------------------------------------------------
# Test key and an RFC 8032 §5.1.6 signer that can also make deliberately bad signatures
# ---------------------------------------------------------------------------------------------

SEED = hashlib.sha256(b"brainrot-tcg/verify_pull.py/test-key/v1").digest()
_expanded = hashlib.sha512(SEED).digest()
SCALAR = (int.from_bytes(_expanded[:32], "little") & ((1 << 254) - 8)) | (1 << 254)
PREFIX = _expanded[32:]
PK = vp.ed_encode(vp.ed_mul(SCALAR, vp.ED_B))
assert PK == Ed25519PrivateKey.from_private_bytes(SEED).public_key().public_bytes_raw()

# An order-8 point (8 * T8 is the identity, 4 * T8 is not).
T8 = vp.ed_decode(bytes.fromhex("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05"))
assert vp.ed_is_identity(vp.ed_mul(8, T8)) and not vp.ed_is_identity(vp.ed_mul(4, T8))

# The test key plus T8: on the curve, canonical, but not of prime order.
PK_MIXED = vp.ed_encode(vp.ed_add(vp.ed_decode(PK), T8))


def h512(*parts: bytes) -> int:
    return int.from_bytes(hashlib.sha512(b"".join(parts)).digest(), "little")


def sign(message: bytes, *, public_key: bytes = PK, r_extra=None) -> bytes:
    """Ed25519 signature by the test key's scalar. `public_key` is what goes into k (for the
    mixed-order key); `r_extra` is a point added to R (to make cofactored-only signatures)."""
    r = h512(PREFIX, message) % vp.ED_L
    r_point = vp.ed_mul(r, vp.ED_B)
    if r_extra is not None:
        r_point = vp.ed_add(r_point, r_extra)
    r_bytes = vp.ed_encode(r_point)
    k = h512(r_bytes, public_key, message) % vp.ED_L
    return r_bytes + ((r + k * SCALAR) % vp.ED_L).to_bytes(32, "little")


def sign_with_r(r_bytes: bytes):
    """Signer with a fixed R = identity (in any encoding) and S = k * a, so [S]B - [k]A is the
    identity: valid exactly when r_bytes is the canonical identity encoding."""
    def signer(message: bytes) -> bytes:
        k = h512(r_bytes, PK, message) % vp.ED_L
        return r_bytes + (k * SCALAR % vp.ED_L).to_bytes(32, "little")
    return signer


def k_of(signature: bytes, public_key: bytes, message: bytes) -> int:
    return h512(signature[:32], public_key, message) % vp.ED_L


assert sign(b"check") == Ed25519PrivateKey.from_private_bytes(SEED).sign(b"check")

# ---------------------------------------------------------------------------------------------
# Proof encoding (§6)
# ---------------------------------------------------------------------------------------------


def varint(value: int) -> bytes:
    out = bytearray()
    while True:
        low, value = value & 0x7F, value >> 7
        out.append(low | (0x80 if value else 0))
        if not value:
            return bytes(out)


def proof_body(*, set_id: bytes = b"right-now", version: int = 1, public_key: bytes = PK, nonce: int = 5,
               name: bytes = b"Evan", nonce_bytes: bytes | None = None) -> bytes:
    return (b"\x01" + bytes([len(set_id)]) + set_id + version.to_bytes(2, "big") + public_key
            + (varint(nonce) if nonce_bytes is None else nonce_bytes) + bytes([len(name)]) + name)


def make_proof(signer=None, **fields) -> str:
    body = proof_body(**fields)
    signature = (signer or sign)(vp.SIGNED_PREFIX + body)
    return base64.urlsafe_b64encode(body + signature).decode().rstrip("=")


def signed_message(**fields) -> bytes:
    return vp.SIGNED_PREFIX + proof_body(**fields)


# ---------------------------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------------------------


def valid(note: str, proof: str, expect_hand: str | None = None) -> dict:
    pull = vp.verify(proof, SETS)  # raises if our own verifier disagrees
    j = pull.as_json()
    if expect_hand is not None:
        assert j["hand"] == expect_hand, (note, j["hand"])
    return {"note": note, "proof": proof, "set": j["set"], "publicKey": j["publicKey"], "nonce": j["nonce"],
            "name": j["name"], "fingerprint": j["fingerprint"], "cards": [c.as_json() for c in pull.cards],
            "points": j["points"], "hand": j["hand"], "multiplier": j["multiplier"], "score": j["score"],
            "hallOfFame": j["hallOfFame"]}


def invalid(note: str, rule: str, proof: str) -> dict:
    try:
        vp.verify(proof, SETS)
    except vp.ProofError as err:
        assert err.rule == rule, (note, err.rule, err.reason)
        return {"note": note, "rule": rule, "proof": proof}
    raise AssertionError(f"{note}: accepted, expected {rule}")


def make_tickets() -> list[dict]:
    cases = [("right-now@1", 5), ("gen-alpha-uprising@1", 12777), ("right-now@1", 2**53 - 1),
             ("zoë-set@65535", 0)]  # non-ASCII set key, largest version: tickets don't need a real set
    return [{"setKey": key, "publicKey": PK.hex(), "nonce": nonce,
             "ticket": vp.compute_ticket(key, PK, nonce).hex()} for key, nonce in cases]


def make_rng() -> list[dict]:
    seeds = [bytes(32), b"\xff" * 32, vp.pack_seed(vp.compute_ticket("gen-alpha-uprising@1", PK, 12777))]
    out = []
    for seed in seeds:
        rng = vp.Sfc32(seed)
        out.append({"seed": seed.hex(), "outputs": [rng.next() for _ in range(8)]})
    return out


def make_packs() -> list[dict]:
    out = []
    for key in ("gen-alpha-uprising@1", "italian-brainrot-deep-cuts@1", "vine-and-dank@1", "web-ancients@1"):
        seed = hashlib.sha256(b"brainrot-tcg/make_python_vectors/pack/" + key.encode()).digest()
        out.append({"set": key, "seed": seed.hex(), "cards": [c.as_json() for c in vp.generate_pack(SETS[key], seed)]})
    return out


# Nonces mined once (gen-alpha-uprising@1, test key); see the module docstring.
MINED = [
    (3, "No Matches", b"No Match"),
    (83, "Full House", b"Full House"),
    (324, "3 of a Kind", b"Holo Hunter"),  # Hall of Fame by score alone (21825)
    (12777, "5 of a Kind", b"Five Kind"),
]


def make_valid() -> list[dict]:
    out = [
        valid("name of 24 code points, all astral (48 UTF-16 code units)", make_proof(name=("🧠" * 24).encode())),
        valid("name of exactly 24 ASCII code points", make_proof(name=b"x" * 24)),
        valid("nonce 2^53-1 (largest 8-byte varint)", make_proof(nonce=2**53 - 1, name=b"Max Nonce")),
        valid("name not in NFC (Zoe + U+0308)", make_proof(name="Zoë".encode())),
        valid("name with unassigned U+0378", make_proof(name="E͸".encode())),
        valid("name with U+1FAE9 (assigned in Unicode 16.0)", make_proof(name="Evan \U0001FAE9".encode())),
        valid("name with private-use U+E000", make_proof(name="E".encode())),
        valid("name with U+0600 (format character, not on the §7.2 lists)", make_proof(name="E؀".encode())),
        valid("name with U+3164 Hangul filler (not on the §7.2 lists)", make_proof(name="Evanㅤ".encode())),
        valid("name with an emoji variation selector (U+2764 U+FE0F)", make_proof(name="Evan ❤️".encode())),
        valid("small-order R (canonical identity) with S = k*a; R is not otherwise checked",
              make_proof(sign_with_r(bytes.fromhex("01" + "00" * 31)))),
    ]
    for nonce, hand, name in MINED:
        out.append(valid(f"mined {hand}" + (" (Hall of Fame by score alone)" if nonce == 324 else ""),
                         make_proof(set_id=b"gen-alpha-uprising", nonce=nonce, name=name), expect_hand=hand))
    return out


def first_nonce(predicate) -> int:
    return next(n for n in range(1000) if predicate(n))


def make_invalid() -> list[dict]:
    # Smallest y >= 2 with no point on the curve.
    off_curve_y = 2
    while True:
        try:
            vp.ed_decode(off_curve_y.to_bytes(32, "little"))
            off_curve_y += 1
        except ValueError:
            break
    off_curve = off_curve_y.to_bytes(32, "little")
    zero_sig = lambda message: b"\x00" * 64  # noqa: E731

    # Order-8 key with R = identity, S = 0: passes the cofactorless equation when 8 divides k.
    t8_key = vp.ed_encode(T8)
    identity = bytes.fromhex("01" + "00" * 31)
    forged_nonce = first_nonce(lambda n: h512(identity, t8_key, signed_message(public_key=t8_key, nonce=n)) % vp.ED_L % 8 == 0)
    forged = lambda message: identity + bytes(32)  # noqa: E731

    # Mixed-order key with honest signatures: k = 0 (mod 8) would pass the signature check.
    def mixed_k_mod8(n: int) -> int:
        message = signed_message(public_key=PK_MIXED, nonce=n, name=b"Mixed")
        return k_of(sign(message, public_key=PK_MIXED), PK_MIXED, message) % 8
    mixed_pass = first_nonce(lambda n: mixed_k_mod8(n) == 0)
    mixed_fail = first_nonce(lambda n: mixed_k_mod8(n) != 0)
    mixed = lambda message: sign(message, public_key=PK_MIXED)  # noqa: E731

    return [
        # decode
        invalid("8-byte varint above 2^53-1 (2^53)", "decode", make_proof(nonce_bytes=bytes.fromhex("8080808080808010"))),
        invalid("overlong UTF-8 in name (C0 80)", "decode", make_proof(name=b"Ev\xc0\x80an")),
        invalid("overlong 3-byte UTF-8 in name (E0 80 80)", "decode", make_proof(name=b"E\xe0\x80\x80")),
        invalid("UTF-8-encoded surrogate in name (ED A0 80)", "decode", make_proof(name=b"E\xed\xa0\x80")),
        invalid("UTF-8 above U+10FFFF in name (F4 90 80 80)", "decode", make_proof(name=b"E\xf4\x90\x80\x80")),
        invalid("stray continuation byte in name (80)", "decode", make_proof(name=b"Ev\x80an")),
        invalid("invalid UTF-8 in set id", "decode", make_proof(set_id=b"right-n\xc3w")),
        invalid("set id of 65 bytes", "decode", make_proof(set_id=b"x" * 65)),
        # name
        invalid("name of 25 code points, all astral (50 UTF-16 code units)", "name", make_proof(name=("🧠" * 25).encode())),
        invalid("name starts with a UTF-8 BOM (must be kept, so U+FEFF is seen)", "name", make_proof(name=b"\xef\xbb\xbfEvan")),
        invalid("name with NUL (U+0000)", "name", make_proof(name=b"Ev\x00an")),
        invalid("name with DEL (U+007F)", "name", make_proof(name=b"Ev\x7fan")),
        invalid("name with C1 control NEL (U+0085)", "name", make_proof(name="Ev\u0085an".encode())),
        invalid("name with soft hyphen (U+00AD)", "name", make_proof(name="Ev­an".encode())),
        invalid("name with Arabic letter mark (U+061C)", "name", make_proof(name="Ev؜an".encode())),
        invalid("name with Mongolian vowel separator (U+180E)", "name", make_proof(name="Ev᠎an".encode())),
        invalid("name with left-to-right isolate (U+2066)", "name", make_proof(name="Ev⁦an".encode())),
        invalid("name with interlinear annotation anchor (U+FFF9)", "name", make_proof(name="Ev￹an".encode())),
        invalid("name with language tag (U+E0001)", "name", make_proof(name="Ev\U000E0001an".encode())),
        invalid("name with a ZWJ emoji sequence (family, U+200D)", "name", make_proof(name="\U0001F468‍\U0001F469‍\U0001F467".encode())),
        invalid("name with a subdivision flag (tag characters U+E0067...)", "name",
                make_proof(name="\U0001F3F4\U000E0067\U000E0062\U000E0073\U000E0063\U000E0074\U000E007F".encode())),
        invalid("name with ideographic space (U+3000)", "name", make_proof(name="Ev　an".encode())),
        invalid("name with line separator (U+2028)", "name", make_proof(name="Ev an".encode())),
        invalid("name with a leading space", "name", make_proof(name=b" Evan")),
        # publicKey
        invalid("public key with x = 0 and the sign bit set", "publicKey",
                make_proof(zero_sig, public_key=bytes.fromhex("01" + "00" * 30 + "80"))),
        invalid("public key that is not on the curve", "publicKey", make_proof(zero_sig, public_key=off_curve)),
        invalid("order-8 public key; the forged signature passes the cofactorless check", "publicKey",
                make_proof(forged, public_key=t8_key, nonce=forged_nonce)),
        invalid("mixed-order public key (A + order-8 point); its signature fails too", "publicKey",
                make_proof(mixed, public_key=PK_MIXED, nonce=mixed_fail, name=b"Mixed")),
        invalid("mixed-order public key (A + order-8 point); its signature alone would pass", "publicKey",
                make_proof(mixed, public_key=PK_MIXED, nonce=mixed_pass, name=b"Mixed")),
        # signature
        invalid("R plus an order-8 point: passes only the cofactored equation", "signature",
                make_proof(lambda message: sign(message, r_extra=T8))),
        invalid("R = identity encoded non-canonically (y = p+1), S = k*a", "signature",
                make_proof(sign_with_r(bytes.fromhex("ee" + "ff" * 30 + "7f")))),
        # set
        invalid("set id starts with a UTF-8 BOM (must be kept, so the set is unknown)", "set",
                make_proof(set_id=b"\xef\xbb\xbfright-now")),
    ]


# ---------------------------------------------------------------------------------------------
# §11 Profiles
# ---------------------------------------------------------------------------------------------


def profile_body(*, runs=((0, 2),), table=(b"right-now",), versions=None, public_key: bytes = PK,
                 name: bytes = b"Evan", version: int = 1, run_count_bytes: bytes | None = None,
                 xp: int = 0, highlights=None) -> bytes:
    """Byte by byte, no normalisation: `runs` are (table index, count) pairs. Default claims are
    XP 0 and highlights 0 ... h-1, which decode fine (claims are only checked against the packs)."""
    versions = versions or [1] * len(table)
    out = bytes([version]) + public_key + bytes([len(name)]) + name + bytes([len(table)])
    for set_id, set_version in zip(table, versions):
        out += bytes([len(set_id)]) + set_id + set_version.to_bytes(2, "big")
    out += varint(len(runs)) if run_count_bytes is None else run_count_bytes
    for index, count in runs:
        out += varint(index) + varint(count)
    if highlights is None:
        highlights = list(range(min(5, sum(count for _, count in runs))))
    out += varint(xp) + bytes([len(highlights)]) + b"".join(varint(n) for n in highlights)
    return out


def with_true_claims(**fields) -> dict:
    """The same profile with the claims its packs actually earn (found with our own verifier)."""
    profile = vp.parse_profile(make_profile(**fields))
    verified = vp.derive_profile(profile, SETS)
    return dict(fields, xp=verified.xp, highlights=verified.best)


def make_profile(signer=None, **fields) -> str:
    body = profile_body(**fields)
    return base64.urlsafe_b64encode(body + (signer or sign)(vp.PROFILE_SIGNED_PREFIX + body)).decode().rstrip("=")


def valid_profile(note: str, profile: str) -> dict:
    j = vp.verify_profile(profile, SETS).as_json()  # raises if our own verifier disagrees
    return {"note": note, "profile": profile, **{k: j[k] for k in vp.PROFILE_FIELDS}}


def invalid_profile(note: str, rule: str, profile: str) -> dict:
    try:
        vp.verify_profile(profile, SETS) if rule == "claims" else vp.check_profile(profile, SETS)
    except vp.ProofError as err:
        assert err.rule == rule, (note, err.rule, err.reason)
        return {"note": note, "rule": rule, "profile": profile}
    raise AssertionError(f"{note}: accepted, expected {rule}")


def make_profiles() -> list[dict]:
    return [
        valid_profile("three runs, name not in NFC (valid)",
                      make_profile(**with_true_claims(table=(b"vine-and-dank", b"gen-alpha-uprising"),
                                                      runs=((0, 1), (1, 2), (0, 4)), name="Zoe\u0308".encode()))),
        valid_profile("empty name, one ticket", make_profile(**with_true_claims(runs=((0, 1),), name=b""))),
    ]


def make_invalid_profiles() -> list[dict]:
    good = profile_body()
    good_sig = sign(vp.PROFILE_SIGNED_PREFIX + good)
    b64 = lambda raw: base64.urlsafe_b64encode(raw).decode().rstrip("=")  # noqa: E731
    s_plus_l = good_sig[:32] + (int.from_bytes(good_sig[32:], "little") + vp.ED_L).to_bytes(32, "little")
    mixed = lambda message: sign(message, public_key=PK_MIXED)  # noqa: E731
    return [
        invalid_profile("non-minimal varint for the run count (81 00)", "decode", make_profile(run_count_bytes=b"\x81\x00")),
        invalid_profile("base64url padding", "decode", b64(good + good_sig) + "="),
        invalid_profile("set id of 0 bytes", "decode", make_profile(table=(b"",))),
        invalid_profile("set id of 65 bytes", "decode", make_profile(table=(b"x" * 65,))),
        invalid_profile("65 sets in the table", "decode",
                        make_profile(table=tuple(f"s{i}".encode() for i in range(65)), runs=tuple((i, 1) for i in range(65)))),
        invalid_profile("same id, two versions, used out of order", "decode",
                        make_profile(table=(b"right-now", b"right-now"), versions=[1, 2], runs=((1, 1), (0, 1)))),
        invalid_profile("pull-proof bytes signed as a profile", "decode", make_proof(lambda m: sign(vp.PROFILE_SIGNED_PREFIX + m[len(vp.SIGNED_PREFIX):]))),
        invalid_profile("name of 25 code points", "name", make_profile(name=b"y" * 25)),
        invalid_profile("mixed-order public key (A + order-8 point)", "publicKey", make_profile(mixed, public_key=PK_MIXED)),
        invalid_profile("signature with S + L (malleated)", "signature", b64(good + s_plus_l)),
        invalid_profile("R plus an order-8 point: passes only the cofactored equation", "signature",
                        make_profile(lambda message: sign(message, r_extra=T8))),
        invalid_profile("unknown set id", "set", make_profile(table=(b"no-such-set",))),
        invalid_profile("claims 1 XP less than the packs earn", "claims",
                        make_profile(**dict(with_true_claims(runs=((0, 6),)), xp=with_true_claims(runs=((0, 6),))["xp"] - 1))),
        invalid_profile("names a non-best pack as a highlight", "claims",
                        make_profile(**dict(true6 := with_true_claims(runs=((0, 6),)),
                                            highlights=[n for n in range(6) if n not in true6["highlights"]] + true6["highlights"][:4]))),
    ]


def make_same_pull() -> list[dict]:
    proofs = [make_proof(nonce=9, name="Zoë".encode()), make_proof(nonce=9, name="Zoë".encode()),
              make_proof(nonce=9, name=b"")]
    pulls = [vp.verify(p, SETS) for p in proofs]
    assert len({p.proof.pull_id for p in pulls}) == 1 and all(p.cards == pulls[0].cards for p in pulls)
    return [{"note": "same set, key and nonce; names NFC, not NFC and empty", "proofs": proofs,
             "pullId": pulls[0].proof.pull_id}]


def build() -> dict:
    return {
        "spec": "spec/PULL_SPEC.md",
        "version": 1,
        "generatedBy": "spec/make_python_vectors.py",
        "testKey": {"seed": SEED.hex(), "publicKey": PK.hex(), "fingerprint": vp.fingerprint(PK),
                    "derivation": "seed = SHA-256(UTF-8('brainrot-tcg/verify_pull.py/test-key/v1'))"},
        "tickets": make_tickets(),
        "rng": make_rng(),
        "packs": make_packs(),
        "valid": make_valid(),
        "invalid": make_invalid(),
        "samePull": make_same_pull(),
        "profiles": make_profiles(),
        "invalidProfiles": make_invalid_profiles(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate spec/vectors-python.json.")
    parser.add_argument("--out", type=Path, default=HERE / "vectors-python.json")
    args = parser.parse_args()
    doc = build()
    args.out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = ", ".join(f"{len(doc[s])} {s}" for s in ("tickets", "rng", "packs", "valid", "invalid", "samePull", "profiles", "invalidProfiles"))
    print(f"wrote {args.out}: {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
