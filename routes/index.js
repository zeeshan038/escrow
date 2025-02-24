// NPM Packages 
const router = require("express").Router();

// routes
const paymet = require("./paymentRoute");
const rates = require("./shippingRates")
const user = require("./user")


router.use("/payment", paymet);
router.use("/rates" , rates);
router.use("/user" , user);


module.exports = router;

 