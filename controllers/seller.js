// NPM Package
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const FormData = require("form-data");

//firebase
const { admin } = require("../config/firebase");

/**
 * @description creating seller connected account
 * @route  POST /api/seller/create-seller
 * @access Private
 */
module.exports.createSellerAccount = async (req, res) => {
  const { email, country, uid } = req.body;
  try {
    const userRef = admin.firestore().collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const account = await stripe.accounts.create({
      type: "custom",
      country: country || "US",
      email: email,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    await userRef.update({
      stripeSellerId: account.id,
    });

    return res.json({
      status: true,
      accountId: account.id,
      message: "Account created successfully!",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @description do seller kyc
 * @route  POST /api/seller/kyc
 * @access Private
 */
module.exports.sellerKYC = async (req, res) => {
  try {
    const {
      stripeSellerId,
      first_name,
      last_name,
      dob,
      id_number,
      email,
      phone,
      address,
      business_url,
      frontUrl,
      backUrl,
      userId,
    } = req.body;

    if (!frontUrl || !backUrl) {
      return res.status(400).json({
        success: false,
        message: "Both front and back document URLs are required!",
      });
    }

    // Download image from Firebase Storage
    const downloadImage = async (imageUrl) => {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data, "binary");
    };

    const frontImageBuffer = await downloadImage(frontUrl);
    const backImageBuffer = await downloadImage(backUrl);

    // Upload document images to Stripe
    const uploadToStripe = async (imageBuffer, fileName) => {
      return await stripe.files.create({
        purpose: "identity_document",
        file: {
          data: imageBuffer,
          name: fileName,
          type: "image/png",
        },
      });
    };

    const frontUpload = await uploadToStripe(frontImageBuffer, "front.png");
    const backUpload = await uploadToStripe(backImageBuffer, "back.png");

    await stripe.accounts.update(stripeSellerId, {
      individual: {
        first_name,
        last_name,
        dob: {
          day: dob.day,
          month: dob.month,
          year: dob.year,
        },
        id_number,
        email,
        phone,
        address: {
          line1: address.line1,
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country,
        },
        verification: {
          document: {
            front: frontUpload.id,
            back: backUpload.id,
          },
        },
      },
      business_type: "individual",
      business_profile: {
        mcc: "5734",
        url: business_url,
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: req.ip,
      },
    });

    await admin.firestore().collection("payment_methods").doc(userId).set({
      stripeSellerId,
      status: "pending",
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      status: true,
      message: "Seller KYC updated successfully in Stripe!",
      stripeDocumentIds: { front: frontUpload.id, back: backUpload.id },
    });
  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
  }
};

/**
 * @description add bank for seller
 * @route  POST /api/seller/add-bank
 * @access Private
 */
module.exports.addBank = async (req, res) => {
  const {
    stripeSellerId,
    account_holder_name,
    routing_number,
    account_number,
    country,
    currency,
    userId,
  } = req.body;

  try {
  
    const bankAccount = await stripe.accounts.createExternalAccount(
      stripeSellerId,
      {
        external_account: {
          object: "bank_account",
          country,
          currency,
          account_holder_name,
          routing_number,
          account_number,
        },
      }
    );

    const newBankAccount = {
      bankAccountId: bankAccount.id,
      country,
    };

    const snapshot = await admin
      .firestore()
      .collection("payment_methods")
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const paymentDoc = snapshot.docs[0];
      const paymentId = paymentDoc.id;

      const existingBankAccounts = paymentDoc.data().bankAccounts || [];
      existingBankAccounts.push(newBankAccount);
      
      await admin
        .firestore()  
        .collection("payment_methods")
        .doc(paymentId)
        .update({
          bankAccounts: existingBankAccounts,
        });
    } else {
      await admin
        .firestore()
        .collection("payment_methods")
        .add({
          userId,
          bankAccounts: [newBankAccount],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    return res.json({
      status: true,
      message: "Bank account added successfully",
      bankAccount,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

/**
 * @description checking kyc status
 * @route  POST /api/seller/kyc-status
 * @access Private
 */
module.exports.checkSellerStatus = async (req, res) => {
  const { stripeSellerId } = req.body;

  try {
    const account = await stripe.accounts.retrieve(stripeSellerId);
    const isVerified = account.requirements.currently_due.length === 0;
    const sellerSnapshot = await admin
      .firestore()
      .collection("payment_methods")
      .where("stripeSellerId", "==", stripeSellerId)
      .limit(1)
      .get();

    if (sellerSnapshot.empty) {
      return res.status(404).json({
        status: false,
        message: "Seller not found in Firestore!",
      });
    }
    const sellerRef = sellerSnapshot.docs[0].ref;
    await sellerRef.update({
      status: isVerified ? "verified" : "restricted",
      lastChecked: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      status: true,
      verificationStatus: isVerified ? "Verified" : "Restricted",
      currentlyDue: account.requirements.currently_due,
    });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
};

/**
 * @description get seller bank accounts
 * @route  POST /api/seller/get-acc
 * @access Private
 */
module.exports.getAccounts = async (req, res) => {
  const { accId } = req.params;

  try {
    const account = await stripe.accounts.retrieve(accId);
    if (!account) {
      return res.status(401).json({
        status: false,
        message: "No accounts found",
      });
    }
    // response
    return res.status(200).json({
      status: true,
      account: account.external_accounts,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

/**
 * @description as there will be multiple bank accounts for a seller so when seller select any of the card in payment methods the selected card be changed
 * @route  DELETE /api/seller/select-card
 * @access Private
 */
module.exports.setDefaultBankAccount = async (req, res) => {
  const { accountId, bankAccountId, userId } = req.params;

  try {
    const updatedBankAccount = await stripe.accounts.updateExternalAccount(
      accountId,
      bankAccountId,
      { default_for_currency: true }
    );

    const userPaymentRef = admin.firestore().collection("payment_methods").doc(userId);
    const userPaymentDoc = await userPaymentRef.get();

    if (!userPaymentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User payment methods not found",
      });
    }

    const userPaymentData = userPaymentDoc.data();

    await userPaymentRef.update({
      selectedBankId: bankAccountId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: "Bank account set as default successfully",
      updatedBankAccount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @description delete seller bank accounts
 * @route  DELETE /api/seller/delete-acc
 * @access Private
 */
module.exports.deleteBankAccount = async (req, res) => {
  const { accountId, bankAccountId , userId } = req.params;
  try {
    const deletedBankAccount = await stripe.accounts.deleteExternalAccount(
      accountId,
      bankAccountId
    );

    const userPaymentRef = admin.firestore().collection("payment_methods").doc(userId);
    const userPaymentDoc = await userPaymentRef.get();

    if (!userPaymentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User payment methods not found",
      });
    }

    const userPaymentData = userPaymentDoc.data();

    const updatedBankAccounts = userPaymentData.bankAccounts.filter(
      (account) => account.bankAccountId !== bankAccountId
    );

    await userPaymentRef.update({
      bankAccounts: updatedBankAccounts,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: "Bank account deleted successfully",
      deletedBankAccount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
