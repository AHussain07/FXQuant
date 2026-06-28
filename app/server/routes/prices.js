const express = require("express");
const router = express.Router();

const { getCurrentPrice } = require("../controllers/priceController");

if (!getCurrentPrice) {
  console.error(
    "Error: getCurrentPrice is undefined in routes/prices.js. Check priceController exports."
  );
}

router.get("/current/:symbol", getCurrentPrice);

module.exports = router;
