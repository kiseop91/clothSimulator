import Stripe from 'stripe';
import type { PaymentProvider, WebhookEvent } from './types.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-04-30.basil' });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export class StripeProvider implements PaymentProvider {
  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    customerEmail?: string
  ): Promise<{ url: string }> {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      customer_email: customerEmail,
      metadata: { userId },
    });

    return { url: session.url! };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        return {
          type: event.type,
          userId: sub.metadata.userId,
          subscriptionId: sub.id,
          status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        };
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        return {
          type: event.type,
          userId: sub.metadata.userId,
          subscriptionId: sub.id,
          status: 'canceled',
        };
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          type: event.type,
          userId: (invoice as any).subscription_details?.metadata?.userId,
          status: 'past_due',
        };
      }
      default:
        return { type: event.type };
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }
}
