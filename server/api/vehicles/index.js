'use strict';

var express = require('express');
var controller = require('./vehicles.controller');

var router = express.Router();

router.get('/', controller.vehicles);

module.exports = router;
