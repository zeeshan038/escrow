// NPM Packages 
const router = require("express").Router();

// routes
const rates = require("./shippingRates")
const stripe = require("./stripe")
const orders = require("./orders")
const seller = require("./seller")


router.use("/rates" , rates);
router.use("/stripe", stripe);
router.use("/orders", orders);
router.use("/seller" , seller)

module.exports = router;

 