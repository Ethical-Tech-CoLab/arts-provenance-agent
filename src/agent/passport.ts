/**
 * Step 4 — the Passport (PKI / wallet).
 * Assembles a JSON-LD Digital Provenance Passport and signs it with the SAME
 * secp256k1 wallet key that authorizes x402 payments. verifyPassport recomputes
 * the canonical hash and recovers the signer — tamper-evident and interoperable.
 * "A wallet is PKI, applied to an artwork's identity."
 *
 * Signing is pure cryptography (EIP-191 personal_sign) — no transaction, no
 * funds, works fully offline.
 */
import { keccak256, toHex, recoverMessageAddress, verifyMessage } from "viem";
import { PASSPORT_CONTEXT, type Passport, type TimelineEvent, type RiskFlag } from "../../schema/passport.js";
import { getAccount } from "../wallet/wallet.js";
import type { ArtworkIntent } from "./parseIntent.js";

/** Deterministic JSON: object keys sorted recursively, so the hash is stable. */
function canonicalize(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

export interface MintInput {
  intent: ArtworkIntent;
  timeline: TimelineEvent[];
  riskAssessment: { confidenceScore: number; flags: RiskFlag[] };
  premiumChecks: Passport["premiumChecks"];
  /** Stolen-art register checks — including the ones that could not run. */
  registryChecks?: Passport["registryChecks"];
  issuerName?: string;
}

export async function mintPassport(input: MintInput): Promise<Passport> {
  const account = getAccount();

  const unsigned: Omit<Passport, "contentHash" | "signature"> = {
    "@context": PASSPORT_CONTEXT,
    type: "DigitalProvenancePassport",
    id: `urn:passport:${keccak256(toHex(input.intent.title + "|" + account.address)).slice(2, 18)}`,
    artwork: {
      title: input.intent.title,
      artist: input.intent.artist,
      period: input.intent.period,
      imageHash: input.intent.imageRef ? keccak256(toHex(input.intent.imageRef)) : null,
    },
    provenanceTimeline: input.timeline,
    riskAssessment: input.riskAssessment,
    premiumChecks: input.premiumChecks,
    registryChecks: input.registryChecks ?? [],
    issuer: {
      name: input.issuerName ?? "Digital Provenance Passport Agent",
      wallet: account.address,
    },
    // Fixed timestamp source: provided by caller-free deterministic field.
    issuedAt: new Date().toISOString(),
  };

  const contentHash = keccak256(toHex(canonicalize(unsigned)));
  const signature = await account.signMessage({ message: contentHash });

  return { ...unsigned, contentHash, signature };
}

export interface VerifyResult {
  ok: boolean;
  hashOk: boolean;
  signatureOk: boolean;
  recovered: string | null;
  expectedIssuer: string;
  reason: string;
}

/** Recompute the hash and check the signature — fails if any field was altered. */
export async function verifyPassport(passport: Passport): Promise<VerifyResult> {
  const { contentHash, signature, ...rest } = passport;
  const recomputed = keccak256(toHex(canonicalize(rest)));
  const hashOk = recomputed === contentHash;

  let signatureOk = false;
  let recovered: string | null = null;
  try {
    recovered = await recoverMessageAddress({ message: contentHash, signature: signature as `0x${string}` });
    signatureOk = await verifyMessage({
      address: passport.issuer.wallet as `0x${string}`,
      message: contentHash,
      signature: signature as `0x${string}`,
    });
  } catch { /* invalid signature -> false */ }

  const ok = hashOk && signatureOk;
  return {
    ok,
    hashOk,
    signatureOk,
    recovered,
    expectedIssuer: passport.issuer.wallet,
    reason: ok
      ? "Passport intact: content hash matches and signature recovers to the issuer wallet."
      : !hashOk
        ? "TAMPERED: content hash does not match — a field was altered after signing."
        : "Signature does not recover to the issuer wallet.",
  };
}
