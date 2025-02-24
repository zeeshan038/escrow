// NPM Packages
const router = require("express").Router();

// controllers
const { test, register, login } = require("../controllers/user");

router.get("/test" , test);
router.post('/register' , register);
router.post('/login' , login);



module.exports = router;