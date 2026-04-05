#![allow(clippy::diverging_sub_expression)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;

use constants::{
    MAX_BATCH_ITEMS, MAX_FAILURE_REASON_LEN, MAX_MEMO_LEN, MAX_REFERENCE_LEN, MAX_SIGNATURE_LEN,
};
use errors::PolicyPayError;
use state::{
    BatchIntent, BatchIntentItem, BatchItemStatus, BatchMode, BatchStatus, IntentStatus,
    PaymentIntent, PolicyAccount,
};

declare_id!("2uJf3sxUpHXS7QR2thzUWmjnznhcDvnE7H87eDBJLUps");

#[program]
pub mod policy_pay {
    use super::*;

    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        mint: Pubkey,
        amount_limit: u64,
        require_recipient_whitelist: bool,
        allowed_recipient: Pubkey,
        require_memo: bool,
    ) -> Result<()> {
        require!(amount_limit > 0, PolicyPayError::InvalidAmount);

        if require_recipient_whitelist {
            require!(
                allowed_recipient != Pubkey::default(),
                PolicyPayError::MissingAllowedRecipient
            );
        }

        let policy = &mut ctx.accounts.policy;
        policy.authority = ctx.accounts.authority.key();
        policy.mint = mint;
        policy.amount_limit = amount_limit;
        policy.require_recipient_whitelist = require_recipient_whitelist;
        policy.allowed_recipient = allowed_recipient;
        policy.require_memo = require_memo;
        policy.bump = ctx.bumps.policy;

        Ok(())
    }

    pub fn create_intent(
        ctx: Context<CreateIntent>,
        intent_id: u64,
        recipient: Pubkey,
        amount: u64,
        memo: String,
        reference: String,
    ) -> Result<()> {
        let _ = intent_id;

        let policy = &ctx.accounts.policy;
        validate_intent_inputs(policy, recipient, amount, &memo, &reference)?;

        let now = Clock::get()?.unix_timestamp;
        let payment_intent = &mut ctx.accounts.payment_intent;

        payment_intent.policy = policy.key();
        payment_intent.creator = ctx.accounts.creator.key();
        payment_intent.recipient = recipient;
        payment_intent.mint = policy.mint;
        payment_intent.amount = amount;
        payment_intent.memo = memo;
        payment_intent.reference = reference;
        payment_intent.status = IntentStatus::PendingApproval;
        payment_intent.approver = Pubkey::default();
        payment_intent.approval_digest = [0; 32];
        payment_intent.execution_signature = String::new();
        payment_intent.failure_reason = String::new();
        payment_intent.retry_count = 0;
        payment_intent.bump = ctx.bumps.payment_intent;
        payment_intent.created_at = now;
        payment_intent.updated_at = now;

        Ok(())
    }

    pub fn create_draft_intent(
        ctx: Context<CreateIntent>,
        intent_id: u64,
        recipient: Pubkey,
        amount: u64,
        memo: String,
        reference: String,
    ) -> Result<()> {
        let _ = intent_id;

        let policy = &ctx.accounts.policy;
        validate_intent_inputs(policy, recipient, amount, &memo, &reference)?;

        let now = Clock::get()?.unix_timestamp;
        let payment_intent = &mut ctx.accounts.payment_intent;

        payment_intent.policy = policy.key();
        payment_intent.creator = ctx.accounts.creator.key();
        payment_intent.recipient = recipient;
        payment_intent.mint = policy.mint;
        payment_intent.amount = amount;
        payment_intent.memo = memo;
        payment_intent.reference = reference;
        payment_intent.status = IntentStatus::Draft;
        payment_intent.approver = Pubkey::default();
        payment_intent.approval_digest = [0; 32];
        payment_intent.execution_signature = String::new();
        payment_intent.failure_reason = String::new();
        payment_intent.retry_count = 0;
        payment_intent.bump = ctx.bumps.payment_intent;
        payment_intent.created_at = now;
        payment_intent.updated_at = now;

        Ok(())
    }

    pub fn submit_draft_intent(ctx: Context<SubmitDraftIntent>) -> Result<()> {
        let actor = ctx.accounts.submitter.key();
        let payment_intent = &mut ctx.accounts.payment_intent;

        require!(
            actor == payment_intent.creator || actor == ctx.accounts.policy.authority,
            PolicyPayError::Unauthorized
        );
        require!(
            payment_intent.status == IntentStatus::Draft,
            PolicyPayError::InvalidStatusTransition
        );

        payment_intent.status = IntentStatus::PendingApproval;
        payment_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn create_batch_intent(
        ctx: Context<CreateBatchIntent>,
        batch_id: u64,
        mode: BatchMode,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let batch_intent = &mut ctx.accounts.batch_intent;

        batch_intent.policy = ctx.accounts.policy.key();
        batch_intent.creator = ctx.accounts.creator.key();
        batch_intent.batch_id = batch_id;
        batch_intent.mode = mode;
        batch_intent.status = BatchStatus::Draft;
        batch_intent.items = Vec::new();
        batch_intent.approval_digest = [0; 32];
        batch_intent.bump = ctx.bumps.batch_intent;
        batch_intent.created_at = now;
        batch_intent.updated_at = now;

        Ok(())
    }

    pub fn add_batch_item(
        ctx: Context<ModifyBatchIntent>,
        intent_id: u64,
        recipient: Pubkey,
        amount: u64,
        memo: String,
        reference: String,
    ) -> Result<()> {
        let batch_intent = &mut ctx.accounts.batch_intent;
        let policy = &ctx.accounts.policy;

        require!(
            batch_intent.status == BatchStatus::Draft,
            PolicyPayError::InvalidBatchState
        );
        require!(
            batch_intent.items.len() < MAX_BATCH_ITEMS,
            PolicyPayError::BatchItemLimitReached
        );
        require!(
            !batch_intent
                .items
                .iter()
                .any(|item| item.intent_id == intent_id),
            PolicyPayError::DuplicateBatchIntentId
        );

        validate_intent_inputs(policy, recipient, amount, &memo, &reference)?;

        batch_intent.items.push(BatchIntentItem {
            intent_id,
            recipient,
            amount,
            memo,
            reference,
            status: BatchItemStatus::Draft,
        });
        batch_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn submit_batch_for_approval(ctx: Context<ModifyBatchIntent>) -> Result<()> {
        let batch_intent = &mut ctx.accounts.batch_intent;

        require!(
            batch_intent.status == BatchStatus::Draft,
            PolicyPayError::InvalidBatchState
        );
        require!(!batch_intent.items.is_empty(), PolicyPayError::EmptyBatch);

        batch_intent.status = BatchStatus::PendingApproval;
        batch_intent
            .items
            .iter_mut()
            .for_each(|item| item.status = BatchItemStatus::PendingApproval);
        batch_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn approve_batch_intent(
        ctx: Context<ApproveBatchIntent>,
        approval_digest: [u8; 32],
    ) -> Result<()> {
        ensure_authority(ctx.accounts.approver.key(), ctx.accounts.policy.authority)?;

        let batch_intent = &mut ctx.accounts.batch_intent;
        require!(
            batch_intent.status == BatchStatus::PendingApproval,
            PolicyPayError::InvalidBatchState
        );

        batch_intent.status = BatchStatus::Approved;
        batch_intent.approval_digest = approval_digest;
        batch_intent
            .items
            .iter_mut()
            .for_each(|item| item.status = BatchItemStatus::Approved);
        batch_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn cancel_batch_intent(ctx: Context<CancelBatchIntent>) -> Result<()> {
        let actor = ctx.accounts.canceler.key();
        let batch_intent = &mut ctx.accounts.batch_intent;

        require!(
            actor == batch_intent.creator || actor == ctx.accounts.policy.authority,
            PolicyPayError::Unauthorized
        );
        require!(
            batch_intent.status == BatchStatus::Draft
                || batch_intent.status == BatchStatus::PendingApproval
                || batch_intent.status == BatchStatus::Approved,
            PolicyPayError::InvalidBatchState
        );

        batch_intent.status = BatchStatus::Cancelled;
        batch_intent
            .items
            .iter_mut()
            .for_each(|item| item.status = BatchItemStatus::Cancelled);
        batch_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn approve_intent(ctx: Context<ApproveIntent>, approval_digest: [u8; 32]) -> Result<()> {
        ensure_authority(ctx.accounts.approver.key(), ctx.accounts.policy.authority)?;

        let payment_intent = &mut ctx.accounts.payment_intent;
        require!(
            payment_intent.status == IntentStatus::PendingApproval,
            PolicyPayError::InvalidStatusTransition
        );

        payment_intent.status = IntentStatus::Approved;
        payment_intent.approver = ctx.accounts.approver.key();
        payment_intent.approval_digest = approval_digest;
        payment_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn execute_intent(ctx: Context<ExecuteIntent>, tx_signature: String) -> Result<()> {
        ensure_authority(ctx.accounts.executor.key(), ctx.accounts.policy.authority)?;
        validate_signature(&tx_signature)?;

        let payment_intent = &mut ctx.accounts.payment_intent;
        require!(
            payment_intent.status == IntentStatus::Approved,
            PolicyPayError::InvalidStatusTransition
        );

        payment_intent.status = IntentStatus::Submitted;
        payment_intent.execution_signature = tx_signature;
        payment_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn settle_intent(
        ctx: Context<SettleIntent>,
        success: bool,
        failure_reason: String,
    ) -> Result<()> {
        ensure_authority(ctx.accounts.executor.key(), ctx.accounts.policy.authority)?;

        let payment_intent = &mut ctx.accounts.payment_intent;
        require!(
            payment_intent.status == IntentStatus::Submitted,
            PolicyPayError::InvalidStatusTransition
        );

        if success {
            payment_intent.status = IntentStatus::Confirmed;
            payment_intent.failure_reason = String::new();
        } else {
            validate_non_empty_text(&failure_reason, MAX_FAILURE_REASON_LEN)?;
            payment_intent.status = IntentStatus::Failed;
            payment_intent.failure_reason = failure_reason;
            payment_intent.retry_count = payment_intent
                .retry_count
                .checked_add(1)
                .ok_or(PolicyPayError::RetryLimitReached)?;
        }

        payment_intent.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn retry_intent(ctx: Context<RetryIntent>) -> Result<()> {
        ensure_authority(ctx.accounts.executor.key(), ctx.accounts.policy.authority)?;

        let payment_intent = &mut ctx.accounts.payment_intent;
        require!(
            payment_intent.status == IntentStatus::Failed,
            PolicyPayError::InvalidStatusTransition
        );
        require!(
            payment_intent.retry_count < PaymentIntent::MAX_RETRY_COUNT,
            PolicyPayError::RetryLimitReached
        );

        payment_intent.status = IntentStatus::Approved;
        payment_intent.failure_reason = String::new();
        payment_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn cancel_intent(ctx: Context<CancelIntent>) -> Result<()> {
        let canceler = ctx.accounts.canceler.key();
        let payment_intent = &mut ctx.accounts.payment_intent;

        require!(
            canceler == payment_intent.creator || canceler == ctx.accounts.policy.authority,
            PolicyPayError::Unauthorized
        );
        require!(
            payment_intent.status == IntentStatus::PendingApproval
                || payment_intent.status == IntentStatus::Draft
                || payment_intent.status == IntentStatus::Approved,
            PolicyPayError::InvalidStatusTransition
        );

        payment_intent.status = IntentStatus::Cancelled;
        payment_intent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct CreatePolicy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + PolicyAccount::INIT_SPACE,
        seeds = [PolicyAccount::SEED_PREFIX, authority.key().as_ref(), mint.as_ref()],
        bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(intent_id: u64)]
pub struct CreateIntent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + PaymentIntent::INIT_SPACE,
        seeds = [PaymentIntent::SEED_PREFIX, policy.key().as_ref(), &intent_id.to_le_bytes()],
        bump
    )]
    pub payment_intent: Account<'info, PaymentIntent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitDraftIntent<'info> {
    pub submitter: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub payment_intent: Account<'info, PaymentIntent>,
}

#[derive(Accounts)]
#[instruction(batch_id: u64)]
pub struct CreateBatchIntent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + BatchIntent::INIT_SPACE,
        seeds = [BatchIntent::SEED_PREFIX, policy.key().as_ref(), &batch_id.to_le_bytes()],
        bump
    )]
    pub batch_intent: Account<'info, BatchIntent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyBatchIntent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(
        mut,
        has_one = policy @ PolicyPayError::PolicyMismatch,
        constraint = batch_intent.creator == creator.key() @ PolicyPayError::Unauthorized
    )]
    pub batch_intent: Account<'info, BatchIntent>,
}

#[derive(Accounts)]
pub struct ApproveBatchIntent<'info> {
    #[account(mut)]
    pub approver: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub batch_intent: Account<'info, BatchIntent>,
}

#[derive(Accounts)]
pub struct CancelBatchIntent<'info> {
    pub canceler: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub batch_intent: Account<'info, BatchIntent>,
}

