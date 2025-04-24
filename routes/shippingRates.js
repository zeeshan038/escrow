

const router = require("express").Router();

// controllers
const { getCanadaPostRates, test, getUSPSRates, getUPSRates, getFedexRates } = require("../controllers/shippingRates");


router.get("/test" , test);
router.post("/get-rates", getCanadaPostRates);
router.post("/get-rates-usps" , getUSPSRates);
router.post("/get-rates-ups" , getUPSRates);
router.post('/get-rates-fedex', getFedexRates );



module.exports = router;