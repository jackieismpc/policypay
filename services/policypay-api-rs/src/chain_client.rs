use std::sync::Arc;

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anyhow::{anyhow, Context};
use serde::Deserialize;
use serde_json::{json, Value};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    pubkey,
    pubkey::Pubkey,
    signature::{read_keypair_file, Keypair, Signer},
    transaction::Transaction,
};

use policy_pay::{
    accounts as program_accounts, instruction as program_instruction,
    state::{
        BatchIntent, BatchItemStatus, BatchMode, BatchStatus, IntentStatus, PaymentIntent,
        PolicyAccount,
    },
};

const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");

#[derive(Clone)]
pub struct ChainClient {
    rpc: Arc<RpcClient>,
    signer: Arc<Keypair>,
    authority: Pubkey,
    program_id: Pubkey,
}

#[derive(Debug, Deserialize)]
pub struct CreatePolicyInput {
    pub mint: String,
    #[serde(rename = "amountLimit")]
    pub amount_limit: u64,
    #[serde(rename = "requireRecipientWhitelist")]
    pub require_recipient_whitelist: Option<bool>,
    #[serde(rename = "allowedRecipient")]
    pub allowed_recipient: Option<String>,
    #[serde(rename = "requireMemo")]
    pub require_memo: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateIntentInput {
    pub policy: String,
    #[serde(rename = "intentId")]
    pub intent_id: u64,
    pub recipient: String,
    pub amount: u64,
    pub memo: String,
    pub reference: String,
}

#[derive(Debug, Deserialize)]
pub struct IntentActionInput {
    pub policy: String,
    #[serde(rename = "intentId")]
    pub intent_id: u64,
}

#[derive(Debug, Deserialize)]
pub struct ApproveIntentInput {
    pub policy: String,
    #[serde(rename = "intentId")]
    pub intent_id: u64,
    #[serde(rename = "approvalDigest")]
    pub approval_digest: [u8; 32],
}

#[derive(Debug, Deserialize)]
pub struct CreateBatchInput {
    pub policy: String,
    #[serde(rename = "batchId")]
    pub batch_id: u64,
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchActionInput {
    pub policy: String,
    #[serde(rename = "batchId")]
    pub batch_id: u64,
}

#[derive(Debug, Deserialize)]
pub struct AddBatchItemInput {
    pub policy: String,
    #[serde(rename = "batchId")]
    pub batch_id: u64,
    #[serde(rename = "intentId")]
    pub intent_id: u64,
    pub recipient: String,
    pub amount: u64,
    pub memo: String,
    pub reference: String,
}

#[derive(Debug, Deserialize)]
pub struct ApproveBatchInput {
    pub policy: String,
    #[serde(rename = "batchId")]
    pub batch_id: u64,
    #[serde(rename = "approvalDigest")]
    pub approval_digest: [u8; 32],
}

impl ChainClient {
    pub fn new(rpc_url: &str, wallet_path: &str, program_id: Option<&str>) -> anyhow::Result<Self> {
        let signer = read_keypair_file(wallet_path)
            .map_err(|e| anyhow!("failed to read wallet {}: {e}", wallet_path))?;
        let authority = signer.pubkey();

        let program_id = match program_id {
            Some(value) if !value.trim().is_empty() => value
                .parse::<Pubkey>()
                .with_context(|| format!("invalid POLICY_PAY_PROGRAM_ID: {value}"))?,
            _ => policy_pay::id(),
        };

        Ok(Self {
            rpc: Arc::new(RpcClient::new_with_commitment(
                rpc_url.to_string(),
                CommitmentConfig::confirmed(),
            )),
            signer: Arc::new(signer),
            authority,
            program_id,
        })
    }

    pub fn authority(&self) -> Pubkey {
        self.authority
    }

    pub fn program_id(&self) -> Pubkey {
        self.program_id
    }

    pub fn ping(&self) -> anyhow::Result<()> {
        self.rpc
            .get_latest_blockhash()
            .context("failed to fetch latest blockhash")?;
        Ok(())
    }

    pub fn derive_policy_pda(&self, mint: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[
                PolicyAccount::SEED_PREFIX,
                self.authority.as_ref(),
                mint.as_ref(),
            ],
            &self.program_id,
        )
        .0
    }

    pub fn derive_intent_pda(&self, policy: &Pubkey, intent_id: u64) -> Pubkey {
        Pubkey::find_program_address(
            &[
                PaymentIntent::SEED_PREFIX,
                policy.as_ref(),
                &intent_id.to_le_bytes(),
            ],
            &self.program_id,
        )
        .0
    }

