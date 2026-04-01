use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;

use constants::{MAX_FAILURE_REASON_LEN, MAX_MEMO_LEN, MAX_REFERENCE_LEN, MAX_SIGNATURE_LEN};
use errors::PolicyPayError;
use state::{IntentStatus, PaymentIntent, PolicyAccount};

declare_id!("Hb5rCLerZEYj1HReMnw1utKCpVEEemDPbed2cmDStbRw");

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
        require!(amount > 0, PolicyPayError::InvalidAmount);
        require!(amount <= policy.amount_limit, PolicyPayError::InvalidAmount);

        validate_text(&memo, MAX_MEMO_LEN)?;
        validate_text(&reference, MAX_REFERENCE_LEN)?;

        if policy.require_memo {
            require!(!memo.trim().is_empty(), PolicyPayError::MemoRequired);
        }

        if policy.require_recipient_whitelist {
            require!(
                recipient == policy.allowed_recipient,
                PolicyPayError::WhitelistViolation
            );
        }

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
