const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    stripeCustomerId: {
        type : String , 
        default : ""
    },
    name: String,
    email: { type: String, unique: true, required: true },
    password: String,
    bankDetails: {
        accountNumber: String, 
        bankName: String,
        routingNumber: String,
    },
    balance: { type: Number, default: 0 }, 
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
