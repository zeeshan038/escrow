//NPM Packages
const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const bodyParserXml = require("body-parser-xml");

//paths
const appRoutes  = require("./routes/index");
const { connectDb } = require("./config/connection");

dotenv.config();

const app = express();

bodyParserXml(bodyParser);
app.use(bodyParser.xml());
app.use(express.json());

//db connection
connectDb();
//rouutes
app.use('/api' ,appRoutes)

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});