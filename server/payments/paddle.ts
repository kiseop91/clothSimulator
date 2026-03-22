import type { PaymentProvider, WebhookEvent } from './types.js';
import crypto from 'crypto';

const apiKey = process.env.PADDLE_API_KEY || '';
const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET || '';

export class PaddleProvider implements PaymentProvider {
  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    _cancelUrl: string,
    customerEmail?: string
  ): Promise<{ url: string }> {
    // Paddle API v2: create a transaction
    const res = await fetch('https://api.paddle.com/transactions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: { userId },
        customer_email: customerEmail,
        checkout: {
          settings: {
            success_url: successUrl,
          },
        },
      }),
    });
    const data = await res.json();
    return { url: data.data?.checkout?.url || successUrl };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    // Verify Paddle webhook signature
    const body = rawBody.toString();
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    if (signature !== expectedSig) {
      throw new Error('Invalid Paddle webhook signature');
    }

    const event = JSON.parse(body);
    const eventType = event.event_type;
    const data = event.data;

    switch (eventType) {
      case 'subscription.created':
      case 'subscription.updated':
        return {
          type: eventType,
          userId: data.custom_data?.userId,
          subscriptionId: data.id,
          status: data.status === 'active' ? 'active' : data.status === 'past_due' ? 'past_due' : 'canceled',
          currentPeriodEnd: data.current_billing_period?.ends_at ? new Date(data.current_billing_period.ends_at) : undefined,
          cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
        };
      case 'subscription.canceled':
        return {
          type: eventType,
          userId: data.custom_data?.userId,
          subscriptionId: data.id,
          status: 'canceled',
        };
      default:
        return { type: eventType };
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await fetch(`https://api.paddle.com/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ effective_from: 'next_billing_period' }),
    });
  }
}
