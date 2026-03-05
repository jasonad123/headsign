'use strict';

var express = require('express');
var controller = require('./placemarks.controller');

var router = express.Router();

router.get('/', controller.getPlacemarks);

module.exports = router;
