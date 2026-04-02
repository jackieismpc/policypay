import BN from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

describe("policy_pay", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.policyPay as any;

  const policyPda = (
    authority: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey
  ) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), authority.toBuffer(), mint.toBuffer()],
      program.programId
    )[0];

  const intentPda = (policy: anchor.web3.PublicKey, intentId: BN) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("intent"),
        policy.toBuffer(),
        intentId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

  const statusName = (status: Record<string, unknown>) =>
    Object.keys(status)[0];

  const errorText = (error: unknown) => {
    const err = error as {
      error?: { errorCode?: { code?: string }; errorMessage?: string };
      errorCode?: { code?: string };
      message?: string;
      logs?: string[];
      toString(): string;
    };

    return [
      err?.error?.errorCode?.code,
      err?.errorCode?.code,
      err?.error?.errorMessage,
      err?.message,
      err?.logs?.join("\n"),
      err?.toString?.(),
    ]
      .filter(Boolean)
      .join("\n");
  };

  const expectAnchorError = async (
    txPromise: Promise<string>,
    expected: string
  ) => {
    try {
      await txPromise;
      expect.fail(`expected transaction to fail with ${expected}`);
    } catch (error) {
      const err = error as {
        error?: { errorCode?: { code?: string } };
        errorCode?: { code?: string };
      };
      const code = err?.error?.errorCode?.code ?? err?.errorCode?.code;

      if (code) {
        expect(code).to.eq(expected);
        return;
      }

      expect(errorText(error)).to.include(expected);
    }
  };

  const fundKeypair = async (keypair: anchor.web3.Keypair) => {
    const signature = await provider.connection.requestAirdrop(
      keypair.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    const latestBlockhash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );
  };

  const createPolicy = async (params?: {
    authority?: anchor.web3.PublicKey;
    signer?: anchor.web3.Keypair;
    mint?: anchor.web3.PublicKey;
    amountLimit?: BN;
    requireRecipientWhitelist?: boolean;
    allowedRecipient?: anchor.web3.PublicKey;
    requireMemo?: boolean;
  }) => {
    const authority = params?.authority ?? provider.wallet.publicKey;
    const mint = params?.mint ?? anchor.web3.Keypair.generate().publicKey;
    const allowedRecipient =
      params?.allowedRecipient ?? anchor.web3.Keypair.generate().publicKey;
    const policy = policyPda(authority, mint);

    const builder = program.methods
      .createPolicy(
        mint,
        params?.amountLimit ?? new BN(1_000_000),
        params?.requireRecipientWhitelist ?? true,
        allowedRecipient,
        params?.requireMemo ?? true
      )
      .accounts({
        authority,
        policy,
        systemProgram: anchor.web3.SystemProgram.programId,
      });

    if (params?.signer) {
      builder.signers([params.signer]);
    }

    await builder.rpc();

    return { policy, mint, allowedRecipient, authority };
  };

  const createIntent = async (params: {
    policy: anchor.web3.PublicKey;
    recipient: anchor.web3.PublicKey;
    amount?: BN;
    memo?: string;
    reference?: string;
    intentId?: BN;
    creator?: anchor.web3.PublicKey;
    signer?: anchor.web3.Keypair;
  }) => {
    const intentId = params.intentId ?? new BN(Date.now());
    const paymentIntent = intentPda(params.policy, intentId);
    const creator = params.creator ?? provider.wallet.publicKey;

    const builder = program.methods
      .createIntent(
        intentId,
        params.recipient,
        params.amount ?? new BN(100),
        params.memo ?? "invoice-1",
        params.reference ?? "ref-1"
      )
      .accounts({
        creator,
        policy: params.policy,
        paymentIntent,
        systemProgram: anchor.web3.SystemProgram.programId,
      });

    if (params.signer) {
      builder.signers([params.signer]);
    }

    await builder.rpc();

    return { intentId, paymentIntent };
  };

  it("creates policy and completes lifecycle with retry", async () => {
    const blockedRecipient = anchor.web3.Keypair.generate().publicKey;
    const { policy, allowedRecipient } = await createPolicy();

    const createdPolicy = await program.account.policyAccount.fetch(policy);
    expect(createdPolicy.amountLimit.toNumber()).to.eq(1_000_000);
    expect(createdPolicy.requireRecipientWhitelist).to.eq(true);
    expect(createdPolicy.requireMemo).to.eq(true);
    expect(createdPolicy.allowedRecipient.toBase58()).to.eq(
      allowedRecipient.toBase58()
    );

    const { paymentIntent } = await createIntent({
      policy,
      recipient: allowedRecipient,
      intentId: new BN(1),
      memo: "invoice-1",
      reference: "ref-1",
    });

    let intent = await program.account.paymentIntent.fetch(paymentIntent);
    expect(statusName(intent.status)).to.eq("pendingApproval");

    const approvalDigest = Array(32).fill(7);

    await program.methods
      .approveIntent(approvalDigest)
      .accounts({
        approver: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(paymentIntent);
    expect(statusName(intent.status)).to.eq("approved");
    expect(intent.approver.toBase58()).to.eq(
      provider.wallet.publicKey.toBase58()
    );
    expect(Array.from(intent.approvalDigest)).to.deep.eq(approvalDigest);

    await program.methods
      .executeIntent("sig-submitted-001")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(paymentIntent);
    expect(statusName(intent.status)).to.eq("submitted");
    expect(intent.executionSignature).to.eq("sig-submitted-001");

    await program.methods
      .settleIntent(false, "rpc timeout")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(paymentIntent);
    expect(statusName(intent.status)).to.eq("failed");
    expect(intent.retryCount).to.eq(1);
    expect(intent.failureReason).to.eq("rpc timeout");

    await program.methods
      .retryIntent()
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(paymentIntent);
    expect(statusName(intent.status)).to.eq("approved");
    expect(intent.failureReason).to.eq("");

    await program.methods
      .executeIntent("sig-submitted-002")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    await program.methods
      .settleIntent(true, "")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    intent = await program.account.paymentIntent.fetch(paymentIntent);
    expect(statusName(intent.status)).to.eq("confirmed");
    expect(intent.executionSignature).to.eq("sig-submitted-002");
    expect(intent.failureReason).to.eq("");

    await expectAnchorError(
      program.methods
        .cancelIntent()
        .accounts({
          canceler: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "InvalidStatusTransition"
    );

    await expectAnchorError(
      createIntent({
        policy,
        recipient: blockedRecipient,
        intentId: new BN(2),
        memo: "invoice-2",
        reference: "ref-2",
      }),
      "WhitelistViolation"
    );

    await expectAnchorError(
      createIntent({
        policy,
        recipient: allowedRecipient,
        intentId: new BN(3),
        memo: "",
        reference: "ref-3",
      }),
      "MemoRequired"
    );
  });

  it("rejects invalid policy and intent parameters", async () => {
    const zeroLimitMint = anchor.web3.Keypair.generate().publicKey;
    const zeroLimitPolicy = policyPda(provider.wallet.publicKey, zeroLimitMint);

    await expectAnchorError(
      program.methods
        .createPolicy(
          zeroLimitMint,
          new BN(0),
          false,
          anchor.web3.Keypair.generate().publicKey,
          false
        )
        .accounts({
          authority: provider.wallet.publicKey,
          policy: zeroLimitPolicy,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "InvalidAmount"
    );

    const whitelistMint = anchor.web3.Keypair.generate().publicKey;
    const whitelistPolicy = policyPda(provider.wallet.publicKey, whitelistMint);

    await expectAnchorError(
      program.methods
        .createPolicy(
          whitelistMint,
          new BN(1_000_000),
          true,
          anchor.web3.PublicKey.default,
          false
        )
        .accounts({
          authority: provider.wallet.publicKey,
          policy: whitelistPolicy,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "MissingAllowedRecipient"
    );

    const { policy, allowedRecipient } = await createPolicy({
      amountLimit: new BN(500),
    });

    await expectAnchorError(
      createIntent({
        policy,
        recipient: allowedRecipient,
        amount: new BN(0),
        intentId: new BN(10),
      }),
      "InvalidAmount"
    );

    await expectAnchorError(
      createIntent({
        policy,
        recipient: allowedRecipient,
        amount: new BN(501),
        intentId: new BN(11),
      }),
      "InvalidAmount"
    );

    await expectAnchorError(
      createIntent({
        policy,
        recipient: allowedRecipient,
        intentId: new BN(12),
        memo: "m".repeat(141),
      }),
      "TextTooLong"
    );

    await expectAnchorError(
      createIntent({
        policy,
        recipient: allowedRecipient,
        intentId: new BN(13),
        reference: "r".repeat(65),
      }),
      "TextTooLong"
    );
  });

  it("enforces authority and cancel permissions", async () => {
    const unauthorized = anchor.web3.Keypair.generate();
    const creator = anchor.web3.Keypair.generate();
    await fundKeypair(unauthorized);
    await fundKeypair(creator);

    const { policy, allowedRecipient } = await createPolicy();
    const { paymentIntent } = await createIntent({
      policy,
      recipient: allowedRecipient,
      intentId: new BN(20),
      creator: creator.publicKey,
      signer: creator,
    });

    await expectAnchorError(
      program.methods
        .approveIntent(Array(32).fill(1))
        .accounts({
          approver: unauthorized.publicKey,
          policy,
          paymentIntent,
        })
        .signers([unauthorized])
        .rpc(),
      "Unauthorized"
    );

    await program.methods
      .approveIntent(Array(32).fill(2))
      .accounts({
        approver: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    await expectAnchorError(
      program.methods
        .executeIntent("sig-unauthorized")
        .accounts({
          executor: unauthorized.publicKey,
          policy,
          paymentIntent,
        })
        .signers([unauthorized])
        .rpc(),
      "Unauthorized"
    );

    await expectAnchorError(
      program.methods
        .cancelIntent()
        .accounts({
          canceler: unauthorized.publicKey,
          policy,
          paymentIntent,
        })
        .signers([unauthorized])
        .rpc(),
      "Unauthorized"
    );

    await program.methods
      .cancelIntent()
      .accounts({
        canceler: creator.publicKey,
        policy,
        paymentIntent,
      })
      .signers([creator])
      .rpc();

    const canceledIntent = await program.account.paymentIntent.fetch(
      paymentIntent
    );
    expect(statusName(canceledIntent.status)).to.eq("cancelled");

    const { paymentIntent: retryIntent } = await createIntent({
      policy,
      recipient: allowedRecipient,
      intentId: new BN(21),
    });

    await program.methods
      .approveIntent(Array(32).fill(3))
      .accounts({
        approver: provider.wallet.publicKey,
        policy,
        paymentIntent: retryIntent,
      })
      .rpc();

    await program.methods
      .executeIntent("sig-authorized")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent: retryIntent,
      })
      .rpc();

    await expectAnchorError(
      program.methods
        .settleIntent(false, "unauthorized settle")
        .accounts({
          executor: unauthorized.publicKey,
          policy,
          paymentIntent: retryIntent,
        })
        .signers([unauthorized])
        .rpc(),
      "Unauthorized"
    );

    await program.methods
      .settleIntent(false, "rpc timeout")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent: retryIntent,
      })
      .rpc();

    await expectAnchorError(
      program.methods
        .retryIntent()
        .accounts({
          executor: unauthorized.publicKey,
          policy,
          paymentIntent: retryIntent,
        })
        .signers([unauthorized])
        .rpc(),
      "Unauthorized"
    );
  });

  it("rejects invalid status transitions and mismatched policies", async () => {
    const { policy, allowedRecipient } = await createPolicy();
    const { paymentIntent } = await createIntent({
      policy,
      recipient: allowedRecipient,
      intentId: new BN(30),
    });

    await expectAnchorError(
      program.methods
        .executeIntent("sig-before-approval")
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "InvalidStatusTransition"
    );

    await expectAnchorError(
      program.methods
        .settleIntent(true, "")
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "InvalidStatusTransition"
    );

    await expectAnchorError(
      program.methods
        .retryIntent()
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "InvalidStatusTransition"
    );

    await program.methods
      .approveIntent(Array(32).fill(4))
      .accounts({
        approver: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    await expectAnchorError(
      program.methods
        .approveIntent(Array(32).fill(5))
        .accounts({
          approver: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "InvalidStatusTransition"
    );

    const { policy: otherPolicy } = await createPolicy({
      mint: anchor.web3.Keypair.generate().publicKey,
      allowedRecipient,
    });

    await expectAnchorError(
      program.methods
        .approveIntent(Array(32).fill(6))
        .accounts({
          approver: provider.wallet.publicKey,
          policy: otherPolicy,
          paymentIntent,
        })
        .rpc(),
      "PolicyMismatch"
    );

    await program.methods
      .executeIntent("sig-submitted-030")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    await expectAnchorError(
      program.methods
        .cancelIntent()
        .accounts({
          canceler: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "InvalidStatusTransition"
    );
  });

  it("validates execution fields and enforces retry limit", async () => {
    const { policy, allowedRecipient } = await createPolicy();
    const { paymentIntent } = await createIntent({
      policy,
      recipient: allowedRecipient,
      intentId: new BN(40),
    });

    await program.methods
      .approveIntent(Array(32).fill(8))
      .accounts({
        approver: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    await expectAnchorError(
      program.methods
        .executeIntent("")
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "EmptyExecutionSignature"
    );

    await expectAnchorError(
      program.methods
        .executeIntent("s".repeat(89))
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "TextTooLong"
    );

    await program.methods
      .executeIntent("sig-submitted-040")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    await expectAnchorError(
      program.methods
        .settleIntent(false, "")
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "MissingFailureReason"
    );

    await expectAnchorError(
      program.methods
        .settleIntent(false, "f".repeat(121))
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "TextTooLong"
    );

    await program.methods
      .settleIntent(false, "first failure")
      .accounts({
        executor: provider.wallet.publicKey,
        policy,
        paymentIntent,
      })
      .rpc();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let intent = await program.account.paymentIntent.fetch(paymentIntent);
      expect(intent.retryCount).to.eq(attempt);

      await program.methods
        .retryIntent()
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc();

      intent = await program.account.paymentIntent.fetch(paymentIntent);
      expect(statusName(intent.status)).to.eq("approved");
      expect(intent.failureReason).to.eq("");

      await program.methods
        .executeIntent(`sig-retry-${attempt}`)
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc();

      await program.methods
        .settleIntent(false, `failure-${attempt + 1}`)
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc();
    }

    const failedIntent = await program.account.paymentIntent.fetch(
      paymentIntent
    );
    expect(statusName(failedIntent.status)).to.eq("failed");
    expect(failedIntent.retryCount).to.eq(3);

    await expectAnchorError(
      program.methods
        .retryIntent()
        .accounts({
          executor: provider.wallet.publicKey,
          policy,
          paymentIntent,
        })
        .rpc(),
      "RetryLimitReached"
    );
  });
});
