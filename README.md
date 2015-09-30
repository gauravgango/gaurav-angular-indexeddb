# gaurav-angular-indexeddb

> An indexedDB wrapper for Angular JS.

[![Bower](https://img.shields.io/bower/v/angularjs-indexeddb.svg)]()
[![Angular JS compatibility](https://img.shields.io/badge/angular->=1.2.x-green.svg)]()

### Installation via [Bower](http://bower.io)

```bash

bower install angularjs-indexeddb

```

### Basic Usage
Add 'indexed-db' to you module dependency list
````javasript
    angular.module('demo',['indexed-db']);
````

In your module config function state your database name, version and table schema
````javascript
    angular.module('demo').config(function(indexeddvProvider){
        indexeddbProvider.setDbName('test'); //your database name
        indexeddbProvider.setDbVersion(1); //your database version
        indexeddbProivder.setDbTables(tables); //table contains your schema for varios tables
    }
````

###Dcumentation
You can find documentation [here](http://github.com)

### TODO
* Add example/demo with some basic database operations
* Add quick start to readme
* Update wiki with recent changes
