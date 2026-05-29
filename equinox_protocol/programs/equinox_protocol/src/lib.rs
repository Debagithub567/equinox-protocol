use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::{self, Token2022};
use spl_token_2022::extension::interest_bearing_mint::instruction as interest_ix;

declare_id!("CDN8JEfQibSy7RTzJacy8eXHrVTpGFTXmCqGAiZqASZ5");

const VAULT_SEED: &[u8] = b"vault_config";
const SOL_VAULT_SEED: &[u8] = b"sol_vault";
const SUSD_DECIMALS: u8 = 6;

#[program]
pub mod equinox_protocol {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        initial_rate_bps: i16,
    ) -> Result<()> {
        // Rate authority = vault PDA so it can update rates via invoke_signed
        let rate_ix = interest_ix::initialize(
            &token_2022::ID,
            &ctx.accounts.susd_mint.key(),
            Some(ctx.accounts.vault_config.key()), // ← vault PDA, not admin
            initial_rate_bps,
        )?;
        anchor_lang::solana_program::program::invoke(
            &rate_ix,
            &[
                ctx.accounts.susd_mint.to_account_info(),
                ctx.accounts.vault_config.to_account_info(), // ← vault PDA as authority
            ],
        )?;

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::InitializeMint2 {
                mint: ctx.accounts.susd_mint.to_account_info(),
            },
        );
        token_2022::initialize_mint2(
            cpi_ctx,
            SUSD_DECIMALS,
            &ctx.accounts.vault_config.key(),
            Some(&ctx.accounts.vault_config.key()),
        )?;

        let config = &mut ctx.accounts.vault_config;
        config.admin = ctx.accounts.admin.key();
        config.rate_keeper = ctx.accounts.admin.key();
        config.susd_mint = ctx.accounts.susd_mint.key();
        config.current_apy_bps = initial_rate_bps;
        config.bump = ctx.bumps.vault_config;

        msg!(
            "✅ Vault initialized | Mint: {} | APY BPS: {}",
            ctx.accounts.susd_mint.key(),
            initial_rate_bps
        );
        Ok(())
    }

    pub fn deposit_asset(ctx: Context<DepositAsset>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, EquinoxError::ZeroDeposit);

        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
        );
        system_program::transfer(transfer_ctx, amount_lamports)?;

        let sol_usd_price: u64 = 150;
        let susd_to_mint = amount_lamports
            .checked_div(1_000_000_000)
            .ok_or(EquinoxError::MathOverflow)?
            .checked_mul(sol_usd_price)
            .ok_or(EquinoxError::MathOverflow)?
            .checked_mul(10u64.pow(SUSD_DECIMALS as u32))
            .ok_or(EquinoxError::MathOverflow)?;

        msg!(
            "🔀 MOCK PERP: Opening 1x SHORT | size={} lamports | price=${}",
            amount_lamports,
            sol_usd_price
        );
        msg!(
            "📊 delta_neutral=true | funding_rate_bps={}",
            ctx.accounts.vault_config.current_apy_bps
        );

        let bump = ctx.accounts.vault_config.bump;
        let seeds = &[VAULT_SEED, std::slice::from_ref(&bump)];
        let signer_seeds = &[&seeds[..]];

        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_2022::MintTo {
                mint: ctx.accounts.susd_mint.to_account_info(),
                to: ctx.accounts.user_susd_account.to_account_info(),
                authority: ctx.accounts.vault_config.to_account_info(),
            },
            signer_seeds,
        );
        token_2022::mint_to(mint_ctx, susd_to_mint)?;

        msg!("✅ Minted {} sUSD to {}", susd_to_mint, ctx.accounts.user.key());
        Ok(())
    }

    pub fn redeem_asset(ctx: Context<RedeemAsset>, susd_amount: u64) -> Result<()> {
        require!(susd_amount > 0, EquinoxError::ZeroDeposit);

        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::Burn {
                mint: ctx.accounts.susd_mint.to_account_info(),
                from: ctx.accounts.user_susd_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token_2022::burn(burn_ctx, susd_amount)?;

        let sol_usd_price: u64 = 150;
        let lamports_to_return = susd_amount
            .checked_div(10u64.pow(SUSD_DECIMALS as u32))
            .ok_or(EquinoxError::MathOverflow)?
            .checked_div(sol_usd_price)
            .ok_or(EquinoxError::MathOverflow)?
            .checked_mul(1_000_000_000)
            .ok_or(EquinoxError::MathOverflow)?;

        **ctx.accounts.sol_vault.try_borrow_mut_lamports()? -= lamports_to_return;
        **ctx.accounts.user.try_borrow_mut_lamports()? += lamports_to_return;

        msg!("✅ Redeemed {} sUSD → {} lamports", susd_amount, lamports_to_return);
        Ok(())
    }

    pub fn update_protocol_rate(
        ctx: Context<UpdateProtocolRate>,
        new_rate_bps: i16,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.keeper.key(),
            ctx.accounts.vault_config.rate_keeper,
            EquinoxError::UnauthorizedKeeper
        );

        let bump = ctx.accounts.vault_config.bump;
        let seeds = &[VAULT_SEED, std::slice::from_ref(&bump)];
        let signer_seeds = &[&seeds[..]];

        let rate_ix = interest_ix::update_rate(
            &token_2022::ID,
            &ctx.accounts.susd_mint.key(),
            &ctx.accounts.vault_config.key(),
            &[],
            new_rate_bps,
        )?;
        anchor_lang::solana_program::program::invoke_signed(
            &rate_ix,
            &[
                ctx.accounts.susd_mint.to_account_info(),
                ctx.accounts.vault_config.to_account_info(),
            ],
            signer_seeds,
        )?;

        ctx.accounts.vault_config.current_apy_bps = new_rate_bps;
        msg!("⚡ Rate updated to {} BPS", new_rate_bps);
        Ok(())
    }
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct VaultConfig {
    pub admin: Pubkey,
    pub rate_keeper: Pubkey,
    pub susd_mint: Pubkey,
    pub current_apy_bps: i16,
    pub bump: u8,
}

impl VaultConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 2 + 1;
}

// ─── Contexts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = admin,
        space = VaultConfig::LEN,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: Token-2022 mint — pre-allocated by client
    #[account(mut)]
    pub susd_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositAsset<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_config.bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: SOL escrow PDA
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// CHECK: Token-2022 mint verified by constraint
    #[account(
        mut,
        constraint = susd_mint.key() == vault_config.susd_mint @ EquinoxError::InvalidMint
    )]
    pub susd_mint: UncheckedAccount<'info>,

    /// CHECK: User's sUSD ATA — validated by token program
    #[account(mut)]
    pub user_susd_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RedeemAsset<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_config.bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: SOL escrow PDA
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// CHECK: Token-2022 mint
    #[account(
        mut,
        constraint = susd_mint.key() == vault_config.susd_mint @ EquinoxError::InvalidMint
    )]
    pub susd_mint: UncheckedAccount<'info>,

    /// CHECK: User's sUSD ATA
    #[account(mut)]
    pub user_susd_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProtocolRate<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_config.bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: Token-2022 mint
    #[account(mut)]
    pub susd_mint: UncheckedAccount<'info>,

    pub keeper: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum EquinoxError {
    #[msg("Signer is not the authorized rate keeper")]
    UnauthorizedKeeper,
    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,
    #[msg("Arithmetic overflow in calculation")]
    MathOverflow,
    #[msg("Invalid mint account")]
    InvalidMint,
}