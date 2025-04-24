const axios = require("axios");
const xml2js = require("xml2js");

module.exports.test = async (req, res) => {
  res.status(200).json({ msg: "Hello World" });
};

/**
 * @description get shipping rates from Canada Post
 * @route POST /api/rates/get-rates
 * @access Private
 */
module.exports.getCanadaPostRates = async (req, res) => {
  console.log("Received request body");
  
  const { origin, destination, weight, length, width, height } = req.body;

  try {
    if (!origin || !destination || !weight || !length || !width || !height) {
      return res.status(400).json({
        error: "Origin, destination, weight, length, width, and height are required",
      });
    }

    const username = "8a878d7d2fef3149";
    const password = "882adcda5266b095ef2d18";
    const serviceUrl = "https://ct.soa-gw.canadapost.ca/rs/ship/price";

    // Convert JSON to XML
    const builder = new xml2js.Builder({ headless: true });
    const xmlData = builder.buildObject({
      "mailing-scenario": {
        $: { xmlns: "http://www.canadapost.ca/ws/ship/rate-v4" },
        "quote-type": "counter",
        "parcel-characteristics": {
          weight,
          dimensions: {
            length,
            width,
            height,
          },
        },
        "origin-postal-code": origin,
        destination: {
          domestic: {
            "postal-code": destination,
          },
        },
      },
    });

    // Send request to Canada Post API
    const response = await axios.post(serviceUrl, xmlData, {
      headers: {
        "Content-Type": "application/vnd.cpc.ship.rate-v4+xml",
        Accept: "application/vnd.cpc.ship.rate-v4+xml",
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(
          "base64"
        )}`,
      },
    });

    // Convert XML response to JSON
    xml2js.parseString(response.data, { explicitArray: false }, (err, result) => {
      if (err) {
        console.error("XML Parsing Error:", err);
        return res.status(500).json({ error: "Failed to parse XML response" });
      }

      console.log("Canada Post Rate Response:", result);
      res.status(200).json(result);
    });
  } catch (error) {
    console.error("Canada Post API Error:", error.message);
    res.status(500).json({ error: "Something went wrong while fetching rates" });
  }
};

/**
 * @description get shipping rates bys usps
 * @route POST /api/rates/get-rates
 * @access Private
 */
const USPS_USER_ID ="177CELLI7V577";

module.exports.getUSPSRates = async (req, res) => {
  console.log("Fetching USPS shipping rates...");
  const { origin, destination, weight, length, width, height } = req.body;
  try {

    if (!origin || !destination || !weight || !length || !width || !height) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Convert weight into pounds and ounces
    const pounds = Math.floor(weight); 
    const ounces = Math.round((weight - pounds) * 16); 

    const USPS_API_URL = `https://stg-secure.shippingapis.com/ShippingAPI.dll?API=RateV4`;
    const rateRequestXML = `
        <RateV4Request USERID="${USPS_USER_ID}">
            <Revision>2</Revision>
            <Package ID="0">
                <Service>PRIORITY</Service>
                <ZipOrigination>${origin}</ZipOrigination>
                <ZipDestination>${destination}</ZipDestination>
                <Pounds>${pounds}</Pounds>
                <Ounces>${ounces}</Ounces>
                <Container></Container>
                <Width>${width}</Width>
                <Length>${length}</Length>
                <Height>${height}</Height>
            </Package>
        </RateV4Request>`;

    // Make API request
    const response = await axios.get(
      `${USPS_API_URL}&XML=${encodeURIComponent(rateRequestXML)}`
    );
    // Convert XML to JSON
    xml2js.parseString(
      response.data,
      { explicitArray: false },
      (err, result) => {
        if (err) {
          console.error("Error parsing XML:", err);
          return res
            .status(500)
            .json({ error: "Failed to parse USPS response" });
        }

        const rate = result?.RateV4Response?.Package?.Postage?.Rate;
        if (!rate) {
          console.error("Invalid USPS response:", response.data);
          return res.status(400).json({ error: "Invalid response from USPS" });
        }

        console.log("USPS Rate:", rate);
        res.json({ service: "USPS", rate: parseFloat(rate) });
      }
    );
  } catch (error) {
    console.error("Error fetching USPS rates:", error);
    res.status(500).json({ error: "Failed to fetch USPS shipping rates" });
  }
};

/**
 * @description get shipping rates by ups
 * @route POST /api/rates/get-rates-ups
 * @access Private
 */
const clientId = "oRRNjGUFASXDetUR6484OoUdsKR58OsC2VUW36CYFUexFd87";
const clientSecret = "rGeTj7l02TpMzJBQIGMPzlQi2xXLxLmBaGX9IGENW7TJZSfwXoST0S7DALx4ZjAM"

// Get Access Token from UPS
const getUPSToken = async () => {
  try {
    const response = await axios.post(
      "https://wwwcie.ups.com/security/v1/oauth/token",
      new URLSearchParams({ grant_type: "client_credentials" }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        auth: {
          username: clientId,
          password: clientSecret,
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error("Token Error:", error.response?.data || error.message);
    throw error;
  }
};

const getAddressFromPostal = async (postalCode) => {
  const response = await axios.get(`http://api.zippopotam.us/us/${postalCode}`);
  const place = response.data.places[0];
  return {
    City: place["place name"],
    StateProvinceCode: place["state abbreviation"],
    PostalCode: postalCode,
    CountryCode: "US"
  };
};

module.exports.getUPSRates = async (req, res) => {
  const { origin, destination, weight } = req.body;

  try {
    const [originAddress, destinationAddress] = await Promise.all([
      getAddressFromPostal(origin),
      getAddressFromPostal(destination)
    ]);

    const token = await getUPSToken();

    const upsPayload = {
      RateRequest: {
        Request: {
          TransactionReference: { CustomerContext: "Marketplace Rate Check" }
        },
        Shipment: {
          Shipper: { Name: "Marketplace Seller", Address: originAddress },
          ShipFrom: { Name: "Marketplace Seller", Address: originAddress },
          ShipTo: { Name: "Buyer", Address: destinationAddress },
          Package: {
            PackagingType: { Code: "02", Description: "Package" },
            PackageWeight: {
              UnitOfMeasurement: { Code: "LBS" },
              Weight: weight.toString()
            },
            Dimensions: {
              UnitOfMeasurement: { Code: "IN" },
              Length: "5",
              Width: "5",
              Height: "5"
            }
          },
          Service: { Code: "03" }
        }
      }
    };

    const rateResponse = await axios.post(
      "https://wwwcie.ups.com/api/rating/v2205/Rate",
      upsPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(rateResponse.data);
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch UPS rates." });
  }
};

/**
 * @description get shipping rates bys fedex
 * @route POST /api/rates/get-rates-fedx
 * @access Private
 */
const FEDEX_CONFIG = {
  CLIENT_ID: "l75549bada4f34461eb02c3ef31e772b03",
  CLIENT_SECRET: "6204f6dd47ba4d4686dcbf15a4f24585",
  ACCOUNT_NUMBER: "208087342", 
  METER_NUMBER: "118570439", 
  SANDBOX: true
};

const FEDEX_BASE_URL = FEDEX_CONFIG.SANDBOX 
  ? "https://apis-sandbox.fedex.com" 
  : "https://apis.fedex.com";

let authToken = null;
let tokenExpiration = null;

async function getFedExAccessToken() {
  try {
  
    if (authToken && tokenExpiration && new Date() < tokenExpiration) {
      return authToken;
    }

    const response = await axios.post(
      `${FEDEX_BASE_URL}/oauth/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id:"l75549bada4f34461eb02c3ef31e772b03",
        client_secret:"6204f6dd47ba4d5686dcbf15a4f24585"
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 5000
      }
    );

    authToken = response.data.access_token;
    tokenExpiration = new Date(Date.now() + (response.data.expires_in * 1000 - 60000));
    return authToken;
  } catch (error) {
    console.error("FedEx Authentication Error:", error.response?.data || error.message);
    throw new Error("FedEx authentication failed. Please check your client ID and secret.");
  }
}

module.exports.getFedexRates = async (req, res) => {
  console.log("Fetching FedEx shipping rates...");
  
  try {
    // Validate required fields
    const { origin, destination, weight } = req.body;
    
    if (!origin || !destination || !weight) {
      return res.status(400).json({
        status: "error",
        error: "Missing required fields",
        required: ["origin (postal code)", "destination (postal code)", "weight (in lbs)"]
      });
    }

    // Validate weight is a positive number
    if (isNaN(weight) || weight <= 0) {
      return res.status(400).json({
        status: "error",
        error: "Invalid weight",
        message: "Weight must be a positive number"
      });
    }

    // Validate postal codes (basic format check)
    const postalCodeRegex = /^\d{5}(-\d{4})?$/;
    if (!postalCodeRegex.test(origin) || !postalCodeRegex.test(destination)) {
      return res.status(400).json({
        status: "error",
        error: "Invalid postal code format",
        message: "Postal codes must be 5 or 9 digits (e.g., 12345 or 12345-6789)"
      });
    }

    const token = await getFedExAccessToken();
  
    const rateRequest = {
      accountNumber: {
        value: "740561073" // Consider moving to config
      },
      requestedShipment: {
        shipper: {
          address: {
            postalCode: origin,
            countryCode: "US" // Added for clarity
          }
        },
        recipient: {
          address: {
            postalCode: destination,
            countryCode: "US" 
          }
        },
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        rateRequestType: ["LIST"], 
        requestedPackageLineItems: [
          {
            weight: {
              units: "LB",
              value: parseFloat(weight) 
            }
          }
        ],
        meterNumber: "118570439", 
        serviceType: "FEDEX_GROUND" 
      }
    };

    const rateResponse = await axios.post(
      `${FEDEX_BASE_URL}/rate/v1/rates/quotes`,
      rateRequest,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "en_US" 
        },
        timeout: 10000
      }
    );

    const formattedResponse = {
      status: "success",
      service: rateResponse.data.output.rateReplyDetails[0].serviceName,
      totalCost: rateResponse.data.output.rateReplyDetails[0].ratedShipmentDetails[0].totalNetCharge,
      currency: "USD",
      details: {
        baseCharge: rateResponse.data.output.rateReplyDetails[0].ratedShipmentDetails[0].totalBaseCharge,
        surcharges: rateResponse.data.output.rateReplyDetails[0].ratedShipmentDetails[0].totalSurcharges,
        weight: {
          value: weight,
          units: "LB"
        },
        transitTime: rateResponse.data.output.rateReplyDetails[0].transitTime
      }
    };

    res.status(200).json(formattedResponse);
    
  } catch (error) {
    console.error("FedEx Rate API Error:", error.response?.data || error.message);
    
    let statusCode = 500;
    let errorMessage = "Failed to retrieve rates from FedEx";
    let errorDetails = null;

    if (error.response) {
      statusCode = error.response.status;
      errorDetails = error.response.data;
      
      // Handle specific FedEx error codes
      if (error.response.data?.errors) {
        const fedexError = error.response.data.errors[0];
        errorMessage = fedexError.message || errorMessage;
        
        if (fedexError.code === 'ACCOUNT.NUMBER.MISMATCH') {
          errorMessage = 'FedEx account credentials mismatch';
          statusCode = 403;
        }
      }
    }

    res.status(statusCode).json({
      status: "error",
      error: errorMessage,
      details: errorDetails,
      suggestion: statusCode === 403 
        ? 'Verify your FedEx account number and meter number'
        : 'Check your input values and try again'
    });
  }
};

