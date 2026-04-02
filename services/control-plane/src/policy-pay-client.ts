import fs from "fs";

import * as anchor from "@coral-xyz/anchor";

import type { ControlPlaneConfig } from "./config";

const PROGRAM_SEED_PREFIX = "policy";
const INTENT_SEED_PREFIX = "intent";

type ProviderLike = anchor.AnchorProvider;

type ProgramLike = anchor.Program;

export class PolicyPayClient {
  readonly provider: ProviderLike;
  readonly program: ProgramLike;

  constructor(private readonly config: ControlPlaneConfig) {
    const connection = new anchor.web3.Connection(config.rpcUrl, "confirmed");
    const wallet = new anchor.Wallet(
      anchor.web3.Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(config.walletPath, "utf8")))
      )
    );

    this.provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    const idl = JSON.parse(fs.readFileSync(config.idlPath, "utf8"));
    this.program = new anchor.Program(idl, this.provider);
  }

  get authority(): anchor.web3.PublicKey {
    return this.provider.wallet.publicKey;
  }

  derivePolicyPda(mint: string) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(PROGRAM_SEED_PREFIX),
        this.authority.toBuffer(),
        new anchor.web3.PublicKey(mint).toBuffer(),
      ],
      this.program.programId
    )[0];
  }

  deriveIntentPda(policy: anchor.web3.PublicKey, intentId: number | string) {
    const bn = new anchor.BN(intentId);

    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(INTENT_SEED_PREFIX),
        policy.toBuffer(),
        bn.toArrayLike(Buffer, "le", 8),
      ],
      this.program.programId
    )[0];
  }

  async fetchPolicy(mint: string) {
    const policy = this.derivePolicyPda(mint);
    return this.program.account.policyAccount.fetch(policy);
  }

  async fetchIntent(policy: string, intentId: number | string) {
    const intent = this.deriveIntentPda(
      new anchor.web3.PublicKey(policy),
      intentId
    );
    return this.program.account.paymentIntent.fetch(intent);
  }

  async createIntent(input: {
    policy: string;
    intentId: number;
    recipient: string;
    amount: number;
    memo: string;
    reference: string;
  }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const paymentIntent = this.deriveIntentPda(policyKey, input.intentId);

    const signature = await this.program.methods
      .createIntent(
        new anchor.BN(input.intentId),
        new anchor.web3.PublicKey(input.recipient),
        new anchor.BN(input.amount),
        input.memo,
        input.reference
      )
      .accounts({
        creator: this.authority,
        policy: policyKey,
        paymentIntent,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { signature, paymentIntent: paymentIntent.toBase58() };
  }

  async approveIntent(input: {
    policy: string;
    intentId: number;
    approvalDigest: number[];
  }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const paymentIntent = this.deriveIntentPda(policyKey, input.intentId);

    const signature = await this.program.methods
      .approveIntent(input.approvalDigest)
      .accounts({
        approver: this.authority,
        policy: policyKey,
        paymentIntent,
      })
      .rpc();

    return { signature, paymentIntent: paymentIntent.toBase58() };
  }

  async cancelIntent(input: { policy: string; intentId: number }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const paymentIntent = this.deriveIntentPda(policyKey, input.intentId);

    const signature = await this.program.methods
      .cancelIntent()
      .accounts({
        canceler: this.authority,
        policy: policyKey,
        paymentIntent,
      })
      .rpc();

    return { signature, paymentIntent: paymentIntent.toBase58() };
  }

  async retryIntent(input: { policy: string; intentId: number }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const paymentIntent = this.deriveIntentPda(policyKey, input.intentId);

    const signature = await this.program.methods
      .retryIntent()
      .accounts({
        executor: this.authority,
        policy: policyKey,
        paymentIntent,
      })
      .rpc();

    return { signature, paymentIntent: paymentIntent.toBase58() };
  }
}
