// PSN Payment Service
// Bridges the frontend with the Stripe Backend

// Determines the backend URL based on environment
const getApiUrl = () => {
  // If we are in local development and not using Vercel Dev, we might point to a specific port
  if (window.location.hostname === 'localhost' && !window.location.port.includes('3000')) {
    return 'http://localhost:4242/api';
  }
  // Standard Vercel deployment / Vercel Dev uses relative /api path
  return '/api'; 
};

export const paymentService = {
  /**
   * Initiates the Stripe Checkout redirection for Certification Exam.
   */
  async processExamPayment(userId: string, email?: string): Promise<void> {
    if (!userId || userId === 'guest') {
      throw new Error("You must be logged in to access the Exam Hall.");
    }
    console.log(`[PaymentService] Redirecting to Stripe (Exam) for User: ${userId}`);
    await this._createCheckoutSession(userId, email, 'exam');
  },

  /**
   * Initiates the Stripe Checkout for Monthly/Yearly Subscription.
   */
  async processSubscription(userId: string, plan: 'monthly' | 'yearly', email?: string): Promise<void> {
    if (!userId || userId === 'guest') {
      throw new Error("You must be logged in to subscribe.");
    }
    console.log(`[PaymentService] Redirecting to Stripe (Sub: ${plan}) for User: ${userId}`);
    await this._createCheckoutSession(userId, email, 'subscription', plan);
  },

  /**
   * Internal helper to call backend
   */
  async _createCheckoutSession(userId: string, email: string | undefined, type: 'exam' | 'subscription', plan?: 'monthly' | 'yearly'): Promise<void> {
    // Construct a clean absolute return URL for Stripe to redirect back to
    // Ensure there is a trailing slash before the hash for standard routing
    const origin = window.location.origin;
    const returnPath = type === 'exam' ? '/#/exam' : '/#/'; 
    const returnUrl = `${origin}${returnPath}`;

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
          plan 
        })
      });

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || contentType.indexOf("application/json") === -1) {
        const text = await response.text();
        console.error("[PaymentService] Non-JSON response:", text);
        throw new Error("Payment Server Error: The server returned an invalid response.");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }
      
      if (data.url) {
        // Critical: Redirect the user to the Stripe hosted checkout page
        window.location.href = data.url;
      } else {
        throw new Error("No payment URL returned from checkout session creation.");
      }

    } catch (e: any) {
      console.error("[PaymentService] Critical Error:", e);
      throw e;
    }
  }
};