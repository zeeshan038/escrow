// NPM Packages 
const router = require("express").Router();

// controllers
const { createCustomer, addTestCard, addBankAccount, createSetupIntent, getCards, chargeCard, releasePayment, dispute ,createSellerAccount, confirmPayment } = require("../controllers/stripe");


router.post("/create" , createCustomer);
router.post("/add-card" , addTestCard)
router.post("/create-setup-intent" , createSetupIntent);
router.get("/get-cards/:customerId" , getCards  );
router.post("/charge-card" , chargeCard);
router.post("/confirm-order" , confirmPayment);
router.post("/transfer-money" , releasePayment);
router.post("/dispute-order" , dispute);


module.exports = router;