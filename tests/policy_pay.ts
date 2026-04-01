import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";

describe("policy_pay", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.policyPay as Program;

  const mint = anchor.web3.Keypair.generate().publicKey;
  const allowedRecipient = anchor.web3.Keypair.generate().publicKey;
  const blockedRecipient = anchor.web3.Keypair.generate().publicKey;

  const [policyPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("policy"),
      provider.wallet.publicKey.toBuffer(),
      mint.toBuffer(),
    ],
    program.programId
  );

  const intentPda = (intentId: anchor.BN) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("intent"),
        policyPda.toBuffer(),
        intentId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

  const statusName = (status: Record<string, unknown>) =>
    Object.keys(status)[0];

  const expectTxFailure = async (txPromise: Promise<string>) => {
    let failed = false;
    try {
      await txPromise;
    } catch (_error) {
      failed = true;
    }
    expect(failed).to.eq(true);
  };

  it("creates policy and completes lifecycle with retry", async () => {
    await program.methods
      .createPolicy(
        mint,
        new anchor.BN(1_000_000),
        true,
        allowedRecipient,
        true
      )
      .accounts({
        authority: provider.wallet.publicKey,
        policy: policyPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const createdPolicy = await program.account.policyAccount.fetch(policyPda);
    expect(createdPolicy.amountLimit.toNumber()).to.eq(1_000_000);
    expect(createdPolicy.requireRecipientWhitelist).to.eq(true);
    expect(createdPolicy.requireMemo).to.eq(true);
    expect(createdPolicy.allowedRecipient.toBase58()).to.eq(
      allowedRecipient.toBase58()
    );

    const id = new anchor.BN(1);
    const pda = intentPda(id);

    await program.methods
      .createIntent(
        id,
        allowedRecipient,
        new anchor.BN(100),
        "invoice-1",
        "ref-1"
      )
      .accounts({
        creator: provider.wallet.publicKey,
        policy: policyPda,
        paymentIntent: pda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    let intent = await program.account.paymentIntent.fetch(pda);
    expect(statusName(intent.status)).to.eq("pendingApproval");

    await program.methods
      .approveIntent(Array(32).fill(7))
      .accounts({
        approver: provider.wallet.publicKey,
        policy: policyPda,
        paymentIntent: pda,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(pda);
    expect(statusName(intent.status)).to.eq("approved");

    await program.methods
      .executeIntent("sig-submitted-001")
      .accounts({
        executor: provider.wallet.publicKey,
        policy: policyPda,
        paymentIntent: pda,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(pda);
    expect(statusName(intent.status)).to.eq("submitted");
    expect(intent.executionSignature).to.eq("sig-submitted-001");

    await program.methods
      .settleIntent(false, "rpc timeout")
      .accounts({
        executor: provider.wallet.publicKey,
        policy: policyPda,
        paymentIntent: pda,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(pda);
    expect(statusName(intent.status)).to.eq("failed");
    expect(intent.retryCount).to.eq(1);

    await program.methods
      .retryIntent()
      .accounts({
        executor: provider.wallet.publicKey,
        policy: policyPda,
        paymentIntent: pda,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(pda);
    expect(statusName(intent.status)).to.eq("approved");

    await program.methods
      .executeIntent("sig-submitted-002")
      .accounts({
        executor: provider.wallet.publicKey,
        policy: policyPda,
        paymentIntent: pda,
      })
      .rpc();

    await program.methods
      .settleIntent(true, "")
      .accounts({
        executor: provider.wallet.publicKey,
        policy: policyPda,
        paymentIntent: pda,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(pda);
    expect(statusName(intent.status)).to.eq("confirmed");

    await expectTxFailure(
      program.methods
        .cancelIntent()
        .accounts({
          canceler: provider.wallet.publicKey,
          policy: policyPda,
          paymentIntent: pda,
        })
        .rpc()
    );
  });

  it("rejects recipient outside whitelist and missing memo", async () => {
    const blockedIntentId = new anchor.BN(2);
    const blockedIntentPda = intentPda(blockedIntentId);

    await expectTxFailure(
      program.methods
        .createIntent(
          blockedIntentId,
          blockedRecipient,
          new anchor.BN(100),
          "invoice-2",
          "ref-2"
        )
        .accounts({
          creator: provider.wallet.publicKey,
          policy: policyPda,
          paymentIntent: blockedIntentPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc()
    );

    const missingMemoIntentId = new anchor.BN(3);
    const missingMemoIntentPda = intentPda(missingMemoIntentId);

    await expectTxFailure(
      program.methods
        .createIntent(
          missingMemoIntentId,
          allowedRecipient,
          new anchor.BN(100),
          "",
          "ref-3"
        )
        .accounts({
          creator: provider.wallet.publicKey,
          policy: policyPda,
          paymentIntent: missingMemoIntentPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc()
    );
  });
});
