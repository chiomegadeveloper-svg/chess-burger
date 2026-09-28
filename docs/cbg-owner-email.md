# CBG owner email alerts

When a buyer submits a QRPh payment reference, the purchase API records the pending order and sends one email to both owners. The subject is `SALE @ Chess Burger App - URGENT`. The message includes the buyer, CBG amount, peso amount, six reference digits, order ID, and a reminder to verify payment before approving.

## Production setup

1. Verify a sending domain with [Resend](https://resend.com/domains). A personal Gmail address cannot be used as the sender unless Resend has verified a domain that you control. The owner Gmail addresses are recipients.
2. Create a Resend API key and add these **server-side** environment variables to the Vercel `chess-burger` project for Production:
   - `RESEND_API_KEY`: the secret Resend API key.
   - `CBG_ALERT_FROM_EMAIL`: a sender on the verified domain, for example `Chess Burger <sales@your-verified-domain.example>`.
3. Redeploy after setting the variables. Submit a test CBG order and confirm receipt at both `alota.bobbie.2026@gmail.com` and `chiomegadeveloper@gmail.com`.

Never put the API key in a `VITE_` variable or commit it. If delivery fails, the order remains pending in Owner CMS > CBG Editor; the server logs `cbg.owner-alert.failed` with its order ID. A buyer retry cannot submit the same pending order twice. Resend also receives an idempotency key based on the order ID.
