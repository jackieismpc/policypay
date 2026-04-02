use anchor_lang::prelude::*;

#[error_code]
pub enum PolicyPayError {
    #[msg("Unauthorized action")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Memo is required by policy")]
    MemoRequired,
    #[msg("Intent mint does not match policy mint")]
    MintMismatch,
    #[msg("Recipient is not in whitelist")]
    WhitelistViolation,
    #[msg("Invalid status transition")]
    InvalidStatusTransition,
    #[msg("Input text exceeds allowed length")]
    TextTooLong,
    #[msg("Execution signature cannot be empty")]
    EmptyExecutionSignature,
    #[msg("Failure reason is required when settling as failed")]
    MissingFailureReason,
    #[msg("Retry limit has been reached")]
    RetryLimitReached,
    #[msg("Policy and intent do not match")]
    PolicyMismatch,
    #[msg("Allowed recipient must be set when whitelist is enabled")]
    MissingAllowedRecipient,
    #[msg("Batch operation is not allowed in current state")]
    InvalidBatchState,
    #[msg("Batch cannot be submitted without items")]
    EmptyBatch,
    #[msg("Batch item limit reached")]
    BatchItemLimitReached,
    #[msg("Batch already contains this intent id")]
    DuplicateBatchIntentId,
}
