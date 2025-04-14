// NPM Packages
const router = require("express").Router();

// controllers
const {  getOrders, getSpecificOrder, orderShipped, completeOrder } = require("../controllers/Orders");


router.get("/order", getOrders);
router.get("/specific-order/:orderId" , getSpecificOrder);
router.put("/ship-order/:orderId" , orderShipped);
router.put('/complete-order/:orderId',completeOrder);


module.exports = router;
