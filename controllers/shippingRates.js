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

  try {
    const { origin, destination } = req.body;

    if (!origin || !destination) {
      return res
        .status(400)
        .json({ error: "Origin, destination  are required" });
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
        "parcel-characteristics": { weight: 1 },
        "origin-postal-code": origin,
        destination: { domestic: { "postal-code": destination } },
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
    xml2js.parseString(
      response.data,
      { explicitArray: false },
      (err, result) => {
        if (err) {
          console.error("XML Parsing Error:", err);
          return res
            .status(500)
            .json({ error: "Failed to parse XML response" });
        }

        const transformedRates = {
          rates: result["price-quotes"]["price-quote"].map((quote) => ({
            service: quote["service-name"],
            price: parseFloat(quote["price-details"]["due"]),
            delivery_date: quote["service-standard"]["expected-delivery-date"],
          })),
        };

        return res.status(200).json(transformedRates);
      }
    );
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to fetch shipping rates" });
  }
};

/**
 * @description get shipping rates bys usps
 * @route POST /api/rates/get-rates
 * @access Private
 */

const USPS_USER_ID = "zeeshan038";

module.exports.getUSPSRates = async (req, res) => {
  console.log("Fetching USPS shipping rates...");

  try {
    const { originZip, destinationZip, pounds, ounces, length, width, height } =
      req.body;

    // Validate required fields
    if (
      !originZip ||
      !destinationZip ||
      !pounds ||
      !ounces ||
      !length ||
      !width ||
      !height
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const USPS_API_URL = `https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4`;

    const rateRequestXML = `
        <RateV4Request USERID="${USPS_USER_ID}">
            <Revision>2</Revision>
            <Package ID="0">
                <Service>PRIORITY</Service>
                <ZipOrigination>${originZip}</ZipOrigination>
                <ZipDestination>${destinationZip}</ZipDestination>
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

// Main function to export
module.exports.getUPSRates = async (req, res) => {
  console.log("Request body:", req.body); // Check the raw body coming from the client

  const { origin, destination, weight } = req.body;
  console.log("Origin:", origin, "Destination:", destination, "Weight:", weight);

  try {
    if (!origin || !destination || !weight) {
      return res.status(400).json({
        error: "origin, destination, and weight are required",
      });
    }

    const token = await getUPSToken();
    console.log("Access Token:", token);

    const rateResponse = await axios.post(
      "https://wwwcie.ups.com/api/rating/v2205/Rate",
      {
        RateRequest: {
          Request: {
            RequestOption: "Rate",
            TransactionReference: {
              CustomerContext: "Get UPS shipping rates",
            },
          },
          Shipment: {
            Shipper: {
              Address: {
                PostalCode: origin,
                CountryCode: "US",
              },
            },
            ShipTo: {
              Address: {
                PostalCode: destination,
                CountryCode: "US",
              },
            },
            ShipFrom: {
              Address: {
                PostalCode: origin,
                CountryCode: "US",
              },
            },
            Package: {
              PackagingType: {
                Code: "02", // Customer Supplied Package
              },
              PackageWeight: {
                UnitOfMeasurement: {
                  Code: "LBS",
                },
                Weight: weight,
              },
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json(rateResponse.data);
  } catch (error) {
    console.error("UPS Rate Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch UPS shipping rates",
      details: error.response?.data || error.message,
    });
  }
};
