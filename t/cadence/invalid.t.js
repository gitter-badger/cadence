#!/usr/bin/env node

require('proof')(1, function (equal) {
  var fs = require('fs')
    , cadence = require('../..')
    ;

  cadence(function (step) {

    step(1, 'a', 1);

  })(function (error) {
    equal(error.message, 'invalid arguments');
  });
});
