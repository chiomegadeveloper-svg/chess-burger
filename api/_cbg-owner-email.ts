const recipients = ['alota.bobbie.2026@gmail.com', 'chiomegadeveloper@gmail.com'];

type SubmittedOrder = {
  id: string;
  cbg_amount: number;
  amount_php: number;
  reference_last6: string;
  created_at: string;
};

export async function emailOwnersAboutCbgOrder(order: SubmittedOrder, buyer: { username?: string | null; display_name?: string | null }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CBG_ALERT_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Set RESEND_API_KEY and CBG_ALERT_FROM_EMAIL to enable owner sale alerts.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `cbg-order-${order.id}-pending`,
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: 'SALE @ Chess Burger App - URGENT',
      text: [
        'A buyer submitted a CBG payment for your review.',
        '',
        `Buyer: ${buyer.display_name || 'Chess Burger player'}${buyer.username ? ` (@${buyer.username})` : ''}`,
        `CBG ordered: ${Number(order.cbg_amount).toLocaleString('en-US')}`,
        `Amount to verify: PHP ${Number(order.amount_php).toFixed(2)}`,
        `Payment reference ending: ${order.reference_last6}`,
        `Order ID: ${order.id}`,
        `Submitted: ${order.created_at}`,
        '',
        'Open Chess Burger > Owner CMS > CBG Editor > Pending payment verification.',
        'Verify the complete payment in your QRPh/GCash account before approving. A reference number alone is not proof of payment.',
      ].join('\n'),
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`Resend rejected the owner sale alert (${response.status}).`);
}
