'use strict';

const assert = require('node:assert/strict');

assert.throws(
  () => require('cuttledoc'),
  /could not load its prebuilt darwin-arm64 artifact/,
);

console.log('Missing-artifact diagnostic passed');
