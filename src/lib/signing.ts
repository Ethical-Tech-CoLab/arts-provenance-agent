/**
 * Real Ed25519 / did:key signing for the Provenance Passport.
 *
 * "Wallets are PKI" — applied to an artwork's identity instead of a payment.
 * The agent (the verifying authority) holds an Ed25519 keypair, gets a
 * did:key, and signs the passport as a W3C Verifiable Credential. Anyone can
 * re-canonicalize the doc and check the signature against the issuer's public
 * key in the DID — tamper-evident and interoperable.
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { base58 } from "@scure/base";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// Enable @noble/ed25519 sync hashing (also used by the async paths).
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const MULTICODEC_ED25519_PUB = new Uint8Array([0xed, 0x01]);
const KEY_PATH = process.env.ISSUER_KEY_PATH ?? "keys/issuer.json";

export interface Keypair {
  privateKeyHex: string;
  publicKeyHex: string;
  did: string; // did:key:z...
  verificationMethod: string; // did#fragment
}

function toHex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}
function fromHex(h: string): Uint8Array {
  return new Uint8Array(Buffer.from(h, "hex"));
}

/** Encode a raw Ed25519 public key as a did:key. */
export function publicKeyToDid(pub: Uint8Array): { did: string; verificationMethod: string } {
  const prefixed = new Uint8Array(MULTICODEC_ED25519_PUB.length + pub.length);
  prefixed.set(MULTICODEC_ED25519_PUB, 0);
  prefixed.set(pub, MULTICODEC_ED25519_PUB.length);
  const mb = "z" + base58.encode(prefixed); // multibase base58btc
  const did = `did:key:${mb}`;
  return { did, verificationMethod: `${did}#${mb}` };
}

/** Recover the raw public key from a did:key. */
export function didToPublicKey(did: string): Uint8Array {
  const mb = did.replace("did:key:", "");
  if (!mb.startsWith("z")) throw new Error("Unsupported DID (expected base58btc 'z').");
  const decoded = base58.decode(mb.slice(1));
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("DID is not an Ed25519 key.");
  }
  return decoded.slice(2);
}

/** Load the persisted issuer keypair, generating one on first run. */
export function loadOrCreateIssuer(): Keypair {
  if (existsSync(KEY_PATH)) {
    const saved = JSON.parse(readFileSync(KEY_PATH, "utf8")) as { privateKeyHex: string };
    const priv = fromHex(saved.privateKeyHex);
    const pub = ed.getPublicKey(priv);
    const { did, verificationMethod } = publicKeyToDid(pub);
    return { privateKeyHex: saved.privateKeyHex, publicKeyHex: toHex(pub), did, verificationMethod };
  }
  const priv = ed.utils.randomPrivateKey();
  const pub = ed.getPublicKey(priv);
  const { did, verificationMethod } = publicKeyToDid(pub);
  const kp: Keypair = { privateKeyHex: toHex(priv), publicKeyHex: toHex(pub), did, verificationMethod };
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  writeFileSync(KEY_PATH, JSON.stringify({ privateKeyHex: kp.privateKeyHex }, null, 2));
  return kp;
}

/** Deterministic canonicalization: recursively sort object keys, then JSON. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  return v;
}

export interface VerifiableCredential {
  "@context": string[];
  type: string[];
  issuer: string;
  validFrom: string;
  credentialSubject: Record<string, unknown>;
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string; // multibase base58btc signature
  };
}

/** Sign a credential body (everything except `proof`) and attach the proof. */
export function signCredential(
  body: Omit<VerifiableCredential, "proof">,
  issuer: Keypair,
  createdAt: string
): VerifiableCredential {
  const bytes = new TextEncoder().encode(canonicalize(body));
  const sig = ed.sign(bytes, fromHex(issuer.privateKeyHex));
  return {
    ...body,
    proof: {
      type: "Ed25519Signature2020",
      created: createdAt,
      verificationMethod: issuer.verificationMethod,
      proofPurpose: "assertionMethod",
      proofValue: "z" + base58.encode(sig),
    },
  };
}

export interface VerifyResult {
  valid: boolean;
  issuer: string;
  reason?: string;
}

/** Re-canonicalize the body and verify the signature against the DID. */
export function verifyCredential(vc: VerifiableCredential): VerifyResult {
  try {
    if (!vc.proof) return { valid: false, issuer: vc.issuer, reason: "No proof present." };
    const { proof, ...body } = vc;
    const pub = didToPublicKey(vc.issuer);
    if (!proof.proofValue.startsWith("z")) {
      return { valid: false, issuer: vc.issuer, reason: "Unsupported proofValue encoding." };
    }
    const sig = base58.decode(proof.proofValue.slice(1));
    const bytes = new TextEncoder().encode(canonicalize(body));
    const valid = ed.verify(sig, bytes, pub);
    return { valid, issuer: vc.issuer, reason: valid ? undefined : "Signature does not match." };
  } catch (e) {
    return { valid: false, issuer: vc.issuer, reason: (e as Error).message };
  }
}
