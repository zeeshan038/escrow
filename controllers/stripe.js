//NPM Packages
const paypal = require("paypal-rest-sdk");
const dotenv = require("dotenv");
dotenv.config();
//Stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
//firebase
const { admin, db } = require("../config/firebase");

// paypal configuration
paypal.configure({
  mode: "sandbox",
  client_id: process.env.PAYPAL_CLIENT_ID ,
  client_secret: process.env.PAYPAL_CLIENT_SECRET,
});

/**
   @description creating stripe customer
   @route POST /api/stripe/create-customer
   @access Private
 */

module.exports.createCustomer = async (req, res) => {
  const { email, uid } = req.body;

  try {
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (userDoc.exists && userDoc.data().stripeCustomerId) {
      return res.status(200).json({
        message: "Customer already exists",
        stripeCustomerId: userDoc.data().stripeCustomerId,
      });
    }

    const customer = await stripe.customers.create({ email });
    await userRef.set({ stripeCustomerId: customer.id }, { merge: true });

    return res.status(200).json({
      message: "Customer created successfully",
      stripeCustomerId: customer.id,
    });
  } catch (error) {
    console.error("Stripe Customer Creation Error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
   @description adding test card
   @route POST /api/stripe/add-card
   @access Private
 */
module.exports.addTestCard = async (req, res) => {
  const { customerId, testToken } = req.body;

  try {
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        token: testToken,
      },
    });

    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: customerId,
    });

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    res.status(200).json({
      status: true,
      message: "Test card added successfully",
      paymentMethod,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
   @description create setup intent
   @route POST /api/stripe/create-setup-intent
   @access Private
 */

module.exports.createSetupIntent = async (req, res) => {
  const { customerId } = req.body;

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
    });

    res.status(200).json({
      status: true,
      message: "Intent created successfully",
      client_secret: setupIntent.client_secret,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
   @description get cards
   @route POST /api/stripe/get-cards
   @access Private
 */
module.exports.getCards = async (req, res) => {
  const { customerId } = req.params;

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    // Check if no cards are available
    if (paymentMethods.data.length === 0) {
      return res.status(400).json({
        status: false,
        msg: "No payment methods found for this customer",
      });
    }

    res.status(200).json({
      status: true,
      data: paymentMethods.data,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
   @description charge card
   @route POST /api/stripe/charge-card
   @access Private
 */
module.exports.chargeCard = async (req, res) => {
  const { buyerId, sellerId, amount, paymentMethodId } = req.body;

  try {
    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }


    const buyerRef = db.collection("users").doc(buyerId);
    const buyerDoc = await buyerRef.get();

    if (!buyerDoc.exists) {
      return res.status(404).json({ error: "Buyer not found" });
    }

    const stripeCustomerId = buyerDoc.data().stripeCustomerId;

    // Fetch seller details
    const sellerRef = db.collection("users").doc(sellerId);
    const sellerDoc = await sellerRef.get();

    if (!sellerDoc.exists) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, 
      currency: "usd",
      payment_method: paymentMethodId,
      customer: stripeCustomerId,
      confirm: true, 
      return_url: "https://yourwebsite.com/payment-success",
      capture_method: "manual", 
    });

    await orderRef.set({
      orderId,
      buyerId,
      sellerId,
      amount,
      paymentIntentId: paymentIntent.id,
      status: "held", 
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      message: "Payment held in escrow",
      orderId,
      paymentIntentId: paymentIntent.id, 
    });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
   @description release payment and send money to user paypal
   @route POST /api/stripe/transfer-money
   @access Private
 */

module.exports.releasePayment = async (req, res) => {
  const { orderId, paypalEmail } = req.body;
  const COMMISSION_RATE = 0.05;

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists || orderDoc.data().status !== "held") {
      return res.status(400).json({ error: "Already processed order" });
    }

    const order = orderDoc.data();
    await stripe.paymentIntents.capture(order.paymentIntentId);

    const commission = order.amount * COMMISSION_RATE;
    const sellerEarnings = order.amount - commission;

    // PayPal Payout Data
    const payoutData = {
      sender_batch_header: {
        email_subject: "You have received a payout!",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: sellerEarnings, currency: "USD" },
          receiver: paypalEmail,
          note: "Payment for your order",
          sender_item_id: `PAYOUT_${Date.now()}`,
        },
      ],
    };

    // Send PayPal Payout
    paypal.payout.create(payoutData, async (error, payout) => {
      if (error) {
        console.error("PayPal Payout Error:", error);
        return res.status(500).json({ error: "PayPal Payout failed" });
      }

      await orderRef.update({ status: "completed" });

      res.status(200).json({
        message: "Funds sent to seller's PayPal after commission deduction",
        payoutId: payout.batch_header.payout_batch_id,
        commissionDeducted: commission,
        finalAmount: sellerEarnings,
      });
    });
  } catch (error) {
    console.error("Release Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
};



/**
   @description dispute order
   @route POST /api/stripe/dispute-order
   @access Private
 */

module.exports.dispute = async (req , res)=>{
    const { orderId, buyerId, reason } = req.body;

    try {
      const orderRef = db.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
  
      if (!orderDoc.exists) {
        return res.status(404).json({ error: "Order not found" });
      }
  
      const orderData = orderDoc.data();
      if (orderData.status === "completed") {
        return res.status(400).json({ error: "Cannot dispute a completed order" });
      }

      await orderRef.update({ status: "dispute" });
      await db.collection("disputes").doc(orderId).set({
        orderId,
        buyerId,
        sellerId: orderData.sellerId,
        amount: orderData.amount,
        paymentIntentId: orderData.paymentIntentId,
        reason,
        status: "dispute",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  
      res.status(200).json({
        message: "Dispute raised successfully"
      });
  
    } catch (error) {
      console.error("Dispute Error:", error);
      res.status(500).json({ error: error.message });
    }
}

/**
   @description withdraw to paypal
   @route POST /api/payment/withdraw-to-paypal
   @access Private
 */

module.exports.withdrawToPayPal = async (req, res) => {
  const { sellerId, amount, paypalEmail } = req.body;

  try {
    const walletRef = db.collection("wallets").doc(sellerId);
    const walletDoc = await walletRef.get();

    if (!walletDoc.exists || walletDoc.data().balance < amount) {
      return res.status(400).json({ error: "Insufficient funds" });
    }

    // PayPal Payout Data
    const payoutData = {
      sender_batch_header: {
        email_subject: "You have received a payout!",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: amount, currency: "USD" },
          receiver: paypalEmail,
          note: "Withdrawal from your account",
          sender_item_id: `PAYOUT_${Date.now()}`,
        },
      ],
    };

    // Send PayPal Payout
    paypal.payout.create(payoutData, async (error, payout) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: "PayPal Payout failed" });
      }

      // Deduct balance
      await walletRef.update({
        balance: admin.firestore.FieldValue.increment(-amount),
      });

      res.status(200).json({
        message: "Withdrawal successful!",
        payoutId: payout.batch_header.payout_batch_id,
        balance: walletDoc.data().balance - amount,
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
