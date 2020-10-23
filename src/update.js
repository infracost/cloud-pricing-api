const updaters = require('./updaters.js');
var fs = require('fs');
var path = require('path')
var dir = path.join(__dirname, '../data')

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}

updaters.run();
