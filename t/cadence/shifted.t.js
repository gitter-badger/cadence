#!/usr/bin/env node

require('proof')(1, function (step, equal) {
  var cadence = require('../..');

  cadence(function (step) {
    step(function () {
      step(1, null)(1);
    }, function (one) {
      equal(one, 1, 'shifted');
    });
  })(step());
});
