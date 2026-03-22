import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';
import { StripeProvider } from './payments/stripe.js';
import { TossProvider } from './payments/toss.js';
import { PaddleProvider } from './payments/paddle.js';
import type { PaymentProvider, WebhookEvent } from './payments/types.js';

const providers: Record<string, PaymentProvider> = {
  stripe: new StripeProvider(),
  toss: new TossProvider(),
  paddle: new PaddleProvider(),
};

const router = Router();

// Create checkout session
router.post('/api/payments/create-checkout', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { provider: providerName, successUrl, cancelUrl } = req.body;
  const providerKey = providerName || 'stripe';
  const provider = providers[providerKey];
  if (!provider) {
    res.status(400).json({ error: `Unknown provider: ${providerKey}` });
    return;
  }

  try {
    const priceId = process.env.STRIPE_PRICE_ID || '';
    const result = await provider.createCheckoutSession(
      req.user!.id,
      priceId,
      successUrl,
      cancelUrl,
      req.user!.email
    );
    res.json(result);
  } catch (err: any) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get subscription status
router.get('/api/payments/subscription', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', req.user!.id)
    .in('status', ['active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  res.json({ subscription: data });
});

// Cancel subscription
router.post('/api/payments/cancel', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', req.user!.id)
    .eq('status', 'active')
    .single();

  if (!sub) {
    res.status(404).json({ error: 'No active subscription' });
    return;
  }

  const provider = providers[sub.provider];
  if (!provider) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }

  try {
    await provider.cancelSubscription(sub.provider_subscription_id);
    await supabaseAdmin
      .from('subscriptions')
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq('id', sub.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook handler helper
async function handleWebhookEvent(event: WebhookEvent, providerName: string) {
  if (!event.userId || !event.subscriptionId) return;

  if (event.type.includes('created') || event.type.includes('updated')) {
    await supabaseAdmin.from('subscriptions').upsert({
      id: `${providerName}_${event.subscriptionId}`,
      user_id: event.userId,
      provider: providerName,
      status: event.status || 'active',
      provider_subscription_id: event.subscriptionId,
      current_period_end: event.currentPeriodEnd?.toISOString(),
      cancel_at_period_end: event.cancelAtPeriodEnd || false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    // Update profile tier
    const newTier = event.status === 'active' ? 'pro' : 'free';
    await supabaseAdmin.from('profiles').update({ tier: newTier }).eq('id', event.userId);

  } else if (event.type.includes('deleted') || event.type.includes('canceled')) {
    await supabaseAdmin.from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('provider_subscription_id', event.subscriptionId);

    await supabaseAdmin.from('profiles').update({ tier: 'free' }).eq('id', event.userId);
  }
}

// Stripe webhook
router.post('/api/webhooks/stripe', async (req, res) => {
  try {
    const event = await providers.stripe.handleWebhook(
      req.body as Buffer,
      req.headers['stripe-signature'] as string
    );
    await handleWebhookEvent(event, 'stripe');
    res.json({ received: true });
  } catch (err: any) {
    console.error('Stripe webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Toss webhook
router.post('/api/webhooks/toss', async (req, res) => {
  try {
    const event = await providers.toss.handleWebhook(
      req.body as Buffer,
      req.headers['x-toss-signature'] as string || ''
    );
    await handleWebhookEvent(event, 'toss');
    res.json({ received: true });
  } catch (err: any) {
    console.error('Toss webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Paddle webhook
router.post('/api/webhooks/paddle', async (req, res) => {
  try {
    const event = await providers.paddle.handleWebhook(
      req.body as Buffer,
      req.headers['paddle-signature'] as string || ''
    );
    await handleWebhookEvent(event, 'paddle');
    res.json({ received: true });
  } catch (err: any) {
    console.error('Paddle webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

export default router;
