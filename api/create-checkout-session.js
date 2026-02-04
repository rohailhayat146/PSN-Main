
import Stripe from 'stripe';

export default async function handler(req, res) {
  // 1. Method Check
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Environment Variable Check
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("CRITICAL: STRIPE_SECRET_KEY is missing.");
    return res.status(500).json({ 
      error: "Server Misconfiguration: Stripe API Key is missing." 
    });
  }

  // 3. Initialize Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const { userId, email, returnUrl, type, plan } = req.body;
  
  // Dynamic Configuration based on Type and Plan (Synced with server.js)
  let productName = 'Professional Certification Exam';
  let amount = 5000; // Default $50.00
  let description = 'One-time access to the Exam Hall';
  
  if (type === 'subscription') {
    productName = 'PSN Verified Membership';
    if (plan === 'yearly') {
        amount = 30000; // $300.00
        description = 'Yearly Verified Membership (Save 15%)';
    } else {
        amount = 2900; // $29.00
        description = 'Monthly Verified Membership';
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: description,
              images: ['https://cdn-icons-png.flaticon.com/512/2921/2921222.png'], 
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${returnUrl}?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?payment_canceled=true`,
      metadata: {
        userId,
        product: type || "Exam Certification",
        plan: plan || 'one_time'
      },
      customer_email: email,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("Stripe API Error:", e.message);
    res.status(500).json({ error: `Stripe Error: ${e.message}` });
  }
}
