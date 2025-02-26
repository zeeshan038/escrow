

const router = require("express").Router();

// controllers
const { getCanadaPostRates, test, getUSPSRates } = require("../controllers/shippingRates");


router.get("/test" , test);
router.post("/get-rates", getCanadaPostRates);
router.post("/get-rates-usps" , getUSPSRates)



module.exports = router;