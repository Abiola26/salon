'use strict';

const crypto = require('crypto');

const PREFIX = 'SALON';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BODY_LENGTH = 12;

const normalizeGiftCardCode = (value) => {
  if (typeof value !== 'string') return null;
  let body = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (body.startsWith(PREFIX)) body = body.slice(PREFIX.length);
  if (body.length !== BODY_LENGTH) return null;
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
};

const generateGiftCardCode = () => {
  let body = '';
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    body += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return normalizeGiftCardCode(body);
};

const maskGiftCardCode = (code) => (code ? `${PREFIX}-****-****-${code.slice(-4)}` : '');

module.exports = { normalizeGiftCardCode, generateGiftCardCode, maskGiftCardCode };