#[derive(Accounts)]
pub struct ApproveIntent<'info> {
    #[account(mut)]
    pub approver: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub payment_intent: Account<'info, PaymentIntent>,
}

#[derive(Accounts)]
pub struct ExecuteIntent<'info> {
    pub executor: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub payment_intent: Account<'info, PaymentIntent>,
}

#[derive(Accounts)]
pub struct SettleIntent<'info> {
    pub executor: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub payment_intent: Account<'info, PaymentIntent>,
}

#[derive(Accounts)]
pub struct RetryIntent<'info> {
    pub executor: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub payment_intent: Account<'info, PaymentIntent>,
}

#[derive(Accounts)]
pub struct CancelIntent<'info> {
    pub canceler: Signer<'info>,
    #[account(
        seeds = [
            PolicyAccount::SEED_PREFIX,
            policy.authority.as_ref(),
            policy.mint.as_ref()
        ],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    #[account(mut, has_one = policy @ PolicyPayError::PolicyMismatch)]
    pub payment_intent: Account<'info, PaymentIntent>,
}

fn ensure_authority(actor: Pubkey, authority: Pubkey) -> Result<()> {
    require_keys_eq!(actor, authority, PolicyPayError::Unauthorized);
    Ok(())
}

fn validate_intent_inputs(
    policy: &PolicyAccount,
    recipient: Pubkey,
    amount: u64,
    memo: &str,
    reference: &str,
) -> Result<()> {
    require!(amount > 0, PolicyPayError::InvalidAmount);
    require!(amount <= policy.amount_limit, PolicyPayError::InvalidAmount);

    validate_text(memo, MAX_MEMO_LEN)?;
    validate_text(reference, MAX_REFERENCE_LEN)?;

    if policy.require_memo {
        require!(!memo.trim().is_empty(), PolicyPayError::MemoRequired);
    }

    if policy.require_recipient_whitelist {
        require!(
            recipient == policy.allowed_recipient,
            PolicyPayError::WhitelistViolation
        );
    }

    Ok(())
}

