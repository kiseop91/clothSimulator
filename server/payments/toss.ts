import type { PaymentProvider, WebhookEvent } from './types.js';

const secretKey = process.env.TOSS_SECRET_KEY || '';
const authHeader = `Basic ${Buffer.from(secretKey + ':').toString('base64')}`;

export class TossProvider implements PaymentProvider {
  async createCheckoutSession(
    userId: string,
    _priceId: string,
    successUrl: string,
    cancelUrl: string,
    customerEmail?: string
  ): Promise<{ url: string }> {
    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const amount = 9900;
    const orderName = 'Hockey Drill Studio Pro';

    // Toss standard checkout: redirect user to Toss payment page
    // The frontend will redirect to this URL, Toss handles the rest
    const sep = successUrl.includes('?') ? '&' : '?';
    const params = new URLSearchParams({
      orderId,
      amount: amount.toString(),
      orderName,
      customerKey: userId,
      successUrl: `${successUrl}${sep}orderId=${orderId}`,
      failUrl: cancelUrl,
    });

    // For test mode, use the Toss hosted checkout page directly
    const checkoutUrl = `https://pay.toss.im/order/checkout?${params.toString()}`;

    // Also try the v1 API to create a payment
    try {
      const res = await fetch('https://api.tosspayments.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: '카드',
          amount,
          orderId,
          orderName,
          successUrl: `${successUrl}${sep}orderId=${orderId}`,
          failUrl: cancelUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.checkout?.url) {
          return { url: data.checkout.url };
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.log('Toss v1 API response:', res.status, errData);
      }
    } catch (e: any) {
      console.log('Toss v1 API error:', e.message);
    }

    // Fallback: return the direct checkout URL
    return { url: checkoutUrl };
  }

  async handleWebhook(rawBody: Buffer, _signature: string): Promise<WebhookEvent> {
    const body = JSON.parse(rawBody.toString());
    return {
      type: body.eventType || 'unknown',
      userId: body.data?.metadata?.userId || body.data?.customerKey,
      subscriptionId: body.data?.paymentKey || body.data?.billingKey,
      status: body.data?.status === 'DONE' ? 'active' : 'canceled',
    };
  }

  async cancelSubscription(paymentKey: string): Promise<void> {
    await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cancelReason: '사용자 구독 해지' }),
    });
  }
}
