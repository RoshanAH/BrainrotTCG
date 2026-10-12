#!/usr/bin/env python3
"""Independent verifier for Brainrot TCG pull proofs.

Written only from spec/PULL_SPEC.md (v1); section numbers in the comments ("§5.3") refer to it.
Standard library plus the `cryptography` package (Argon2id and Ed25519). Single file, no local
imports, so it runs under `python3 -I`.

Usage:
  python3 spec/verify_pull.py <proof or share link>            human summary; exit 0 valid, 1 invalid
                                                               (2 bad set data, 3 internal error)
  python3 spec/verify_pull.py --json <proof or share link>     same, as JSON
  python3 spec/verify_pull.py --vectors FILE [FILE ...]        check test vectors files
  --sets DIR  use DIR instead of src/content/sets for set lookup
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
except ImportError as exc:  # pragma: no cover - environment problem, not a proof problem
    sys.exit(f"verify_pull.py needs the 'cryptography' package with Argon2id support (>= 44): {exc}")

DEFAULT_SETS_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "sets"


class ProofError(Exception):
    """A proof failed one of the §7 checks. `rule` is the vectors' name for that check:
    decode (§7.1), name (§7.2), publicKey (§7.3), signature (§7.4) or set (§7.5)."""

    def __init__(self, rule: str, reason: str):
        super().__init__(reason)
        self.rule = rule
        self.reason = reason


class SetDataError(Exception):
    """A set JSON file breaks §3. This is a problem with our data, not with the proof."""


# ---------------------------------------------------------------------------------------------
# §2 Primitives
# ---------------------------------------------------------------------------------------------

# §2 base64url: RFC 4648 §5 alphabet, no padding, canonical.
B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
B64URL_VALUE = {ch: i for i, ch in enumerate(B64URL_ALPHABET)}


def b64url_decode(text: str) -> bytes:
    """Strict base64url decoding (§2). Rejects '=', any non-alphabet character, a length of
    1 (mod 4), and non-zero unused low bits in the last character."""
    if len(text) % 4 == 1:
        raise ProofError("decode", "base64url: a length of 1 (mod 4) is impossible")
    out = bytearray()
    acc = 0  # bits read but not yet emitted (always fewer than 8 after each step)
    nbits = 0
    for pos, ch in enumerate(text):
        value = B64URL_VALUE.get(ch)
        if value is None:
            if ch == "=":
                raise ProofError("decode", "base64url: padding ('=') is not allowed")
            raise ProofError("decode", f"base64url: {ch!r} at position {pos} is not in the alphabet")
        acc = (acc << 6) | value
        nbits += 6
        if nbits >= 8:
            nbits -= 8
            out.append(acc >> nbits)
            acc &= (1 << nbits) - 1
    # What is left (0, 2 or 4 bits) are the unused low bits of the last character.
    if acc != 0:
        raise ProofError("decode", "base64url: non-canonical (unused low bits of the last character are not zero)")
    return bytes(out)


# §2 varint: unsigned LEB128, minimal, value 0 ... 2^53-1, at most 8 bytes.
VARINT_MAX = 2**53 - 1
VARINT_MAX_BYTES = 8


def read_varint(buf: bytes, pos: int) -> tuple[int, int]:
    """Read a varint at `pos`; return (value, position after it)."""
    value = 0
    for index in range(VARINT_MAX_BYTES):
        if pos >= len(buf):
            raise ProofError("decode", "varint: truncated")
        byte = buf[pos]
        pos += 1
        value |= (byte & 0x7F) << (7 * index)
        if not byte & 0x80:  # last byte
            if index > 0 and byte == 0x00:
                raise ProofError("decode", "varint: not minimal (last byte of a multi-byte varint is 0x00)")
            if value > VARINT_MAX:
                raise ProofError("decode", f"varint: {value} is above 2^53-1")
            return value, pos
    raise ProofError("decode", f"varint: longer than {VARINT_MAX_BYTES} bytes")


def utf8_decode(data: bytes, what: str) -> str:
    """Strict UTF-8 decoding (§2): rejects overlong forms, surrogates, code points above
    U+10FFFF, stray continuation bytes and truncated sequences. A leading U+FEFF (BOM) is kept
    as a character, not stripped."""
    cps: list[int] = []
    i, n = 0, len(data)
    while i < n:
        lead = data[i]
        if lead < 0x80:
            cps.append(lead)
            i += 1
            continue
        if 0xC0 <= lead <= 0xDF:
            length, cp, minimum = 2, lead & 0x1F, 0x80
        elif 0xE0 <= lead <= 0xEF:
            length, cp, minimum = 3, lead & 0x0F, 0x800
        elif 0xF0 <= lead <= 0xF7:
            length, cp, minimum = 4, lead & 0x07, 0x10000
        else:
            raise ProofError("decode", f"invalid UTF-8 in {what}: byte 0x{lead:02x} at offset {i} cannot start a character")
        for k in range(1, length):
            if i + k >= n or data[i + k] & 0xC0 != 0x80:
                raise ProofError("decode", f"invalid UTF-8 in {what}: truncated sequence or missing continuation byte at offset {i}")
            cp = (cp << 6) | (data[i + k] & 0x3F)
        if cp < minimum:
            raise ProofError("decode", f"invalid UTF-8 in {what}: overlong encoding at offset {i}")
        if 0xD800 <= cp <= 0xDFFF:
            raise ProofError("decode", f"invalid UTF-8 in {what}: encoded surrogate U+{cp:04X} at offset {i}")
        if cp > 0x10FFFF:
            raise ProofError("decode", f"invalid UTF-8 in {what}: code point above U+10FFFF at offset {i}")
        cps.append(cp)
        i += length
    return "".join(map(chr, cps))


# ---------------------------------------------------------------------------------------------
# §3 Sets
# ---------------------------------------------------------------------------------------------

# Rarest first; this order is normative (§3) and is the order of the odds walk (§5.3.1).
RARITIES = ("BRAINROT", "LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON")


@dataclass(frozen=True)
class SetDef:
    id: str
    version: int
    name: str
    pack_size: int
    odds: dict[str, int]
    holo_odds: int
    pools: dict[str, list[str]]  # rarity -> card ids of that rarity, in set order
    archived: bool
    path: Path

    @property
    def key(self) -> str:
        return f"{self.id}@{self.version}"


def _is_int(value: object) -> bool:
    return type(value) is int  # bool is a subclass of int; don't accept it


def parse_set(doc: object, path: Path) -> SetDef:
    """Read and sanity-check the §3 fields of one set document."""

    def bad(msg: str) -> SetDataError:
        return SetDataError(f"{path}: {msg}")

    if not isinstance(doc, dict):
        raise bad("not a JSON object")
    set_id, version = doc.get("id"), doc.get("version")
    if not isinstance(set_id, str) or not 1 <= len(set_id.encode("utf-8")) <= 64:
        raise bad("id must be a string of 1 to 64 UTF-8 bytes (§6)")
    if not _is_int(version) or not 0 <= version <= 0xFFFF:
        raise bad("version must be an integer that fits a u16 (§6)")
    pack_size = doc.get("packSize")
    if not _is_int(pack_size) or not 1 <= pack_size <= 15:
        raise bad("packSize must be an integer 1 ... 15")
    odds = doc.get("odds")
    if not isinstance(odds, dict) or not set(odds) <= set(RARITIES):
        raise bad(f"odds must be an object keyed by {', '.join(RARITIES)}")
    if not all(_is_int(w) and w >= 0 for w in odds.values()) or sum(odds.values()) != 10000:
        raise bad("odds must be non-negative integers summing to 10000")
    holo_odds = doc.get("holoOdds")
    if not _is_int(holo_odds) or not 0 <= holo_odds <= 10000:
        raise bad("holoOdds must be an integer 0 ... 10000")
    cards = doc.get("cards")
    if not isinstance(cards, list):
        raise bad("cards must be a list")
    pools: dict[str, list[str]] = {r: [] for r in RARITIES}
    for card in cards:
        if not isinstance(card, dict) or not isinstance(card.get("id"), str) or card.get("rarity") not in RARITIES:
            raise bad(f"bad card entry {card!r}")
        pools[card["rarity"]].append(card["id"])
    for rarity in RARITIES:
        if odds.get(rarity, 0) > 0 and not pools[rarity]:
            raise bad(f"rarity {rarity} has weight {odds[rarity]} but no cards")
    return SetDef(
        id=set_id,
        version=version,
        name=str(doc.get("name", set_id)),
        pack_size=pack_size,
        odds={r: odds.get(r, 0) for r in RARITIES},
        holo_odds=holo_odds,
        pools=pools,
        archived="archivedAt" in doc,
        path=path,
    )


def load_sets(sets_dir: Path) -> dict[str, SetDef]:
    """Index every <id>/set.json and <id>/set.v<N>.json under `sets_dir` by `id@version`."""
    if not sets_dir.is_dir():
        raise SetDataError(f"sets directory not found: {sets_dir}")
    found: dict[str, SetDef] = {}
    paths = sorted(sets_dir.glob("*/set.json")) + sorted(sets_dir.glob("*/set.v*.json"))
    for path in paths:
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise SetDataError(f"{path}: cannot read JSON: {exc}") from exc
        set_def = parse_set(doc, path)
        if path.name != "set.json" and path.name != f"set.v{set_def.version}.json":
            raise SetDataError(f"{path}: file name does not match its version {set_def.version}")
        if set_def.key in found:
            raise SetDataError(f"{set_def.key} is defined twice: {found[set_def.key].path} and {path}")
        found[set_def.key] = set_def
    if not found:
        raise SetDataError(f"no set.json files under {sets_dir}")
    return found


# ---------------------------------------------------------------------------------------------
# §4 Ticket (proof of work)
# ---------------------------------------------------------------------------------------------

TICKET_SALT = b"brainrot-tcg/ticket-salt/v1"


def compute_ticket(set_key: str, public_key: bytes, nonce: int) -> bytes:
    # decimal(nonce): Python's str() of a non-negative int has no sign, separators or leading zeros.
    password = f"brainrot-tcg/ticket/v1|{set_key}|{public_key.hex()}|{nonce}".encode("utf-8")
    # memory 32768 KiB, iterations 2, parallelism 1, 32-byte tag; cryptography only implements
    # version 0x13 and we pass no secret and no associated data.
    kdf = Argon2id(salt=TICKET_SALT, length=32, iterations=2, lanes=1, memory_cost=32768)
    return kdf.derive(password)


# ---------------------------------------------------------------------------------------------
# §5 Pack generation
# ---------------------------------------------------------------------------------------------

PACK_SEED_PREFIX = b"brainrot-tcg/pack/v1"
U32 = 0xFFFFFFFF


def pack_seed(ticket: bytes) -> bytes:
    """§5.1: seed = SHA-256("brainrot-tcg/pack/v1" || ticket)."""
    return hashlib.sha256(PACK_SEED_PREFIX + ticket).digest()


class Sfc32:
    """§5.2 sfc32. Seeded from seed bytes 0-15 as four little-endian u32s; the first 15 outputs
    are discarded on construction."""

    WARMUP = 15

    def __init__(self, seed: bytes, warmup: int = WARMUP):
        self.a, self.b, self.c, self.d = struct.unpack_from("<4I", seed, 0)
        for _ in range(warmup):
            self.next()

    def next(self) -> int:
        a, b, c, d = self.a, self.b, self.c, self.d
        t = (a + b + d) & U32
        d = (d + 1) & U32
        a = b ^ (b >> 9)
        b = (c + (c << 3)) & U32
        c = ((c << 21) | (c >> 11)) & U32  # rotate left by 21
        c = (c + t) & U32
        self.a, self.b, self.c, self.d = a, b, c, d
        return t

    def int_below(self, n: int) -> int:
        """The spec's int(n) = floor(next() * n / 2^32), in exact integer arithmetic."""
        return (self.next() * n) >> 32