fn validate_text(value: &str, max_len: usize) -> Result<()> {
    require!(value.len() <= max_len, PolicyPayError::TextTooLong);
    Ok(())
}

fn validate_non_empty_text(value: &str, max_len: usize) -> Result<()> {
    require!(
        !value.trim().is_empty(),
        PolicyPayError::MissingFailureReason
    );
    validate_text(value, max_len)
}

fn validate_signature(signature: &str) -> Result<()> {
    require!(
        !signature.trim().is_empty(),
        PolicyPayError::EmptyExecutionSignature
    );
    validate_text(signature, MAX_SIGNATURE_LEN)
}

#[cfg(test)]
mod tests {
    use super::*;
    use state::PolicyAccount;

    fn mock_policy() -> PolicyAccount {
        PolicyAccount {
            authority: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            amount_limit: 500,
            require_recipient_whitelist: true,
            allowed_recipient: Pubkey::new_unique(),
            require_memo: true,
            bump: 255,
        }
    }

    #[test]
    fn authority_check_requires_exact_match() {
        let authority = Pubkey::new_unique();

        assert!(ensure_authority(authority, authority).is_ok());
        assert!(ensure_authority(Pubkey::new_unique(), authority).is_err());
    }

    #[test]
    fn text_validation_enforces_max_length() {
        assert!(validate_text("ok", 4).is_ok());
        assert!(validate_text("too-long", 3).is_err());
    }