    pub fn derive_batch_pda(&self, policy: &Pubkey, batch_id: u64) -> Pubkey {
        Pubkey::find_program_address(
            &[
                BatchIntent::SEED_PREFIX,
                policy.as_ref(),
                &batch_id.to_le_bytes(),
            ],
            &self.program_id,
        )
        .0
    }

    pub fn fetch_policy_by_mint(&self, mint: &str) -> anyhow::Result<Value> {
        let mint = parse_pubkey(mint, "mint")?;
        let policy_pda = self.derive_policy_pda(&mint);
        let policy = self.fetch_anchor_account::<PolicyAccount>(&policy_pda)?;

        Ok(policy_to_json(policy_pda, &policy))
    }

    pub fn fetch_intent(&self, policy: &str, intent_id: u64) -> anyhow::Result<Value> {
        let policy = parse_pubkey(policy, "policy")?;
        let intent_pda = self.derive_intent_pda(&policy, intent_id);
        let intent = self.fetch_anchor_account::<PaymentIntent>(&intent_pda)?;

        Ok(intent_to_json(intent_pda, &intent))
    }

    pub fn fetch_batch(&self, policy: &str, batch_id: u64) -> anyhow::Result<Value> {
        let policy = parse_pubkey(policy, "policy")?;
        let batch_pda = self.derive_batch_pda(&policy, batch_id);
        let batch = self.fetch_anchor_account::<BatchIntent>(&batch_pda)?;

        Ok(batch_to_json(batch_pda, &batch))
    }

    pub fn create_policy(&self, input: CreatePolicyInput) -> anyhow::Result<Value> {
        if input.amount_limit == 0 {
            return Err(anyhow!("amountLimit must be greater than 0"));
        }

        let mint = parse_pubkey(&input.mint, "mint")?;
        let require_recipient_whitelist = input.require_recipient_whitelist.unwrap_or(false);
        let require_memo = input.require_memo.unwrap_or(false);

        let allowed_recipient = match input.allowed_recipient {
            Some(value) if !value.trim().is_empty() => parse_pubkey(&value, "allowedRecipient")?,
            _ => Pubkey::default(),
        };

        if require_recipient_whitelist && allowed_recipient == Pubkey::default() {
            return Err(anyhow!(
                "allowedRecipient must be set when requireRecipientWhitelist=true"
            ));
        }

        let policy = self.derive_policy_pda(&mint);

        let accounts = program_accounts::CreatePolicy {
            authority: self.authority,
            policy,
            system_program: SYSTEM_PROGRAM_ID,
        };

        let args = program_instruction::CreatePolicy {
            mint,
            amount_limit: input.amount_limit,
            require_recipient_whitelist,
            allowed_recipient,
            require_memo,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "policy": policy.to_string(),
            "mint": mint.to_string(),
        }))
    }

    pub fn create_intent(&self, input: CreateIntentInput) -> anyhow::Result<Value> {
        if input.amount == 0 {
            return Err(anyhow!("amount must be a positive integer"));
        }

        let policy = parse_pubkey(&input.policy, "policy")?;
        let recipient = parse_pubkey(&input.recipient, "recipient")?;
        let payment_intent = self.derive_intent_pda(&policy, input.intent_id);

        let accounts = program_accounts::CreateIntent {
            creator: self.authority,
            policy,
            payment_intent,
            system_program: SYSTEM_PROGRAM_ID,
        };

        let args = program_instruction::CreateIntent {
            intent_id: input.intent_id,
            recipient,
            amount: input.amount,
            memo: input.memo,
            reference: input.reference,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "paymentIntent": payment_intent.to_string(),
        }))
    }

    pub fn create_draft_intent(&self, input: CreateIntentInput) -> anyhow::Result<Value> {
        if input.amount == 0 {
            return Err(anyhow!("amount must be a positive integer"));
        }

        let policy = parse_pubkey(&input.policy, "policy")?;
        let recipient = parse_pubkey(&input.recipient, "recipient")?;
        let payment_intent = self.derive_intent_pda(&policy, input.intent_id);

        let accounts = program_accounts::CreateIntent {
            creator: self.authority,
            policy,
            payment_intent,
            system_program: SYSTEM_PROGRAM_ID,
        };

        let args = program_instruction::CreateDraftIntent {
            intent_id: input.intent_id,
            recipient,
            amount: input.amount,
            memo: input.memo,
            reference: input.reference,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "paymentIntent": payment_intent.to_string(),
        }))
    }

    pub fn submit_draft_intent(&self, input: IntentActionInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let payment_intent = self.derive_intent_pda(&policy, input.intent_id);

        let accounts = program_accounts::SubmitDraftIntent {
            submitter: self.authority,
            policy,
            payment_intent,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: program_instruction::SubmitDraftIntent {}.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "paymentIntent": payment_intent.to_string(),
        }))
    }

    pub fn approve_intent(&self, input: ApproveIntentInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let payment_intent = self.derive_intent_pda(&policy, input.intent_id);

        let accounts = program_accounts::ApproveIntent {
            approver: self.authority,
            policy,
            payment_intent,
        };

        let args = program_instruction::ApproveIntent {
            approval_digest: input.approval_digest,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "paymentIntent": payment_intent.to_string(),
        }))
    }

    pub fn cancel_intent(&self, input: IntentActionInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let payment_intent = self.derive_intent_pda(&policy, input.intent_id);

        let accounts = program_accounts::CancelIntent {
            canceler: self.authority,
            policy,
            payment_intent,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: program_instruction::CancelIntent {}.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "paymentIntent": payment_intent.to_string(),
        }))
    }

    pub fn retry_intent(&self, input: IntentActionInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let payment_intent = self.derive_intent_pda(&policy, input.intent_id);

        let accounts = program_accounts::RetryIntent {
            executor: self.authority,
            policy,
            payment_intent,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: program_instruction::RetryIntent {}.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "paymentIntent": payment_intent.to_string(),
        }))
    }

    pub fn create_batch_intent(&self, input: CreateBatchInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let batch_intent = self.derive_batch_pda(&policy, input.batch_id);

        let mode = match input.mode.as_deref() {
            Some("continue-on-error") => BatchMode::ContinueOnError,
            _ => BatchMode::AbortOnError,
        };

        let accounts = program_accounts::CreateBatchIntent {
            creator: self.authority,
            policy,
            batch_intent,
            system_program: SYSTEM_PROGRAM_ID,
        };

        let args = program_instruction::CreateBatchIntent {
            batch_id: input.batch_id,
            mode,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "batchIntent": batch_intent.to_string(),
        }))
    }

    pub fn add_batch_item(&self, input: AddBatchItemInput) -> anyhow::Result<Value> {
        if input.amount == 0 {
            return Err(anyhow!("amount must be a positive integer"));
        }

        let policy = parse_pubkey(&input.policy, "policy")?;
        let batch_intent = self.derive_batch_pda(&policy, input.batch_id);
        let recipient = parse_pubkey(&input.recipient, "recipient")?;

        let accounts = program_accounts::ModifyBatchIntent {
            creator: self.authority,
            policy,
            batch_intent,
        };

        let args = program_instruction::AddBatchItem {
            intent_id: input.intent_id,
            recipient,
            amount: input.amount,
            memo: input.memo,
            reference: input.reference,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "batchIntent": batch_intent.to_string(),
        }))
    }

    pub fn submit_batch_for_approval(&self, input: BatchActionInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let batch_intent = self.derive_batch_pda(&policy, input.batch_id);

        let accounts = program_accounts::ModifyBatchIntent {
            creator: self.authority,
            policy,
            batch_intent,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: program_instruction::SubmitBatchForApproval {}.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "batchIntent": batch_intent.to_string(),
        }))
    }

    pub fn approve_batch_intent(&self, input: ApproveBatchInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let batch_intent = self.derive_batch_pda(&policy, input.batch_id);

        let accounts = program_accounts::ApproveBatchIntent {
            approver: self.authority,
            policy,
            batch_intent,
        };

        let args = program_instruction::ApproveBatchIntent {
            approval_digest: input.approval_digest,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "batchIntent": batch_intent.to_string(),
        }))
    }

    pub fn cancel_batch_intent(&self, input: BatchActionInput) -> anyhow::Result<Value> {
        let policy = parse_pubkey(&input.policy, "policy")?;
        let batch_intent = self.derive_batch_pda(&policy, input.batch_id);

        let accounts = program_accounts::CancelBatchIntent {
            canceler: self.authority,
            policy,
            batch_intent,
        };

        let signature = self.send_instruction(Instruction {
            program_id: self.program_id,
            accounts: accounts.to_account_metas(None),
            data: program_instruction::CancelBatchIntent {}.data(),
        })?;

        Ok(json!({
            "signature": signature,
            "batchIntent": batch_intent.to_string(),
        }))
    }

    fn send_instruction(&self, instruction: Instruction) -> anyhow::Result<String> {
        let recent_blockhash = self
            .rpc
            .get_latest_blockhash()
            .context("failed to get latest blockhash")?;

        let tx = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&self.authority),
            &[self.signer.as_ref()],
            recent_blockhash,
        );

        let signature = self
            .rpc
            .send_and_confirm_transaction(&tx)
            .context("failed to send and confirm transaction")?;

        Ok(signature.to_string())
    }

    fn fetch_anchor_account<T: AccountDeserialize>(&self, address: &Pubkey) -> anyhow::Result<T> {
        let data = self
            .rpc
            .get_account_data(address)
            .with_context(|| format!("failed to fetch account {}", address))?;

        let mut bytes = data.as_slice();
        T::try_deserialize(&mut bytes)
            .with_context(|| format!("failed to deserialize account {}", address))
    }
}