@dataclass(frozen=True)
class Card:
    card_id: str
    rarity: str
    is_holo: bool

    def as_json(self) -> dict:
        return {"cardId": self.card_id, "rarity": self.rarity, "isHolo": self.is_holo}


def generate_pack(set_def: SetDef, seed: bytes) -> list[Card]:
    """§5.3: for each slot, three draws in this order: rarity roll, card index, holo roll."""
    rng = Sfc32(seed)
    cards = []
    for _slot in range(set_def.pack_size):
        # §5.3.1: walk rarest first; first rarity whose running total exceeds the roll.
        roll = rng.int_below(10000)
        running = 0
        for rarity in RARITIES:
            running += set_def.odds[rarity]
            if running > roll:
                break
        else:  # unreachable while odds sum to 10000 (checked in parse_set)
            raise SetDataError(f"{set_def.key}: odds do not cover roll {roll}")
        # §5.3.2: pick from that rarity's cards, in set order.
        pool = set_def.pools[rarity]
        card_id = pool[rng.int_below(len(pool))]
        # §5.3.3
        is_holo = rng.int_below(10000) < set_def.holo_odds
        cards.append(Card(card_id, rarity, is_holo))
    return cards


# ---------------------------------------------------------------------------------------------
# §6 Proof format
# ---------------------------------------------------------------------------------------------

