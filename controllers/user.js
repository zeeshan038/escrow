//NPM Packages
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Models 
const User = require("../models/User");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET);
};



module.exports.test = (req, res) => {
  return res.status(200).json({
    msg: "Testing..",
  });
};

/**
 @description Register user
 @route   POST /api/user/register
 @access  Public
 */

module.exports.register = async (req, res) => {
    const { name, email, password } = req.body;
  try {

    if (!name || !email || !password ) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new seller
    await User.create({
      name,
      email,
      password: hashedPassword,
    
    });

    return res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("Error registering seller:", error);
    res.status(500).json({ error: error.message });
  }
};


/**
 @description Login user
 @route   POST /api/user/login
 @access  Public
 */

module.exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const validUser = await User.findOne({ email });
    if (!validUser) {
      return res.status(401).json({
        status: false,
        msg: "Email or password is incorrect",
      });
    }

    // Compare passwords
    const validPassword = await bcrypt.compare(password, validUser.password);
    if (!validPassword) {
      return res.status(401).json({
        status: false,
        msg: "Email or password is incorrect",
      });
    }

    // Token generation
    const token = generateToken(validUser._id);

    // Response with token cookie
    return res
      .status(200)
      .cookie("token", token, {
        httpOnly: true,
      })
      .json({
        status: true,
        msg: "Login successful",
        user: validUser,
        token,
      });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};



