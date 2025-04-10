// NPM Packages
const router = require("express").Router();

// controllers
const {  test, getOrders, getSpecificOrder } = require("../controllers/Orders");


router.get("/order", getOrders);
router.get("/specific-order/:orderId" , getSpecificOrder)

module.exports = router;
