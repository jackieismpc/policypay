use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;

declare_id!("Hb5rCLerZEYj1HReMnw1utKCpVEEemDPbed2cmDStbRw");

#[program]
pub mod policy_pay {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