    #[test]
    fn non_empty_text_rejects_blank_or_too_long() {
        assert!(validate_non_empty_text("failure", 16).is_ok());
        assert!(validate_non_empty_text("   ", 16).is_err());
        assert!(validate_non_empty_text("x".repeat(20).as_str(), 10).is_err());
    }

    #[test]
    fn signature_validation_requires_non_empty_and_bounded_text() {
        assert!(validate_signature("sig-001").is_ok());
        assert!(validate_signature(" ").is_err());
        assert!(validate_signature("x".repeat(MAX_SIGNATURE_LEN + 1).as_str()).is_err());
    }

    #[test]
    fn intent_input_validation_requires_policy_constraints() {
        let policy = mock_policy();

        assert!(validate_intent_inputs(
            &policy,
            policy.allowed_recipient,
            100,
            "invoice-001",
            "ref-001"
        )
        .is_ok());
        assert!(validate_intent_inputs(
            &policy,
            Pubkey::new_unique(),
            100,
            "invoice-001",
            "ref-001"
        )
        .is_err());
        assert!(validate_intent_inputs(
            &policy,
            policy.allowed_recipient,
            0,
            "invoice-001",
            "ref-001"
        )
        .is_err());
        assert!(
            validate_intent_inputs(&policy, policy.allowed_recipient, 100, "   ", "ref-001")
                .is_err()
        );
    }
}
