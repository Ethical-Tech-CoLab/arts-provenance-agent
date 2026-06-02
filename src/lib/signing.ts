/**
 * Passport signing with the agent's secp256k1 WALLET key (viem).
 *
 * The SAME key that pays the x402 micropayment also signs the Passport.
 * "A wallet is PKI" — applied to an artwork's identity instead of a payment.
 * The issuer is a did:pkh (an Ethereum address as a DID); anyone can recover
 * the signer address from the signature with ecrecover and confirm it matches
 * the issuer — no key distribution needed, fully tamper-evident.
 */
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress, type Hex, getAddress } from "viem";

export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** did:pkh for an Ethereum address on a given chain. */
export function addressToDid(address: string, chainId = BASE_SEPOLIA_CHAIN_ID): string {
  return `did:pkh:eip155:${chainId}:${getAddress(address)}`;
}

/** Extract the checksummed address from a did:pkh. */
export function didToAddress(did: string): string {
  const parts = did.split(":");
  const addr = parts[parts.length - 1];
  return getAddress(addr);
}

/** Deterministic canonicalization: recursively sort keys, then JSON. */
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
  issuer: string; // did:pkh:eip155:84532:0x...
  validFrom: string;
  credentialSubject: Record<string, unknown>;
  proof?: {
    type: string; // EcdsaSecp256k1RecoverySignature2020
    created: string;
    verificationMethod: string; // did#blockchainAccountId
    proofPurpose: string;
    proofValue: Hex; // 0x… EIP-191 personal_sign signature
  };
}

/**
 * Sign the credential body (everything except `proof`) with the wallet key and
 * attach the proof. Returns the complete Verifiable Credential.
 */
export async function signCredential(
  body: Omit<VerifiableCredential, "proof">,
  privateKey: Hex,
  createdAt: string
): Promise<VerifiableCredential> {
  const account = privateKeyToAccount(privateKey);
  const message = canonicalize(body);
  const proofValue = await account.signMessage({ message });
  return {
    ...body,
    proof: {
      type: "EcdsaSecp256k1RecoverySignature2020",
      created: createdAt,
      verificationMethod: `${body.issuer}#blockchainAccountId`,
      proofPurpose: "assertionMethod",
      proofValue,
    },
  };
}

export interface VerifyResult {
  valid: boolean;
  issuer: string;
  recoveredAddress?: string;
  reason?: string;
}

/** Recover the signer from the signature and confirm it equals the issuer. */
export async function verifyCredential(vc: VerifiableCredential): Promise<VerifyResult> {
  try {
    if (!vc.proof) return { valid: false, issuer: vc.issuer, reason: "No proof present." };
    const { proof, ...body } = vc;
    const message = canonicalize(body);
    const recovered = await recoverMessageAddress({ message, signature: proof.proofValue });
    const expected = didToAddress(vc.issuer);
    const valid = recovered.toLowerCase() === expected.toLowerCase();
    return {
      valid,
      issuer: vc.issuer,
      recoveredAddress: recovered,
      reason: valid ? undefined : `Recovered ${recovered} ≠ issuer ${expected}.`,
    };
  } catch (e) {
    return { valid: false, issuer: vc.issuer, reason: (e as Error).message };
  }
}
