# gaurav-Angular-IndexedDB

> An indexedDB wrapper for Angular JS.

[![Bower](https://img.shields.io/bower/v/angularjs-indexeddb.svg)]()
[![Angular JS compatibility](https://img.shields.io/badge/angular->=1.2.x-green.svg)]()
[![Dependency Status](https://david-dm.org/gauravgango/gaurav-angular-indexeddb.svg)](https://david-dm.org/gauravgango/gaurav-angular-indexeddb)
[![devDependency Status](https://david-dm.org/gauravgango/gaurav-angular-indexeddb/dev-status.svg)](https://david-dm.org/gauravgango/gaurav-angular-indexeddb#info=devDependencies)


### Installation via [Bower](http://bower.io)

```bash

bower install angularjs-indexeddb

```

### Basic Usage

Add ```angular-indexeddb.min.js``` library to your project's ```index.html```

```html
<script src="js/angular-indexeddb.min.js" type="text/javascript">
```

Add ```indexed-db``` to you module dependency list

````javasript

    angular.module('myApp',['indexed-db']);
    
````

In your module config function state your database name, version and table schema

````javascript

    angular.module('myApp').config(function(indexeddvProvider){
        indexeddbProvider.setDbName('test'); // your database name
        indexeddbProvider.setDbVersion(1); // your database version
        indexeddbProvider.setDbTables(tables); //tables is array of objects contains your schema for various tables
    }
    
````

### Documentation
You can find detailed documentation [here](https://github.com/gauravgango/gaurav-angular-indexeddb/wiki)


#### New to indexedDB ?
* Follow [MDN Guide](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
* IndexedDB browser support [status](http://caniuse.com/#feat=indexeddb)


#### TODO
* Add example/demo with some basic database operations
* Update wiki with recent changes


#### License
-------

MIT [License](LICENSE)