PROOF_VERSION = 0x01
SIGNED_PREFIX = b"brainrot-tcg/proof/v1"
SHARE_LINK_MARKER = "#/pull/"


@dataclass(frozen=True)
class Proof:
    set_id: str
    set_version: int
    public_key: bytes
    nonce: int
    name: str
    signature: bytes
    signed_message: bytes

    @property
    def set_key(self) -> str:
        return f"{self.set_id}@{self.set_version}"

    @property
    def pull_id(self) -> str:
        # §7 "Same pull": `${setKey}/${hex(publicKey)}/${nonce}`.
        return f"{self.set_key}/{self.public_key.hex()}/{self.nonce}"


def proof_text_from_input(text: str) -> str:
    """Accept a bare proof or a share link `https://.../#/pull/<proof>` (§6). Only whitespace
    around the whole argument is trimmed; the proof itself is decoded strictly."""
    text = text.strip()
    if "#" in text:
        fragment = "#" + text.split("#", 1)[1]
        if not fragment.startswith(SHARE_LINK_MARKER):
            raise ProofError("decode", "link does not have a #/pull/<proof> fragment")
        return fragment[len(SHARE_LINK_MARKER):]
    return text


def parse_proof(text: str) -> Proof:
    """§6 layout with the §7.1 strict-decoding rules."""
    data = b64url_decode(text)
    pos = 0

    def take(count: int, field: str) -> bytes:
        nonlocal pos
        if pos + count > len(data):
            raise ProofError("decode", f"truncated: {field} needs {count} byte(s) at offset {pos}, {len(data) - pos} left")
        chunk = data[pos:pos + count]
        pos += count
        return chunk

    version = take(1, "proof version")[0]
    if version != PROOF_VERSION:
        raise ProofError("decode", f"unsupported proof version {version} (expected {PROOF_VERSION})")

    set_id_len = take(1, "set id length")[0]
    if not 1 <= set_id_len <= 64:
        raise ProofError("decode", f"set id length {set_id_len} is not in 1 ... 64")
    set_id = utf8_decode(take(set_id_len, "set id"), "set id")

    set_version = int.from_bytes(take(2, "set version"), "big")
    public_key = take(32, "public key")
    nonce, pos = read_varint(data, pos)

    name_len = take(1, "name length")[0]  # 0 ... 255: every byte value is in range
    name = utf8_decode(take(name_len, "name"), "name")

    body_end = pos
    signature = take(64, "signature")
    if pos != len(data):
        raise ProofError("decode", f"{len(data) - pos} unexpected byte(s) after the signature")

    return Proof(
        set_id=set_id,
        set_version=set_version,
        public_key=public_key,
        nonce=nonce,
        name=name,
        signature=signature,
        signed_message=SIGNED_PREFIX + data[:body_end],
    )


