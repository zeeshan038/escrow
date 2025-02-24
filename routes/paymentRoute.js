
const router = require("express").Router();

// controllers
const { test, createCustomer, createSetupIntent, getCards, ChargeCard, addTestCard, releasePayment, createSellerAccount } = require("../controllers/stripe");

router.get("/test" , test);
router.post("/create-customer", createCustomer);
router.post("/create-seller", createSellerAccount);
router.post("/add-card", addTestCard);
router.post("/create-setup-intent" , createSetupIntent);
router.get("/get-cards/:customerId" , getCards  );
router.post("/charge-card" , ChargeCard);
router.post("/transfer-money" , releasePayment)


module.exports = router;