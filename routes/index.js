// NPM Packages 
const router = require("express").Router();

// routes
const paymet = require("./stripeMongo");
const rates = require("./shippingRates")
const user = require("./user")
const stripe = require("./stripe")

router.use("/payment", paymet);
router.use("/rates" , rates);
router.use("/user" , user);
router.use("/stripe" , stripe)

module.exports = router;

 