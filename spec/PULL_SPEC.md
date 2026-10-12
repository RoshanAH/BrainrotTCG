# Brainrot TCG pull proofs: specification (v1)

This is the normative spec for verifying a Brainrot TCG pull. Anyone can implement it; nothing here
depends on the game's code. `spec/vectors.json` has test vectors, and `spec/verify_pull.py` is a
second, independent implementation written from this document. CI checks it against the vectors
and against the TypeScript engine (`src/engine/`).

The keywords MUST, MUST NOT and SHOULD are used as in RFC 2119.

## 1. Overview

```
proof link  ─► decode (strict) ─► check name ─► check Ed25519 signature ─► look up set@version
                                                                              │
cards + score ◄─ generate pack ◄─ sfc32 PRNG ◄─ SHA-256 seed ◄─ Argon2id ticket(set, key, nonce)
```

A proof never contains cards. The verifier derives them, so a proof can't claim cards it didn't pull.

## 2. Primitives

- **UTF-8**: strings are encoded as UTF-8. A decoder MUST reject invalid UTF-8 (overlong forms,
  surrogates, truncated sequences).
- **Hex**: lowercase, two digits per byte.
- **base64url**: RFC 4648 §5 alphabet `A–Z a–z 0–9 - _`, **no padding**. A decoder MUST reject
  `=`, any other character, a length ≡ 1 (mod 4), and **non-canonical input**: the unused low bits of
  the last character MUST be zero. (Equivalently: re-encoding the decoded bytes gives the same text.)
- **varint**: unsigned LEB128, 7 bits per byte, least significant group first, high bit set on every
  byte but the last. Values are 0 … 2⁵³−1 (at most 8 bytes). The encoding MUST be minimal: no
  trailing `0x80`-continued zero groups (the last byte of a multi-byte varint is never `0x00`).
- **u16be**: two bytes, big-endian.

## 3. Sets

A set is a JSON document (`src/content/sets/<id>/set.json`; older versions are kept as
`set.v<N>.json`). The fields used for verification:

| Field | Meaning |
| --- | --- |
| `id`, `version` | the set key is `` `${id}@${version}` ``, e.g. `right-now@1` |
| `packSize` | cards per pack (1 … 15) |
| `odds` | integer weight per rarity, summing to **10000** |
| `holoOdds` | chance of holo per card, out of 10000 |
| `cards` | ordered list of `{ id, rarity }`. **Order matters.** |

Rarities, rarest first (this order is normative): `BRAINROT, LEGENDARY, EPIC, RARE, UNCOMMON, COMMON`.

A released `set@version` never changes; `src/content/sets.lock.json` pins a hash of these fields.
Archived sets (`archivedAt`) still verify.

## 4. Ticket (proof of work)

```
ticket = Argon2id(
  password = UTF-8("brainrot-tcg/ticket/v1|" + setKey + "|" + hex(publicKey) + "|" + decimal(nonce)),
  salt     = UTF-8("brainrot-tcg/ticket-salt/v1"),
  memory   = 32768 KiB, iterations = 2, parallelism = 1, tag length = 32 bytes,
  version  = 0x13, no secret, no associated data)
```

`decimal(nonce)` has no leading zeros, sign or separators.

## 5. Pack generation

1. `seed = SHA-256(UTF-8("brainrot-tcg/pack/v1") || ticket)`.
2. **sfc32 PRNG.** All arithmetic is on unsigned 32-bit integers, wrapping mod 2³².
   `a, b, c, d` are the little-endian u32s at seed bytes 0–3, 4–7, 8–11, 12–15.
   ```
   next():
     t = a + b + d
     d = d + 1
     a = b XOR (b >> 9)
     b = c + (c << 3)
     c = (c << 21) | (c >> 11)        # rotate left by 21
     c = c + t
     return t
   ```
   Call `next()` 15 times and discard the results. Then `int(n) = floor(next() × n / 2³²)`
   (exact integer arithmetic).
