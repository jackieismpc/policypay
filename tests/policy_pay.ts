import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PolicyPay } from "../target/types/policy_pay";

describe("policy_pay", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.policyPay as Program<PolicyPay>;

  it("initializes program entrypoint", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("Initialization tx", tx);
  });
});
