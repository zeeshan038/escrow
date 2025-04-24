//NPM Packages
const dotenv = require("dotenv");
dotenv.config();
const uuid = require("uuid").v4;

//Stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//firebase
const { admin, db } = require("../config/firebase");

// utils
const sendNotification = require("../utils/sendNotification");
const { generateShortOrderId } = require("../utils/methods");

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
      data: paymentMethods,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
   @description charging card and the ordder be created
   @route POST /api/stripe/charge-card
   @access Private
 */
module.exports.chargeCard = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNo,
    additionalDetails,
    amount,
    buyerId,
    sellerId,
    adId,
    shippingMethod,
    shippingPrice,
    lat,
    long,
  } = req.body;

  try {
    if (!buyerId || !sellerId || !amount || !adId) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if(buyerId === sellerId){
      return res.status(400).json({ error: "Buyer and seller cannot be the same" });
    }
    const buyerRef = admin.firestore().collection("users").doc(buyerId);
    const buyerDoc = await buyerRef.get();

    if (!buyerDoc.exists) {
      return res.status(404).json({ error: "Buyer not found" });
    }

    const stripeCustomerId = buyerDoc.data().stripeCustomerId;
    console.log("stripeCustomerId", stripeCustomerId);
    if (!stripeCustomerId) {
      return res
        .status(400)
        .json({ error: "Buyer has no saved payment method" });
    }

    const sellerRef = admin.firestore().collection("users").doc(sellerId);
    const sellerDoc = await sellerRef.get();

    if (!sellerDoc.exists) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      return res.status(400).json({ error: "No saved payment method found" });
    }

    const paymentMethodId = paymentMethods.data[0].id;

    // Create PaymentIntent (not confirmed yet)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: false, 
      capture_method: "manual",
      transfer_group: `order_${buyerId}_${adId}`,
      automatic_payment_methods: {
        enabled: true, 
        allow_redirects: "never",
      },
    });

     const totalPrice = amount + shippingPrice;
     const trxId = generateShortOrderId();

     const adRef = admin.firestore().collection("adPosts").doc(adId);
     const adDoc = await adRef.get();
 
     if (!adDoc.exists) {
       return res.status(404).json({ error: "Ad not found" });
     }
 
     const adData = adDoc.data();
     const thumbnailImage = adData.adImgUrl;
     console.log("thumbnailImage", thumbnailImage);

    // Save order data to Firestore
    const orderRef = admin.firestore().collection("orders").doc();
    const orderId = orderRef.id;
    await orderRef.set({
      orderId, 
      trxId,
      firstName,
      lastName,
      email,
      phoneNo,
      additionalDetails,
      amount,
      buyerId,
      sellerId,
      adId,
      shippingMethod,
      shippingPrice,
      lat,
      long,
      paymentIntentId: paymentIntent.id,
      image : thumbnailImage , 
      status: "pending", 
      totalPrice,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      message: "Payment Intent created, awaiting confirmation",
      orderId: orderRef.id,
      paymentIntentId: paymentIntent.id,
      client_secret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
   @description charging card and the ordder be created
   @route POST /api/stripe/charge-card
   @access Private
 */
module.exports.confirmPayment = async (req, res) => {
  const { paymentIntentId } = req.body;

  try {
    const orderRef = admin
      .firestore()
      .collection("orders")
      .where("paymentIntentId", "==", paymentIntentId);
    const orderSnapshot = await orderRef.get();

    if (orderSnapshot.empty) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderDoc = orderSnapshot.docs[0];
    const orderData = orderDoc.data();

    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);

    if (paymentIntent.status !== "requires_capture") {
      return res
        .status(400)
        .json({ error: "Payment failed or not ready for capture" });
    }

    await stripe.paymentIntents.capture(paymentIntentId);
    await orderDoc.ref.update({
      status: "held",
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const sellerId = orderData.sellerId;
    
    const userRef = admin.firestore().collection("users").doc(sellerId);
    const userSnapshot = await userRef.get();

    const sellerData = userSnapshot.data();
    const sellerPushToken = sellerData.pushToken;
    if (sellerPushToken) {
      await sendNotification(
        sellerPushToken,
        "Order Paid Successfully! 💰",
        `buyer paid successfully!`
      );
    }

    res.status(200).json({
      status: true,
      message: "Payment successful, order confirmed",
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
   @description release payment and send money to user paypal
   @route POST /api/stripe/transfer-money
   @access Private
 */
   module.exports.releasePayment = async (req, res) => {
    const { orderId } = req.body;
    const COMMISSION_RATE = 0.05;
  
    try {
      const orderRef = db.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
  
      if (!orderDoc.exists || orderDoc.data().status !== "held") {
        return res.status(400).json({ error: "Order not found or already processed" });
      }
  
      const order = orderDoc.data();
      const { sellerId, paymentIntentId } = order;
  
      const sellerRef = db.collection("users").doc(sellerId);
      const sellerDoc = await sellerRef.get();
  
      if (!sellerDoc.exists || !sellerDoc.data().stripeSellerId) {
        return res.status(400).json({ error: "Seller does not have a Stripe Connect account" });
      }
  
      const sellerStripeAccountId = sellerDoc.data().stripeSellerId;
  
      // Retrieve PaymentIntent to check status
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  
      if (paymentIntent.status === "requires_capture") {
        await stripe.paymentIntents.capture(paymentIntentId);
      } else if (paymentIntent.status === "succeeded") {
        console.log("PaymentIntent already captured");
      } else {
        return res.status(400).json({ error: "PaymentIntent not ready for capture" });
      }
  
      // Calculate commission and seller earnings
      const commission = Math.round(order.amount * COMMISSION_RATE);
      const sellerEarnings = order.amount - commission;
  
      const transfer = await stripe.transfers.create({
        amount: sellerEarnings * 100,
        currency: "usd",
        destination: sellerStripeAccountId,
        transfer_group: `order_${order.buyerId}_${order.adId}`,
      });
  
      await orderRef.update({
        status: "completed",
        transferId: transfer.id,
        commissionDeducted: commission,
        finalAmount: sellerEarnings,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  
      res.status(200).json({ message: "Payment released successfully" });
    } catch (error) {
      console.error("Error releasing payment:", error.message);
      res.status(500).json({ error: error.message });
    }
  };
  
  

/**
   @description dispute order
   @route POST /api/stripe/dispute-order
   @access Private
 */
module.exports.dispute = async (req, res) => {
  const { orderId, buyerId, reason, vidUrl } = req.body;

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    const orderData = orderDoc.data();
    if (orderData.status === "completed") {
      return res
        .status(400)
        .json({ error: "Cannot dispute a completed order" });
    }

    const sellerRef = db.collection("users").doc(orderData.sellerId);
    const sellerDoc = await sellerRef.get();

    if (!sellerDoc.exists) {
      return res.status(404).json({ error: "Seller not found" });
    }
    await orderRef.update({ status: "dispute" });
    await db.collection("disputes").doc(orderId).set({
      orderId,
      buyerId,
      sellerId: orderData.sellerId,
      amount: orderData.amount,
      paymentIntentId: orderData.paymentIntentId,
      reason,
      vidUrl,
      status: "dispute",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // sending notification to seller when buyer makes an order
    const sellerPushToken = sellerDoc.data().pushToken;
    console.log("token", sellerPushToken);
    if (sellerPushToken) {
      await sendNotification(
        sellerPushToken,
        "📢 Dispute Submitted!",
        `Your dispute for the order worth ${orderData.amount} has been submitted.`
      );
    }
    res.status(200).json({
      message: "Dispute raised successfully",
    });
  } catch (error) {
    console.error("Dispute Error:", error);
    res.status(500).json({ error: error.message });
  }
};