fn parse_pubkey(value: &str, field: &str) -> anyhow::Result<Pubkey> {
    value
        .trim()
        .parse::<Pubkey>()
        .with_context(|| format!("{field} must be a valid pubkey"))
}

fn intent_status_to_string(status: &IntentStatus) -> &'static str {
    match status {
        IntentStatus::Draft => "draft",
        IntentStatus::PendingApproval => "pending_approval",
        IntentStatus::Approved => "approved",
        IntentStatus::Submitted => "submitted",
        IntentStatus::Confirmed => "confirmed",
        IntentStatus::Failed => "failed",
        IntentStatus::Cancelled => "cancelled",
    }
}

fn batch_mode_to_string(mode: &BatchMode) -> &'static str {
    match mode {
        BatchMode::AbortOnError => "abort-on-error",
        BatchMode::ContinueOnError => "continue-on-error",
    }
}

fn batch_status_to_string(status: &BatchStatus) -> &'static str {
    match status {
        BatchStatus::Draft => "draft",
        BatchStatus::PendingApproval => "pending_approval",
        BatchStatus::Approved => "approved",
        BatchStatus::Cancelled => "cancelled",
    }
}

fn batch_item_status_to_string(status: &BatchItemStatus) -> &'static str {
    match status {
        BatchItemStatus::Draft => "draft",
        BatchItemStatus::PendingApproval => "pending_approval",
        BatchItemStatus::Approved => "approved",
        BatchItemStatus::Cancelled => "cancelled",
    }
}

fn policy_to_json(address: Pubkey, policy: &PolicyAccount) -> Value {
    json!({
        "address": address.to_string(),
        "authority": policy.authority.to_string(),
        "mint": policy.mint.to_string(),
        "amountLimit": policy.amount_limit,
        "requireRecipientWhitelist": policy.require_recipient_whitelist,
        "allowedRecipient": policy.allowed_recipient.to_string(),
        "requireMemo": policy.require_memo,
        "bump": policy.bump,
    })
}

fn intent_to_json(address: Pubkey, intent: &PaymentIntent) -> Value {
    json!({
        "address": address.to_string(),
        "policy": intent.policy.to_string(),
        "creator": intent.creator.to_string(),
        "recipient": intent.recipient.to_string(),
        "mint": intent.mint.to_string(),
        "amount": intent.amount,
        "memo": intent.memo,
        "reference": intent.reference,
        "status": intent_status_to_string(&intent.status),
        "approver": intent.approver.to_string(),
        "approvalDigest": intent.approval_digest,
        "executionSignature": intent.execution_signature,
        "failureReason": intent.failure_reason,
        "retryCount": intent.retry_count,
        "createdAt": intent.created_at,
        "updatedAt": intent.updated_at,
    })
}

fn batch_to_json(address: Pubkey, batch: &BatchIntent) -> Value {
    let items = batch
        .items
        .iter()
        .map(|item| {
            json!({
                "intentId": item.intent_id,
                "recipient": item.recipient.to_string(),
                "amount": item.amount,
                "memo": item.memo,
                "reference": item.reference,
                "status": batch_item_status_to_string(&item.status),
            })
        })
        .collect::<Vec<Value>>();

    json!({
        "address": address.to_string(),
        "policy": batch.policy.to_string(),
        "creator": batch.creator.to_string(),
        "batchId": batch.batch_id,
        "mode": batch_mode_to_string(&batch.mode),
        "status": batch_status_to_string(&batch.status),
        "items": items,
        "approvalDigest": batch.approval_digest,
        "createdAt": batch.created_at,
        "updatedAt": batch.updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_mapping_is_stable() {
        assert_eq!(intent_status_to_string(&IntentStatus::Draft), "draft");
        assert_eq!(
            batch_mode_to_string(&BatchMode::ContinueOnError),
            "continue-on-error"
        );
        assert_eq!(
            batch_status_to_string(&BatchStatus::PendingApproval),
            "pending_approval"
        );
        assert_eq!(
            batch_item_status_to_string(&BatchItemStatus::Approved),
            "approved"
        );
    }
}
