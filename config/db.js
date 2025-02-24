const mongoose = require('mongoose');


const connectDb = async()=>{
    await mongoose.connect("mongodb://localhost:27017" , {
        dbName:"escrow" 
    }).then(()=>{
        console.log('Connection created')
    }).catch((err)=>{
        console.log(err)
    })
}


module.exports = connectDb;