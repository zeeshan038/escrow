//NPM Packages
const dotenv = require("dotenv");
const User = require("../models/User");
const Order = require("../models/Order");

dotenv.config();

//Stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports.test = async (req, res) => {
  res.status(200).json({ msg: "Hello World" });
};




 module.exports.createSellerAccount = async (req, res) => {
  const { email, bankDetails } = req.body;

  try {
    const account = await stripe.accounts.create({
      type: "custom", 
      country: "US"
,      email: email,
      capabilities: {
        transfers: { requested: true },
      },
      external_account: {
        object: "bank_account",
        country: "US",
        currency: "usd",
        account_number: bankDetails.accountNumber,
        routing_number: bankDetails.routingNumber,
      },
    });

    res.status(200).json({
      message: "Stripe account created",
      accountId: account.id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


/**
   @description creating stripe customer
   @route POST /api/payment/create-customer
   @access Private
 */
module.exports.createCustomer = async (req, res) => {
  const { email } = req.body;

  try {
    const customer = await stripe.customers.create({ email });

    await User.findOneAndUpdate(
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
   @description create customer cards
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
   const { amount, customerId , sellerAccountId } = req.body;
  
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, 
        currency: "usd",
        customer: customerId,
        capture_method: "manual", 
      });

      await Order.create({
        customerId,
        sellerAccountId,
        amount,
        paymentIntentId: paymentIntent.id,
        status: "held"
      });
  
      res.status(200).json({
        message: "Payment held in escrow",
        paymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  



  module.exports.releasePayment = async (req, res) => {
    const { sellerAccountId, amount } = req.body;
    const commission = amount * 0.10; 
    const payoutAmount = amount - commission;
  
    try {
      await stripe.transfers.create({
        amount: payoutAmount * 100, 
        currency: "usd",
        destination: sellerAccountId,
      });
  
      res.status(200).json({ message: "Payment released to seller" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };