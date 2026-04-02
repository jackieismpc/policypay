use anchor_lang::prelude::*;

use crate::constants::{
    MAX_BATCH_ITEMS, MAX_FAILURE_REASON_LEN, MAX_MEMO_LEN, MAX_REFERENCE_LEN, MAX_SIGNATURE_LEN,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum IntentStatus {
    Draft,
    PendingApproval,
    Approved,
    Submitted,
    Confirmed,
    Failed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum BatchMode {
    AbortOnError,
    ContinueOnError,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum BatchStatus {
    Draft,
    PendingApproval,
    Approved,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum BatchItemStatus {
    Draft,
    PendingApproval,
    Approved,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct BatchIntentItem {
    pub intent_id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    #[max_len(MAX_MEMO_LEN)]
    pub memo: String,
    #[max_len(MAX_REFERENCE_LEN)]
    pub reference: String,
    pub status: BatchItemStatus,
}

#[account]
#[derive(InitSpace)]
pub struct PolicyAccount {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub amount_limit: u64,
    pub require_recipient_whitelist: bool,
    pub allowed_recipient: Pubkey,
    pub require_memo: bool,
    pub bump: u8,
}

impl PolicyAccount {
    pub const SEED_PREFIX: &'static [u8] = b"policy";
}

#[account]
#[derive(InitSpace)]
pub struct PaymentIntent {
    pub policy: Pubkey,
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    #[max_len(MAX_MEMO_LEN)]
    pub memo: String,
    #[max_len(MAX_REFERENCE_LEN)]
    pub reference: String,
    pub status: IntentStatus,
    pub approver: Pubkey,
    pub approval_digest: [u8; 32],
    #[max_len(MAX_SIGNATURE_LEN)]
    pub execution_signature: String,
    #[max_len(MAX_FAILURE_REASON_LEN)]
    pub failure_reason: String,
    pub retry_count: u8,
    pub bump: u8,
    pub created_at: i64,
    pub updated_at: i64,
}

impl PaymentIntent {
    pub const SEED_PREFIX: &'static [u8] = b"intent";
    pub const MAX_RETRY_COUNT: u8 = 3;
}

#[account]
#[derive(InitSpace)]
pub struct BatchIntent {
    pub policy: Pubkey,
    pub creator: Pubkey,
    pub batch_id: u64,
    pub mode: BatchMode,
    pub status: BatchStatus,
    #[max_len(MAX_BATCH_ITEMS)]
    pub items: Vec<BatchIntentItem>,
    pub approval_digest: [u8; 32],
    pub bump: u8,
    pub created_at: i64,
    pub updated_at: i64,
}

impl BatchIntent {
    pub const SEED_PREFIX: &'static [u8] = b"batch";
}
