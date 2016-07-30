'use strict';
const Manager = require('./wrapper').Manager;
const WebApi = require('./wrapper').WebApi;

new WebApi(new Manager());