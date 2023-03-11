const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const firebase = require('firebase/app');
require('firebase/database');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Initialize Firebase app
firebase.initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
});

// Define your Shopify API keys and webhook URL
const shopifyAdminApiKey = process.env.SHOPIFY_ADMIN_API_KEY;
const shopifyApiKey = process.env.SHOPIFY_API_KEY;
const shopifyApiSecret = process.env.SHOPIFY_API_SECRET;
const webhookUrl = process.env.WEBHOOK_URL;

// Define your Firebase database reference
const database = firebase.database();

// Define your webhook endpoint
app.post('/webhook', async (req, res) => {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const body = JSON.stringify(req.body);

    // Verify the authenticity of the webhook request
    const hash = crypto
        .createHmac('sha256', shopifyApiSecret)
        .update(body, 'utf8')
        .digest('base64');

    if (hash === hmac) {
        // Extract relevant data from the webhook request
        const order = req.body;
        const orderId = order.id;
        const customerEmail = order.email;
        const lineItems = order.line_items;

        // Retrieve product name and image for each line item
        const productRequests = lineItems.map(async (lineItem) => {
            const response = await fetch(`https://${order.shop_domain}/admin/api/2021-09/products/${lineItem.product_id}.json`, {
                headers: {
                    'X-Shopify-Access-Token': shopifyAdminApiKey
                }
            });
            const data = await response.json();
            return {
                name: data.product.title,
                image: data.product.image.src
            };
        });
        const products = await Promise.all(productRequests);

        // Store order data in your Firebase database
        database.ref('orders/' + orderId).set({
            email: customerEmail,
            lineItems: lineItems.map((lineItem, index) => {
                return {
                    product: products[index],
                    quantity: lineItem.quantity
                };
            }),
        });

        // Send a confirmation response to Shopify
        res.status(200).send('Webhook received successfully!');
    } else {
        // If the request is not authentic, send a 401 Unauthorized response
        res.status(401).send('Unauthorized');
    }
});

// Start the server
const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${server.address().port}`);
});