# ---------------------------------------------------------------------------------------------
# §7 Verification
# ---------------------------------------------------------------------------------------------

# §7.2 Name rules. Fixed code point lists only (no Unicode tables), as (first, last, what).
NAME_MAX_CODE_POINTS = 24
NAME_FORBIDDEN = (
    # control characters
    (0x0000, 0x001F, "control character"),
    (0x007F, 0x009F, "control character"),
    # invisible or bidirectional format characters
    (0x00AD, 0x00AD, "invisible or bidirectional format character"),
    (0x061C, 0x061C, "invisible or bidirectional format character"),
    (0x180E, 0x180E, "invisible or bidirectional format character"),
    (0x200B, 0x200F, "invisible or bidirectional format character"),
    (0x202A, 0x202E, "invisible or bidirectional format character"),
    (0x2060, 0x2064, "invisible or bidirectional format character"),
    (0x2066, 0x206F, "invisible or bidirectional format character"),
    (0xFEFF, 0xFEFF, "invisible or bidirectional format character"),
    (0xFFF9, 0xFFFB, "invisible or bidirectional format character"),
    (0xE0001, 0xE0001, "invisible or bidirectional format character"),
    (0xE0020, 0xE007F, "invisible or bidirectional format character"),
    # spaces other than U+0020
    (0x00A0, 0x00A0, "space other than U+0020"),
    (0x1680, 0x1680, "space other than U+0020"),
    (0x2000, 0x200A, "space other than U+0020"),
    (0x2028, 0x2029, "space other than U+0020"),
    (0x202F, 0x202F, "space other than U+0020"),
    (0x205F, 0x205F, "space other than U+0020"),
    (0x3000, 0x3000, "space other than U+0020"),
)


def check_name(name: str) -> None:
    """§7.2 Name. Unassigned code points, private use and non-NFC text are all allowed."""
    if len(name) > NAME_MAX_CODE_POINTS:  # Python str length counts code points
        raise ProofError("name", f"name has {len(name)} code points (at most {NAME_MAX_CODE_POINTS})")
    for ch in name:
        cp = ord(ch)
        for first, last, what in NAME_FORBIDDEN:
            if first <= cp <= last:
                raise ProofError("name", f"name contains U+{cp:04X}, a {what}")
    if name.startswith(" ") or name.endswith(" "):
        raise ProofError("name", "name has a leading or trailing space")
    if "  " in name:
        raise ProofError("name", "name has two spaces in a row")


