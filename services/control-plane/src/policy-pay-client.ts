import fs from "fs";

import * as anchor from "@coral-xyz/anchor";

import type { ControlPlaneConfig } from "./config";

const PROGRAM_SEED_PREFIX = "policy";
const INTENT_SEED_PREFIX = "intent";
const BATCH_SEED_PREFIX = "batch";

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

  deriveBatchPda(policy: anchor.web3.PublicKey, batchId: number | string) {
    const bn = new anchor.BN(batchId);

    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(BATCH_SEED_PREFIX),
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

  async fetchBatch(policy: string, batchId: number | string) {
    const batchIntent = this.deriveBatchPda(
      new anchor.web3.PublicKey(policy),
      batchId
    );
    return this.program.account.batchIntent.fetch(batchIntent);
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

  async createDraftIntent(input: {
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
      .createDraftIntent(
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

  async submitDraftIntent(input: { policy: string; intentId: number }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const paymentIntent = this.deriveIntentPda(policyKey, input.intentId);

    const signature = await this.program.methods
      .submitDraftIntent()
      .accounts({
        submitter: this.authority,
        policy: policyKey,
        paymentIntent,
      })
      .rpc();

    return { signature, paymentIntent: paymentIntent.toBase58() };
  }

  async createBatchIntent(input: {
    policy: string;
    batchId: number;
    mode?: "abort-on-error" | "continue-on-error";
  }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const batchIntent = this.deriveBatchPda(policyKey, input.batchId);
    const mode =
      input.mode === "abort-on-error"
        ? { abortOnError: {} }
        : { continueOnError: {} };

    const signature = await this.program.methods
      .createBatchIntent(new anchor.BN(input.batchId), mode)
      .accounts({
        creator: this.authority,
        policy: policyKey,
        batchIntent,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { signature, batchIntent: batchIntent.toBase58() };
  }

  async addBatchItem(input: {
    policy: string;
    batchId: number;
    intentId: number;
    recipient: string;
    amount: number;
    memo: string;
    reference: string;
  }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const batchIntent = this.deriveBatchPda(policyKey, input.batchId);

    const signature = await this.program.methods
      .addBatchItem(
        new anchor.BN(input.intentId),
        new anchor.web3.PublicKey(input.recipient),
        new anchor.BN(input.amount),
        input.memo,
        input.reference
      )
      .accounts({
        creator: this.authority,
        policy: policyKey,
        batchIntent,
      })
      .rpc();

    return { signature, batchIntent: batchIntent.toBase58() };
  }

  async submitBatchForApproval(input: { policy: string; batchId: number }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const batchIntent = this.deriveBatchPda(policyKey, input.batchId);

    const signature = await this.program.methods
      .submitBatchForApproval()
      .accounts({
        creator: this.authority,
        policy: policyKey,
        batchIntent,
      })
      .rpc();

    return { signature, batchIntent: batchIntent.toBase58() };
  }

  async approveBatchIntent(input: {
    policy: string;
    batchId: number;
    approvalDigest: number[];
  }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const batchIntent = this.deriveBatchPda(policyKey, input.batchId);

    const signature = await this.program.methods
      .approveBatchIntent(input.approvalDigest)
      .accounts({
        approver: this.authority,
        policy: policyKey,
        batchIntent,
      })
      .rpc();

    return { signature, batchIntent: batchIntent.toBase58() };
  }

  async cancelBatchIntent(input: { policy: string; batchId: number }) {
    const policyKey = new anchor.web3.PublicKey(input.policy);
    const batchIntent = this.deriveBatchPda(policyKey, input.batchId);

    const signature = await this.program.methods
      .cancelBatchIntent()
      .accounts({
        canceler: this.authority,
        policy: policyKey,
        batchIntent,
      })
      .rpc();

    return { signature, batchIntent: batchIntent.toBase58() };
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
