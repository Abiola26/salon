'use strict';

const Stripe = require('stripe');
const { STRIPE } = require('./env');

const stripe = new Stripe(STRIPE.SECRET_KEY, {
  apiVersion: '2023-10-16',
  telemetry: false,
});

module.exports = stripe;
