// backend/server.js
const express = require('express');
const vision = require('@google-cloud/vision');
const dotenv = require('dotenv');
const cors = require('cors');
const { Client } = require('@googlemaps/google-maps-services-js');

const app = express();
const port = 3000;

// Load environment variables from .env file
dotenv.config();

// Initialize Vision API client
const visionClient = new vision.ImageAnnotatorClient();

// Initialize Google Maps client
const googleMapsClient = new Client({});

// Use CORS middleware to allow requests from your frontend
app.use(cors({
  origin: [
    'https://5173-idx-environ-1742316025738.cluster-mwrgkbggpvbq6tvtviraw2knqg.cloudworkstations.dev',
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Middleware to parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Classify waste type based on Vision API labels
const classifyWasteType = (labels) => {
  const recyclableLabels = ['plastic bottle', 'bottle', 'can', 'paper', 'plastic', 'glass', 'metal'];
  const hazardousLabels = ['battery', 'electronics', 'chemical', 'paint'];
  const donatableLabels = ['clothes', 'furniture', 'book'];
  const organicLabels = ['food', 'organic'];

  const matchedLabel = labels.find(label =>
    [...recyclableLabels, ...hazardousLabels, ...donatableLabels, ...organicLabels].some(key => label.includes(key))
  );

  if (!matchedLabel) {
    return 'General Waste';
  }

  if (recyclableLabels.some(key => matchedLabel.includes(key))) {
    return 'Recyclable';
  } else if (hazardousLabels.some(key => matchedLabel.includes(key))) {
    return 'Hazardous';
  } else if (donatableLabels.some(key => matchedLabel.includes(key))) {
    return 'Donatable';
  } else if (organicLabels.some(key => matchedLabel.includes(key))) {
    return 'Organic';
  } else {
    return 'General Waste';
  }
};

// Fetch nearby locations based on waste type and user location
const findNearbyLocations = async (wasteType, userLocation) => {
  let query;
  switch (wasteType) {
    case 'Recyclable':
      query = 'recycling center';
      break;
    case 'Hazardous':
      query = 'hazardous waste disposal';
      break;
    case 'Donatable':
      query = 'thrift store OR donation center';
      break;
    case 'Organic':
      query = 'compost facility';
      break;
    default:
      query = 'waste disposal';
  }

  console.log('Fetching nearby locations:', { wasteType, query, userLocation });

  try {
    const response = await googleMapsClient.placesNearby({
      params: {
        location: userLocation, // { lat, lng }
        radius: 5000, // Search within 5km
        keyword: query,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    console.log('Google Maps API Response:', response.data);

    if (response.data.status !== 'OK') {
      console.error('Google Maps API Error:', response.data.status, response.data.error_message);
      return [];
    }

    const locations = response.data.results.slice(0, 3).map(place => ({
      name: place.name,
      address: place.vicinity,
      rating: place.rating || 'N/A',
    }));

    console.log('Mapped Locations:', locations);
    return locations;
  } catch (error) {
    console.error('Error fetching nearby locations:', error);
    return [];
  }
};

// Endpoint to classify waste using Vision API and suggest locations
app.post('/classify-waste', async (req, res) => {
  try {
    const { imageBase64, userLocation } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    if (!userLocation || !userLocation.lat || !userLocation.lng) {
      return res.status(400).json({ error: 'User location (lat, lng) is required' });
    }

    // Use Google Cloud Vision API for label detection
    const [visionResult] = await visionClient.labelDetection({
      image: { content: imageBase64 },
    });

    const labels = visionResult.labelAnnotations.map(label => label.description.toLowerCase());
    console.log('Vision API Labels:', labels);

    // Classify waste type
    const wasteType = classifyWasteType(labels);

    // Fetch nearby locations
    const locations = await findNearbyLocations(wasteType, userLocation);

    res.json({ labels, wasteType, locations });
  } catch (error) {
    console.error('Error in /classify-waste:', error);
    res.status(500).json({ error: error.message || 'Failed to classify image' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});