# Edwards25519 (RFC 8032 §5.1). Points are extended coordinates (X, Y, Z, T) with
# x = X/Z, y = Y/Z and x*y = T/Z.
ED_P = 2**255 - 19
ED_D = (-121665 * pow(121666, -1, ED_P)) % ED_P
ED_SQRT_M1 = pow(2, (ED_P - 1) // 4, ED_P)
ED_L = 2**252 + 27742317777372353535851937790883648493
ED_IDENTITY = (0, 1, 1, 0)

EdPoint = tuple  # (X, Y, Z, T)


def ed_add(p: EdPoint, q: EdPoint) -> EdPoint:
    """RFC 8032 §5.1.4 addition; complete, so it also doubles."""
    x1, y1, z1, t1 = p
    x2, y2, z2, t2 = q
    a = (y1 - x1) * (y2 - x2) % ED_P
    b = (y1 + x1) * (y2 + x2) % ED_P
    c = 2 * t1 * t2 * ED_D % ED_P
    d = 2 * z1 * z2 % ED_P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % ED_P, g * h % ED_P, f * g % ED_P, e * h % ED_P)


def ed_neg(p: EdPoint) -> EdPoint:
    x, y, z, t = p
    return ((-x) % ED_P, y, z, (-t) % ED_P)


def ed_mul(scalar: int, p: EdPoint) -> EdPoint:
    """[scalar]p by double-and-add (public data only, so no need for constant time)."""
    result = ED_IDENTITY
    while scalar:
        if scalar & 1:
            result = ed_add(result, p)
        p = ed_add(p, p)
        scalar >>= 1
    return result


def ed_is_identity(p: EdPoint) -> bool:
    x, y, z, _ = p
    return x % ED_P == 0 and (y - z) % ED_P == 0