3. For each slot `0 … packSize−1`, in order:
   1. `roll = int(10000)`. Walk the rarities rarest first, adding each rarity's weight to a running
      total; the slot's rarity is the first whose running total is greater than `roll`.
   2. `pool` = the set's cards of that rarity, in set order. `card = pool[int(len(pool))]`.
   3. `holo = int(10000) < holoOdds`.

## 6. Proof format

A proof is base64url (section 2) of these bytes:

| Bytes | Field |
| --- | --- |
| 1 | proof version, `0x01` |
| 1 + n | set id: length byte `n` (1 … 64), then UTF-8 |
| 2 | set version, u16be |
| 32 | player public key (Ed25519) |
| varint | nonce (ticket number) |
| 1 + n | display name: length byte `n` (0 … 255), then UTF-8 |
| 64 | Ed25519 signature |

The signed message is `UTF-8("brainrot-tcg/proof/v1") || <every byte before the signature>`.

Share links look like `https://…/#/pull/<proof>`.

## 7. Verification

A verifier MUST reject the proof (and SHOULD say why) unless all of these hold:

1. **Strict decoding.** base64url, varint and UTF-8 are canonical (section 2), the version byte is 1,
   lengths are in range, and there are no bytes after the signature.
2. **Normalised name.** The name is NFC, contains no code point of Unicode general category C
   (Cc, Cf, Cs, Co, Cn), uses U+0020 as its only whitespace (none of U+0009–U+000D, U+00A0, U+1680,
   U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF), has no leading, trailing or
   doubled spaces, and is at most 24 code points.
3. **Public key.** A canonical point encoding (y < 2²⁵⁵−19, and not x = 0 with the sign bit set)
   that is **not of small order**. These are the eight small-order points (hex):
   ```
   0100000000000000000000000000000000000000000000000000000000000000
   ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f
   0000000000000000000000000000000000000000000000000000000000000000
   0000000000000000000000000000000000000000000000000000000000000080
   26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05
   26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85
   c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a
   c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa
   ```
   Small-order keys are rejected because anyone can forge signatures for them.
4. **Signature.** Ed25519 per RFC 8032 §5.1.7 with strict decoding: `S < L`, and `R` and `A`
   canonical. (A ZIP-215 verifier is too permissive here.)
5. **Known set.** `set@version` exists.

Then derive the pack (sections 4–5) and score it (section 8). Two proofs are **the same pull** when
they have the same set key, public key and nonce, even if the names or signatures differ (an owner
can sign many times). Leaderboards MUST deduplicate on that triple.

## 8. Score

- Card points: `COMMON 10, UNCOMMON 20, RARE 35, EPIC 70, LEGENDARY 200, BRAINROT 1000`; ×20 if holo.
- Combo, by how many copies of each card id the pack holds (counts sorted, largest first):
  5+ → **5 of a Kind ×10000**; 4 → **4 of a Kind ×250**; 3 and 2 → **Full House ×150**;
  3 → **3 of a Kind ×15**; 2 and 2 → **Two Pair ×10**; 2 → **Pair ×2**; else **No Matches ×1**.
- **Brainrot Score = (sum of card points) × combo multiplier.**

**Hall of Fame:** a pull qualifies with a multiplier of at least 150 (Full House or better), or a
score of at least 20000.

## 9. Display (not part of verification)

- **Fingerprint**: the first 40 bits of SHA-256(public key) as 8 Crockford base32 characters
  (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), most significant first, shown as `#XXXX-XXXX`. Names are
  not unique; the name plus fingerprint identifies a player.

## 10. What a valid proof does and doesn't show

It shows that the holder of that key pulled exactly these cards from that set by spending the ticket
with that number, and that nothing was edited. It doesn't show how many packs the player opened
(including in a script), so the Hall of Fame says who pulled something first, not who was luckiest.
