# SumUp rollout checklist

The integration is intentionally fail-safe: `ONLINE_PAYMENT_PROVIDER` defaults to `stripe`, so deploying the code alone does not switch the live checkout.

## Before the maintenance window

- Keep the Railway changes staged; do not deploy them on a normal ordering day.
- Keep every existing Stripe variable in Railway.
- Confirm that `SUPABASE_SERVICE_ROLE_KEY` is present in Railway before deploying the server-only order access changes.
- Apply only `supabase/migrations/20261117220705_add_provider_neutral_payment_references.sql` first. It only adds provider-neutral payment fields and is safe while the current Stripe version remains live. The connected production project currently reports no migration history, so apply it deliberately; do not run a blanket `db push` until that history is reconciled.
- Deploy the application with `ONLINE_PAYMENT_PROVIDER=stripe` and verify that checkout, webhook, subsidy status, admin orders and reports still work.
- Then apply `supabase/migrations/20261117220706_restrict_order_data_to_server.sql` to remove direct browser access to orders, order lines and customers, plus public writes to products and daily menus. Never apply this second migration before the server-only application code is deployed.
- Before and after that second migration, verify order creation, subsidy status, Stripe webhook, admin orders/reports, product/menu editing and public catalog reads. Confirm with SQL that `anon` and `authenticated` no longer have the revoked sensitive privileges.
- In an isolated preview/sandbox environment, use a separate Supabase project, disable real email delivery (or use a test sink), and set `APP_URL` to the preview domain. Never point a SumUp sandbox test at the production database.
- In that preview environment, set:
  - `ONLINE_PAYMENT_PROVIDER=sumup`
  - `SUMUP_ENVIRONMENT=sandbox`
  - `SUMUP_ALLOW_SANDBOX_IN_PRODUCTION=true` (preview only; Railway still blocks sandbox when the environment itself is named `production`)
  - `SUMUP_SANDBOX_API_KEY`
  - `SUMUP_SANDBOX_MERCHANT_CODE`
- Test successful, failed, abandoned, expired, duplicated-webhook and 3DS payments.

## Production cutover (Friday to Sunday only)

1. Complete the two-stage database/application rollout above while Stripe remains active.
2. Create a production SumUp API key and store it only in Railway.
3. Add `SUMUP_PRODUCTION_API_KEY` and `SUMUP_PRODUCTION_MERCHANT_CODE`.
4. Set `SUMUP_ENVIRONMENT=production` and keep `SUMUP_ALLOW_SANDBOX_IN_PRODUCTION=false` while leaving `ONLINE_PAYMENT_PROVIDER=stripe`.
5. Verify the production SumUp credentials server-side.
6. Set `ONLINE_PAYMENT_PROVIDER=sumup` and deploy.
7. Complete one low-value real order and verify:
   - SumUp checkout opens.
   - The webhook reaches `/api/sumup/webhook`.
   - The order changes from `pendiente_pago` to `nuevo` only after SumUp reports `PAID`.
   - The order appears in admin/reports and the confirmation email is sent once.
8. Monitor failed/pending payments and application logs during the window.

## Immediate rollback

Set `ONLINE_PAYMENT_PROVIDER=stripe` and redeploy. Do not delete or rotate Stripe credentials during the transition. Existing Stripe orders and identifiers remain intact.

After `20261117220706_restrict_order_data_to_server.sql` has been applied, the new server-only database client is the minimum safe application version. Do not roll back to an older commit that uses the public Supabase client for orders unless the revoked permissions are deliberately restored first. Switching the provider back to Stripe on the new code remains safe.

## After stabilization

- Keep Stripe available as rollback for an agreed observation period.
- Reconcile SumUp payouts and refunds before removing any Stripe-only UI or credentials.
- Never treat the browser redirect as proof of payment; only a server-side checkout retrieval with status `PAID` confirms the order.