def ed_encode(p: EdPoint) -> bytes:
    """RFC 8032 §5.1.2: y little-endian, with the low bit of x in the top bit."""
    x, y, z, _ = p
    z_inv = pow(z, ED_P - 2, ED_P)
    x, y = x * z_inv % ED_P, y * z_inv % ED_P
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def ed_decode(encoded: bytes) -> EdPoint:
    """RFC 8032 §5.1.3 decoding. Raises ValueError saying why `encoded` is not a point."""
    y = int.from_bytes(encoded, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    if y >= ED_P:
        raise ValueError("y is not reduced (y >= 2^255-19)")
    u = (y * y - 1) % ED_P
    v = (ED_D * y * y + 1) % ED_P
    x = u * pow(v, 3, ED_P) * pow(u * pow(v, 7, ED_P), (ED_P - 5) // 8, ED_P) % ED_P
    vxx = v * x * x % ED_P
    if vxx == (-u) % ED_P and vxx != u:
        x = x * ED_SQRT_M1 % ED_P
    elif vxx != u:
        raise ValueError("not on the curve (no x for this y)")
    if x == 0 and sign:
        raise ValueError("x = 0 with the sign bit set")
    if x & 1 != sign:
        x = ED_P - x
    return (x, y, 1, x * y % ED_P)


# Base point B: y = 4/5, x even (RFC 8032 §5.1).
ED_B = ed_decode(((4 * pow(5, ED_P - 2, ED_P)) % ED_P).to_bytes(32, "little"))


def check_public_key(public_key: bytes) -> EdPoint:
    """§7.3 Public key: an RFC 8032 point of prime order L ([L]A = identity, A != identity).
    This rejects the 8 small-order points and keys with a hidden small-order component."""
    try:
        a_point = ed_decode(public_key)
    except ValueError as err:
        raise ProofError("publicKey", f"public key is not a valid point encoding: {err}") from None
    if ed_is_identity(a_point):
        raise ProofError("publicKey", "public key is the identity point (small order)")
    if not ed_is_identity(ed_mul(ED_L, a_point)):
        raise ProofError("publicKey", "public key is not of prime order L (it has a small-order component)")
    return a_point


def check_signature(proof: Proof, a_point: EdPoint) -> None:
    """§7.4 Cofactorless Ed25519, exactly as the spec states it: S < L, k = SHA-512(R || A || M)
    mod L, and encode([S]B - [k]A) == R byte for byte. R is not checked in any other way.

    We also ask `cryptography` (OpenSSL), which implements the same cofactorless check, and stop
    with an internal error if the two ever disagree."""
    r_bytes, s_bytes = proof.signature[:32], proof.signature[32:]
    s = int.from_bytes(s_bytes, "little")
    if s >= ED_L:
        ours, why = False, "signature S is not reduced (S >= L): malleated signature"
    else:
        digest = hashlib.sha512(r_bytes + proof.public_key + proof.signed_message).digest()
        k = int.from_bytes(digest, "little") % ED_L
        check = ed_encode(ed_add(ed_mul(s, ED_B), ed_neg(ed_mul(k, a_point))))
        ours, why = check == r_bytes, "Ed25519 signature does not verify ([S]B - [k]A does not encode to R)"
    try:
        Ed25519PublicKey.from_public_bytes(proof.public_key).verify(proof.signature, proof.signed_message)
        library = True
    except InvalidSignature:
        library = False
    if ours != library:
        raise RuntimeError(f"internal error: our Ed25519 check says {ours}, cryptography says {library}")
    if not ours:
        raise ProofError("signature", why)


# ---------------------------------------------------------------------------------------------
# §8 Score
# ---------------------------------------------------------------------------------------------

CARD_POINTS = {"COMMON": 10, "UNCOMMON": 20, "RARE": 35, "EPIC": 70, "LEGENDARY": 200, "BRAINROT": 1000}
HOLO_FACTOR = 20
HALL_OF_FAME_MIN_MULTIPLIER = 150
HALL_OF_FAME_MIN_SCORE = 20000


def card_points(card: Card) -> int:
    return CARD_POINTS[card.rarity] * (HOLO_FACTOR if card.is_holo else 1)


def combo(cards: list[Card]) -> tuple[str, int]:
    """§8 combo from c1 >= c2, the two largest copy counts of a card id (c2 = 0 if none)."""
    counts = sorted(Counter(card.card_id for card in cards).values(), reverse=True) + [0]
    top, second = counts[0], counts[1]  # c1, c2
    if top >= 5:
        return "5 of a Kind", 10000
    if top == 4:
        return "4 of a Kind", 250
    if top == 3 and second == 2:  # exactly 2: c1 = 3, c2 = 3 is "3 of a Kind"
        return "Full House", 150
    if top == 3:
        return "3 of a Kind", 15
    if top == 2 and second == 2:
        return "Two Pair", 10
    if top == 2:
        return "Pair", 2
    return "No Matches", 1


@dataclass(frozen=True)
class Score:
    points: int
    hand: str
    multiplier: int
    score: int
    hall_of_fame: bool


def score_pack(cards: list[Card]) -> Score:
    points = sum(card_points(card) for card in cards)
    hand, multiplier = combo(cards)
    score = points * multiplier
    hall_of_fame = multiplier >= HALL_OF_FAME_MIN_MULTIPLIER or score >= HALL_OF_FAME_MIN_SCORE
    return Score(points, hand, multiplier, score, hall_of_fame)


# ---------------------------------------------------------------------------------------------
# §9 Display
# ---------------------------------------------------------------------------------------------

CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def fingerprint(public_key: bytes) -> str:
    """First 40 bits of SHA-256(public key), 8 Crockford base32 characters, as XXXX-XXXX."""
    bits = int.from_bytes(hashlib.sha256(public_key).digest()[:5], "big")
    chars = "".join(CROCKFORD_BASE32[(bits >> (35 - 5 * i)) & 31] for i in range(8))
    return f"{chars[:4]}-{chars[4:]}"


def display_name(name: str) -> str:
    """§9: what a UI shows (NFC, Unicode category C removed). Never affects validity."""
    return "".join(ch for ch in unicodedata.normalize("NFC", name) if unicodedata.category(ch)[0] != "C")


# ---------------------------------------------------------------------------------------------
# The whole pipeline (§1)
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class VerifiedPull:
    proof: Proof
    set_def: SetDef
    ticket: bytes
    seed: bytes
    cards: list[Card]
    score: Score

    def as_json(self) -> dict:
        p, s = self.proof, self.score
        return {
            "valid": True,
            "name": p.name,
            "displayName": display_name(p.name),
            "fingerprint": fingerprint(p.public_key),
            "publicKey": p.public_key.hex(),
            "set": p.set_key,
            "setName": self.set_def.name,
            "archived": self.set_def.archived,
            "nonce": p.nonce,
            "pullId": p.pull_id,
            "ticket": self.ticket.hex(),
            "seed": self.seed.hex(),
            "cards": [dict(c.as_json(), points=card_points(c)) for c in self.cards],
            "points": s.points,
            "hand": s.hand,
            "multiplier": s.multiplier,
            "score": s.score,
            "hallOfFame": s.hall_of_fame,
        }


def verify(text: str, sets: dict[str, SetDef]) -> VerifiedPull:
    """§7 checks in the order the spec lists them; the first failure is the reported rule.
    Then §4-§5 derive the pack and §8 scores it."""
    proof = parse_proof(proof_text_from_input(text))  # §7.1
    check_name(proof.name)  # §7.2
    a_point = check_public_key(proof.public_key)  # §7.3
    check_signature(proof, a_point)  # §7.4
    set_def = sets.get(proof.set_key)  # §7.5
    if set_def is None:
        raise ProofError("set", f"unknown set {proof.set_key}")
    ticket = compute_ticket(proof.set_key, proof.public_key, proof.nonce)
    seed = pack_seed(ticket)
    cards = generate_pack(set_def, seed)
    return VerifiedPull(proof, set_def, ticket, seed, cards, score_pack(cards))


# ---------------------------------------------------------------------------------------------
# CLI: single proof
# ---------------------------------------------------------------------------------------------


def print_summary(pull: VerifiedPull) -> None:
    p, s, sd = pull.proof, pull.score, pull.set_def
    shown = display_name(p.name)
    name = shown if shown else "(no name)"
    if shown != p.name:
        name += f"  (as signed: {p.name!r})"
    print("VALID pull proof")
    print(f"  Player       {name} #{fingerprint(p.public_key)}")
    print(f"  Set          {sd.name} ({p.set_key}){' [archived]' if sd.archived else ''}")
    print(f"  Nonce        {p.nonce}")
    print("  Cards")
    width = max(len(c.card_id) for c in pull.cards)
    for i, card in enumerate(pull.cards, 1):
        holo = "  HOLO" if card.is_holo else ""
        print(f"    {i:>2}. {card.card_id:<{width}}  {card.rarity:<9} {card_points(card):>5} pts{holo}")
    print(f"  Combo        {s.hand} (x{s.multiplier})")
    print(f"  Score        {s.points} x {s.multiplier} = {s.score}")
    if s.hall_of_fame:
        why = "Full House or better" if s.multiplier >= HALL_OF_FAME_MIN_MULTIPLIER else f"score >= {HALL_OF_FAME_MIN_SCORE}"
        print(f"  Hall of Fame yes ({why})")
    else:
        print("  Hall of Fame no")
    print(f"  Pull id      {p.pull_id}")


def run_single(text: str, sets_dir: Path, as_json: bool) -> int:
    try:
        sets = load_sets(sets_dir)
        pull = verify(text, sets)
    except ProofError as err:
        if as_json:
            print(json.dumps({"valid": False, "rule": err.rule, "reason": err.reason}, ensure_ascii=False, indent=2))
        else:
            print(f"INVALID pull proof ({err.rule}): {err.reason}")
        return 1
    except SetDataError as err:
        print(f"error: set data: {err}", file=sys.stderr)
        return 2
    except RuntimeError as err:  # a bug in this verifier, not a verdict on the proof
        print(f"error: {err}", file=sys.stderr)
        return 3
    if as_json:
        print(json.dumps(pull.as_json(), ensure_ascii=False, indent=2))
    else:
        print_summary(pull)
    return 0


# ---------------------------------------------------------------------------------------------
# CLI: test vectors
# ---------------------------------------------------------------------------------------------


def _mismatch(field: str, got: object, want: object) -> list[str]:
    return [] if got == want else [f"{field}: got {got!r}, expected {want!r}"]


# Each check takes one vector and returns what is wrong with our result (empty list = pass).


def check_ticket(v: dict, _sets: dict[str, SetDef]) -> list[str]:
    ticket = compute_ticket(v["setKey"], bytes.fromhex(v["publicKey"]), v["nonce"])
    return _mismatch("ticket", ticket.hex(), v["ticket"])


def check_rng(v: dict, _sets: dict[str, SetDef]) -> list[str]:
    """`outputs` are the spec's generator, i.e. after the 15 discarded values (§5.2). The vectors
    file doesn't say so; if only the raw stream matches, say that instead of a bare mismatch."""
    seed = bytes.fromhex(v["seed"])
    rng = Sfc32(seed)
    got = [rng.next() for _ in v["outputs"]]
    problems = _mismatch("outputs", got, v["outputs"])
    if problems:
        raw = Sfc32(seed, warmup=0)
        if [raw.next() for _ in v["outputs"]] == v["outputs"]:
            problems.append("the expected outputs are the stream WITHOUT the 15-output warm-up")
    return problems


def check_pack(v: dict, sets: dict[str, SetDef]) -> list[str]:
    if v["set"] not in sets:
        return [f"set {v['set']} not found"]
    cards = [c.as_json() for c in generate_pack(sets[v["set"]], bytes.fromhex(v["seed"]))]
    return _mismatch("cards", cards, v["cards"])


VALID_FIELDS = ("set", "publicKey", "nonce", "name", "fingerprint", "cards", "points", "hand", "multiplier", "score", "hallOfFame")


def check_valid(v: dict, sets: dict[str, SetDef]) -> list[str]:
    try:
        pull = verify(v["proof"], sets)
    except ProofError as err:
        return [f"rejected ({err.rule}): {err.reason}"]
    got = pull.as_json()
    got["cards"] = [c.as_json() for c in pull.cards]
    return [problem for field in VALID_FIELDS if field in v for problem in _mismatch(field, got[field], v[field])]


def check_invalid(v: dict, sets: dict[str, SetDef]) -> list[str]:
    try:
        verify(v["proof"], sets)
    except ProofError as err:
        if err.rule != v["rule"]:
            return [f"rejected by rule {err.rule!r} ({err.reason}), but the vector says {v['rule']!r}"]
        return []
    return [f"accepted, but the vector says reject ({v['rule']})"]


def check_same_pull(v: dict, sets: dict[str, SetDef]) -> list[str]:
    """Every proof is valid, they share one (set key, public key, nonce) triple (§7), and so one
    ticket and one pack."""
    problems: list[str] = []
    pulls: list[VerifiedPull] = []
    for j, text in enumerate(v["proofs"]):
        try:
            pulls.append(verify(text, sets))
        except ProofError as err:
            problems.append(f"proofs[{j}] rejected ({err.rule}): {err.reason}")
    for j, pull in enumerate(pulls):
        problems += _mismatch(f"proofs[{j}] pullId", pull.proof.pull_id, v["pullId"])
        problems += _mismatch(f"proofs[{j}] cards", pull.cards, pulls[0].cards)
    return problems


SECTIONS = {
    "tickets": check_ticket,
    "rng": check_rng,
    "packs": check_pack,
    "valid": check_valid,
    "invalid": check_invalid,
    "samePull": check_same_pull,
}


# Vectors written before the revised spec that are now known to be wrong. They are reported but
# not counted as failures. Delete an entry once the file that holds it has been regenerated.
KNOWN_STALE = {
    ("invalid", "name not NFC"): "valid under the revised §7.2, which no longer requires NFC",
}


def run_vector_file(path: Path, sets: dict[str, SetDef]) -> bool:
    """Check one vectors file; print a line per section. Returns True if nothing failed."""
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        print(f"FAIL {path}: cannot read: {err}")
        return False
    generated_by = f", generated by {doc['generatedBy']}" if "generatedBy" in doc else ""
    print(f"{path} (spec version {doc.get('version')}{generated_by})")
    all_ok = True
    for section, check in SECTIONS.items():
        vectors = doc.get(section)
        if not isinstance(vectors, list) or not vectors:
            print(f"  FAIL {section:<9} missing or empty")
            all_ok = False
            continue
        started = time.perf_counter()
        failed, stale = [], []
        for i, v in enumerate(vectors):
            try:
                problems = check(v, sets)
            except RuntimeError as err:  # our Ed25519 and cryptography's disagree
                problems = [str(err)]
            if not problems:
                continue
            note = v.get("note", "")
            line = f"{section}[{i}]{f' ({note})' if note else ''}: " + "; ".join(problems)
            if (section, note) in KNOWN_STALE:
                stale.append(f"{line}  [known stale: {KNOWN_STALE[(section, note)]}]")
            else:
                failed.append(line)
        elapsed = time.perf_counter() - started
        extra = f", {len(stale)} known stale" if stale else ""
        print(f"  {'FAIL' if failed else 'PASS'} {section:<9} {len(vectors) - len(failed) - len(stale)}/{len(vectors)}{extra}  ({elapsed:.2f}s)")
        for line in failed:
            print(f"       - {line}")
        for line in stale:
            print(f"       ~ {line}")
        all_ok = all_ok and not failed
    unchecked = set(doc) - set(SECTIONS) - {"spec", "version", "generatedBy", "testKey"}
    if unchecked:
        print(f"  note: sections not checked: {', '.join(sorted(unchecked))}")
    return all_ok


def run_vectors(paths: list[Path], sets_dir: Path) -> int:
    try:
        sets = load_sets(sets_dir)
    except SetDataError as err:
        print(f"error: set data: {err}", file=sys.stderr)
        return 2
    results = [run_vector_file(path, sets) for path in paths]
    return 0 if all(results) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify a Brainrot TCG pull proof (spec/PULL_SPEC.md v1).")
    parser.add_argument("proof", nargs="?", help="a proof, or a share link ending in #/pull/<proof>")
    parser.add_argument("--vectors", type=Path, nargs="+", metavar="FILE", help="check one or more vectors files instead")
    parser.add_argument("--sets", type=Path, default=DEFAULT_SETS_DIR, metavar="DIR", help=f"set directory (default: {DEFAULT_SETS_DIR})")
    parser.add_argument("--json", action="store_true", help="machine-readable output for a single proof")
    args = parser.parse_args(argv)
    if args.vectors is not None:
        if args.proof is not None:
            parser.error("give either a proof or --vectors, not both")
        return run_vectors(args.vectors, args.sets)
    if args.proof is None:
        parser.error("give a proof or share link, or --vectors FILE")
    return run_single(args.proof, args.sets, args.json)


if __name__ == "__main__":
    sys.exit(main())
