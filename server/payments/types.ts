export interface WebhookEvent {
  type: string;
  userId?: string;
  subscriptionId?: string;
  status?: string;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

export interface PaymentProvider {
  createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    customerEmail?: string
  ): Promise<{ url: string }>;

  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;

  cancelSubscription(subscriptionId: string): Promise<void>;
}
