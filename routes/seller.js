
const router = require("express").Router();

// controllers
const { createSellerAccount,  checkSellerStatus, sellerKYC, addBank, getAccounts, deleteBankAccount, setDefaultBankAccount} = require("../controllers/seller");

router.post("/create-seller" , createSellerAccount);
router.post("/kyc" , sellerKYC);
router.post("/add-bank" , addBank);
router.post("/kyc-status" , checkSellerStatus);
router.get("/accounts/:accId" , getAccounts);
router.delete("/delete-acc/:accountId/:bankAccountId/:userId",deleteBankAccount);
router.put("/set-default-bank/:accountId/:bankAccountId/:userId",setDefaultBankAccount)

module.exports = router;