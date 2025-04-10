

const router = require("express").Router();

// controllers
const { getCanadaPostRates, test, getUSPSRates, getUPSRates } = require("../controllers/shippingRates");


router.get("/test" , test);
router.post("/get-rates", getCanadaPostRates);
router.post("/get-rates-usps" , getUSPSRates)
router.post("/get-rates-ups" , getUPSRates)



module.exports = router;