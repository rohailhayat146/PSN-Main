
// PSN Payment Service
// Bridges the frontend with the Stripe Backend

// Determines the backend URL based on environment
const getApiUrl = () => {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:4242/api';
  }
  return '/api'; 
};

export const paymentService = {
  /**
   * Initiates the Stripe Checkout redirection for Certification Exam.
   */
  async processExamPayment(userId: string, email?: string): Promise<void> {
    console.log(`[PaymentService] Redirecting to Stripe (Exam) for User: ${userId}`);
    await this._createCheckoutSession(userId, email, 'exam');
  },

  /**
   * Initiates the Stripe Checkout for Monthly/Yearly Subscription.
   */
  async processSubscription(userId: string, plan: 'monthly' | 'yearly', email?: string): Promise<void> {
    console.log(`[PaymentService] Redirecting to Stripe (Sub: ${plan}) for User: ${userId}`);
    await this._createCheckoutSession(userId, email, 'subscription', plan);
  },

  /**
   * Internal helper to call backend
   */
  async _createCheckoutSession(userId: string, email: string | undefined, type: 'exam' | 'subscription', plan?: 'monthly' | 'yearly'): Promise<void> {
    // Construct the absolute return URL
    const path = window.location.pathname === '/' ? '' : window.location.pathname;
    // Different return paths based on purchase type
    const returnPath = type === 'exam' ? '#/exam' : '#/'; 
    const returnUrl = `${window.location.origin}${path}${returnPath}`;

    try {
      const apiUrl = `${getApiUrl()}/create-checkout-session`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          email, 
          returnUrl,
          type,
          plan // Only used if type === 'subscription'
        })
      });

      // Handle non-JSON responses
      const contentType = response.headers.get("content-type");
      if (!contentType || contentType.indexOf("application/json") === -1) {
        throw new Error("Payment Server Error: Invalid response type.");
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create checkout session");
      }
      
      const { url } = await response.json();

      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No payment URL returned from backend");
      }

    } catch (e: any) {
      console.error("[PaymentService] Error:", e);
      throw e;
    }
  }
};
