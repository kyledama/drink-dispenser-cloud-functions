const {onRequest} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

exports.getDrinksByDispenserId = onRequest(async (req, res) => {
  // Allow CORS for local testing (optional)
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight request (OPTIONS)
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // Check if Authorization header is present
  if (!req.headers.authorization) {
    res.status(401).send("Unauthorized");
    return;
  }

  // Get the ID token from the Authorization header
  const idToken = req.headers.authorization.split("Bearer ")[1];

  if (!idToken) {
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    // Verify the ID token
    const decodedToken = await getAuth().verifyIdToken(idToken);

    if (!decodedToken) {
      res.status(400).send("Unauthorized, token invalid");
      return;
    }

    // Extract the dispenserId from the request body
    const {dispenserId} = req.body;

    if (!dispenserId) {
      res.status(400).send("Missing dispenserId");
      return;
    }

    const dispenserRef = db.collection("dispensers").doc(dispenserId);
    const dispenserDoc = await dispenserRef.get();

    if (!dispenserDoc.exists) {
      res.status(404).send("Dispenser not found");
      return;
    }

    const dispenser = dispenserDoc.data();

    // Query Firestore for drinks with the specified dispenserId
    const drinksSnapshot = await db
        .collection("drinks")
        .where("dispenser_id", "==", dispenserId)
        .get();

    if (drinksSnapshot.empty) {
      res.status(404).send("No matching drinks found");
      return;
    }

    const drinks = [];
    drinksSnapshot.forEach((doc) => {
      drinks.push({id: doc.id, ...doc.data()});
    });

    const pumps = [];
    dispenser.pumps.forEach((pump) => {
      if (pump.ingredient_id && pump.ingredient_label) {
        pumps.push({...pump});
      }
    });

    res.status(200).json({
      pump_mapping: pumps,
      drinks: drinks,
    });
  } catch (error) {
    console.error("Error fetching drinks:", error);
    if (error.code === "auth/argument-error") {
      res.status(401).send("Unauthorized");
    } else {
      res.status(500).send("Internal Server Error");
    }
  }
});
