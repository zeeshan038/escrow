//NPM Packages
const dotenv = require("dotenv");
const User = require("../models/User");
const Order = require("../models/Order");
const Wallet = require("../models/Wallet");
const paypal = require("paypal-rest-sdk");
dotenv.config();

//Stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// paypal configuration
paypal.configure({
  mode: "sandbox",
  client_id: process.env.PAYPAL_CLIENT_ID,
  client_secret: process.env.PAYPAL_CLIENT_SECRET,
});

module.exports.test = async (req, res) => {
  res.status(200).json({ msg: "Hello World" });
};

/**
   @description creating stripe customer
   @route POST /api/payment/create-customer
   @access Private
 */
module.exports.createCustomer = async (req, res) => {
  const { email } = req.body;

  try {
    // Check if user already has a Stripe customer ID
    let user = await User.findOne({ email });
    if (user && user.stripeCustomerId) {
      return res.status(200).json({
        message: "Customer already exists",
        stripeCustomerId: user.stripeCustomerId,
      });
    }

    // Create a new Stripe customer
    const customer = await stripe.customers.create({ email });

    user = await User.findOneAndUpdate(
      { email },
      { stripeCustomerId: customer.id },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "Customer created successfully",
      stripeCustomerId: customer.id,
    });
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message });
  }
};

/**
   @description adding test card
   @route POST /api/payment/add-card
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
   @route POST /api/payment/create-setup-intent
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
   @route POST /api/payment/get-cards
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
   @route POST /api/payment/charge-card
   @access Private
 */

module.exports.ChargeCard = async (req, res) => {
  console.log("Buyer ID:", req.user._id);

  const { amount, sellerId, paymentMethodId } = req.body;

  try {
    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const buyer = await User.findById(req.user._id).select("stripeCustomerId");
    if (!buyer) {
      return res.status(404).json({ error: "Buyer not found" });
    }

    const seller = await User.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    console.log("Buyer Stripe Customer ID:", buyer.stripeCustomerId);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "usd",
      payment_method: paymentMethodId,
      customer: buyer.stripeCustomerId,
      confirm: true,
      return_url: "https://yourwebsite.com/payment-success",
      capture_method: "manual",
    });

    await Order.create({
      buyerId: req.user._id,
      sellerId,
      amount,
      paymentIntentId: paymentIntent.id,
      status: "held",
    });

    res.status(200).json({
      message: "Payment held in escrow",
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
   @description transfer money
   @route POST /api/payment/transfer-money
   @access Private
 */
module.exports.releasePayment = async (req, res) => {
  const { orderId } = req.body;
  const COMMISSION_RATE = 0.05;

  try {
    const order = await Order.findById(orderId);
    if (!order || order.status !== "held") {
      return res
        .status(400)
        .json({ error: "Invalid or already processed order" });
    }

    await stripe.paymentIntents.capture(order.paymentIntentId);

    const commission = order.amount * COMMISSION_RATE;
    const sellerEarnings = order.amount - commission;

    let wallet = await Wallet.findOne({ userId: order.sellerId });
    if (!wallet) {
      wallet = await Wallet.create({ userId: order.sellerId, balance: 0 });
    }

    wallet.balance += sellerEarnings;
    await wallet.save();

    order.status = "completed";
    await order.save();

    res.status(200).json({
      message: "Funds added to seller's wallet after commission deduction",
      commissionDeducted: commission,
      finalAmount: sellerEarnings,
      balance: wallet.balance,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
   @description withdraw to paypal
   @route POST /api/payment/withdraw-to-paypal
   @access Private
 */

module.exports.withdrawToPayPal = async (req, res) => {
  const { sellerId, amount, paypalEmail } = req.body;
  try {
    let wallet = await Wallet.findOne({ userId: sellerId });

    if (!wallet || wallet.balance < amount) {
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
      wallet.balance -= amount;
      await wallet.save();
      res.status(200).json({
        message: "Withdrawal successful!",
        payoutId: payout.batch_header.payout_batch_id,
        balance: wallet.balance,
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
