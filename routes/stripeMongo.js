
const router = require("express").Router();

// controllers
const { test, createCustomer, createSetupIntent, getCards, ChargeCard, addTestCard, releasePayment,  withdrawToPayPal } = require("../controllers/stripeMongo");

//middleware
 
router.get("/test" , test);
router.post("/create-customer", createCustomer);
router.post("/add-card", addTestCard);
router.post("/create-setup-intent" , createSetupIntent);
router.get("/get-cards/:customerId" , getCards  );
router.post("/transfer-money" , releasePayment);


router.post("/charge-card" , ChargeCard);

router.post("/withdraw-to-paypal" , withdrawToPayPal);


module.exports = router;