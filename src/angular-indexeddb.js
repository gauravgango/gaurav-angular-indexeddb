/*jslint browser: true*/
/*global $q */
function indexeddbProvider($windowProvider) {
  'use strict';
  var $window = $windowProvider.$get();

  var dbName, dbVersion, dbTables;
  dbName = 'test';
  dbVersion = 1;
  dbTables = [];


  function initialize($q) {
    /**
     * Class : Function creates database and provides $q when database connection is resolved
     * @param {string} name    [name of database]
     * @param {integer} version [contains version number]
     */
    function CreateDB(name, version) {
      var self = this;
      self.name = name;
      self.version = version;
      self.indexdb = "";

      /**
       * Private : checks whether indexdb is supported by browser or not
       */
      function _check() {
        self.indexdb = $window.indexedDB || $window.mozIndexedDB || $window.webkitIndexedDB || $window.msIndexedDB;
        if (typeof self.indexdb !== "object") {
          throw "IndexedDB not supported";
        }
        self.keyRange = $window.IDBKeyRange || $window.mozIDBKeyRange || $window.webkitIDBKeyRange || $window.msIDBKeyRange;
      }

      _check();

      //connection opening for updating database
      self.open = new $window.Promise(function (resolve, reject) {

        var connection = self.indexdb.open(self.name, self.version);
        connection.onupgradeneeded = function (event) {
          resolve(event);
        };
        connection.onerror = function (event) {
          reject(event);
        };

        connection.onsuccess = function (event) {
          resolve(event);
        };
      });

      //open database in default version
      self.openConnection = new $window.Promise(function (resolve, reject) {

        var connection = self.indexdb.open(self.name);
        connection.onerror = function (event) {
          reject(event);
        };

        connection.onsuccess = function (event) {
          resolve(event);
        };
      });
    }

    /**
     * Class : Helper class with various helper functions
     */
    function DBHelper() {
      var helper = this;
      var helperObject = {};
      helperObject.isDesc = false;

      //function changes case of value if string type to lower or upper
      helper.changeCase = function (value, toUpper, caseInsensitive) {
        toUpper = (toUpper === undefined) ? false : toUpper;
        if (caseInsensitive) {
          if (typeof value === 'string') {
            value = (toUpper === true) ? value.toUpperCase() : value.toLowerCase();
          }
        }

        return value;
      };

      //function checks for like functionality in record key value
      helper.checkLikeString = function (recordKey, likeString, caseInsensitive) {
        var key = angular.copy(recordKey);
        key = key.toString();

        //if case insensitive
        if (caseInsensitive) {
          key = key.toLowerCase();
          return (key.match(likeString.toLowerCase()) !== null);
        }

        return (key.match(likeString) !== null);
      };

      /**
       * The where in logic for the object store
       * @param  {integer/string} result             [contains value to be checked against]
       * @param  {array} whereInValues      [whereIn values to search for]
       * @param  {boolean} useCaseInsensitive [override case sensitive search]
       * @return {boolean}                    [true if exists in list]
       */
      helper.whereIn = function (result, whereInValues, caseInsensitive) {

        caseInsensitive = (caseInsensitive === undefined) ? false : caseInsensitive;

        //if case sensitive then checking throughout th database
        if (caseInsensitive) {
          var resultKey, isInValue;
          isInValue = false;

          resultKey = helper.changeCase(result, false, true);

          //checking each where in value against the main result value both in lower case
          whereInValues.forEach(function (value) {
            var lowerValue = helper.changeCase(angular.copy(value), false, true);
            if (lowerValue === resultKey) {
              isInValue = true;
            }
          });

          return isInValue;
        }

        return (whereInValues.indexOf(result) !== -1);
      };

      helper.setOrderSettings = function (inValues, isNumber, isDesc) {
        //setting wherein, where not in as values of is desc for sorting
        if (isDesc) {
          helperObject.isDesc = true;
        }

        if (isNumber) {
          inValues = inValues.sort(helperObject._sortAsNumbers);

        } else {
          inValues = (helperObject.isDesc) ? inValues.reverse() : inValues.sort();
        }

        helperObject.isDesc = false;
        return inValues;
      };

      //sorting where in/ where not in as number
      helper.sortAsNumbers = function (a, b) {

        //if desc then returning b-a for descending values
        if (helperObject.isDesc) {
          return (b - a);
        }

        //returning ascending values
        return (a - b);
      };

      //function for where not in logic
      helper.whereNotIn = function (result, inValues, caseInsensitive) {
        //case sensitive
        if (caseInsensitive) {
          var resultKey = helper.changeCase(result, false, true);
          var exists = false;

          inValues.forEach(function (value) {
            var lowerValue = helper.changeCase(angular.copy(value), false, true);

            //checking if current value doesn't exist in inValues while caseInsensitive
            if (lowerValue === resultKey) {
              exists = true;
            }
          });

          if (!exists) {
            return true;
          }

        } else {
          if (inValues.indexOf(result) === -1) {
            return true;
          }
        }

        return false;
      };

      //function takes in string values in dotted format and returns the value at the result param
      helper.getPropertyValue = function (property, result) {
        var propertyValue = angular.copy(result);
        var i, properties;
        properties = property.split('.');

        if (properties.length > 1) {
          for (i = 0; i <= properties.length - 1; i++) {
            //if any of the property value is undefined then returning
            if (propertyValue[properties[i]] === undefined) {
              return undefined;
            }
            propertyValue = propertyValue[properties[i]];
          }

        } else {
          propertyValue = propertyValue[properties[0]];
        }

        return propertyValue;
      };


      //compares two values and returns the larger one
      helper.maxValue = function (value1, value2) {
        if (value1 >= value2) {
          return value1;
        }

        return value2;
      };

      //compares two values and returns the smaller one
      helper.minValue = function (value1, value2) {
        if (value1 <= value2) {
          return value1;
        }

        return value2;
      };
    }

    /**
     * Class : class for maintaining and creating tables
     * @param {string} name    [database name]
     * @param {integer} version [version of database]
     * @param {array} tables  [contains tables to be created]
     */
    function CreateTables(name, version, tables, qRes, qRej) {
      CreateDB.apply(this, [name, version]);
      this.helper = {};
      DBHelper.apply(this.helper, []);

      var self = this;
      self.tables = tables || [];
      self.models = {};

      /**
       * Class : class for maintaining builder functions of model
       * @param {array} table [table to act against] aggregate
       */
      function CreateModelBuilder(table) {
        var model = this;

        //private : function sets the model default settings
        function _defaultModelSettings() {
          model.bound = null; //default bound value
          model.index = null; //default index value
          model.caseInsensitive = false; //default caseInsensitive value
          model.hasFilter = false; //default if model has filter
          model.filterFunction = null; //default filter function
          model.whereInValues = null; //default whereInValues for whereIn
          model.whereNotInValues = null; //default whereNotInValues for whereNotIn
          model.withTables = {}; //with tables structure
          model.hasWith = false; //default has with relation status
          model.isDesc = false; //default descending traverse set to false
          model.traverse = 'next'; //default traversing set to ascending
          model.isWhereNumber = false; //default where clause not containing number
          model.originalWithRelation = null; //default original with relation data
          model.likeString = null; //default likeString data
        }

        function _setWithRelation(relations) {
          var withTables = Object.keys(relations);

          withTables.forEach(function (tableName) {
            //creating model for each instance
            var withTable = self.tables.filter(function (exisitingTable) {
              return (exisitingTable.name === tableName);
            })[0];

            model.withTables[tableName] = new CreateModelBuilder(withTable);
          });
        }

        _defaultModelSettings();

        //function sets greater than value for index
        model.gt = function (lower) {
          lower = self.helper.changeCase(lower, true, model.caseInsensitive);
          model.bound = self.keyRange.lowerBound(lower, true);
          return model;
        };

        //function sets greater than value for index including the value
        model.gte = function (lower) {
          lower = self.helper.changeCase(lower, true, model.caseInsensitive);
          model.bound = self.keyRange.lowerBound(lower);
          return model;
        };

        //function sets less than value for index including the value
        model.lte = function (upper) {
          upper = self.helper.changeCase(upper, false, model.caseInsensitive);
          model.bound = self.keyRange.upperBound(upper);
          return model;
        };

        //function sets less than value for index
        model.lt = function (upper) {
          upper = self.helper.changeCase(upper, false, model.caseInsensitive);
          model.bound = self.keyRange.upperBound(upper, true);
          return model;
        };

        //function traverse through reverse order i.e descending
        model.orderDesc = function (isDesc) {
          model.isDesc = false;
          model.traverse = 'next';

          if (isDesc === true) {
            model.isDesc = true;
            model.traverse = 'prev';
          }

          if (model.whereInValues !== null) {
            model.whereInValues = self.helper.setOrderSettings(model.whereInValues, model.isWhereNumber, model.isDesc);
          }

          if (model.whereNotInValues !== null) {
            model.whereNotInValues = self.helper.setOrderSettings(model.whereNotInValues, model.isWhereNumber, model.isDesc);
          }

          return model;
        };

        //selecting index to make searches upon
        model.select = function (index) {
          if (index === table.fields.keyPathField) {
            return model;
          }
          model.index = index;
          return model;
        };

        //function sets equal value for index searching (not case sensitive)
        model.equal = function (where) {
          model.bound = self.keyRange.only(where);
          return model;
        };

        //sets searches to case sensitive
        model.setCaseInsensitive = function (value) {
          var lower, upper, incUpper, incLower;

          value = (value === undefined || value === true);
          model.caseInsensitive = value;

          //if model has been set to case insensitive and bound values are defined then
          if (model.caseInsensitive && model.bound !== null) {

            //case not of equal
            if (model.bound.lower !== model.bound.upper) {

              //setting bound values against case insensitive
              lower = self.helper.changeCase(angular.copy(model.bound.lower), true, true);
              incLower = (model.bound.lowerOpen === undefined) ? false : angular.copy(model.bound.lowerOpen);
              upper = self.helper.changeCase(angular.copy(model.bound.upper), false, true);
              incUpper = (model.bound.upperOpen === undefined) ? false : angular.copy(model.bound.upperOpen);

              //if lower bound is undefined then setting only upper bound
              if (model.bound.lower === undefined) {
                model.bound = self.keyRange.upperBound(upper, incUpper);

              } else if (model.bound.upper === undefined) {
                //if upper bound is undefined then setting only upper bound
                model.bound = self.keyRange.lowerBound(lower, incLower);

              } else {
                //else setting both bound values
                model.bound = self.keyRange.bound(lower, upper, incLower, incUpper);
              }

            }
          }

          return model;
        };

        //between function(not case sensitive)
        model.between = function (lower, upper, incLower, incUpper) {
          incLower = (incLower !== undefined) ? false : incLower;
          incUpper = (incUpper !== undefined) ? false : incUpper;

          //checking if work to do is caseInsensitive
          if (model.caseInsensitive) {
            lower = self.helper.changeCase(lower, true, true);
            upper = self.helper.changeCase(upper, false, true);
          }

          model.bound = self.keyRange.bound(lower, upper, incLower, incUpper);
          return model;
        };

        //where in model function for setting whereInValues
        model.whereIn = function (inValues, sortAsNumbers) {

          sortAsNumbers = (sortAsNumbers === true);
          model.whereInValues = inValues;

          model.isWhereNumber = sortAsNumbers; //setting whereIn as number type

          if (model.caseInsensitive) {
            model.whereInValues = self.helper.setOrderSettings(model.whereInValues, sortAsNumbers, model.isDesc);
          }

          return model;
        };

        //function sets where not in values for model
        model.whereNotIn = function (notInValues, sortAsNumbers) {

          sortAsNumbers = (sortAsNumbers === true);
          model.whereNotInValues = notInValues;

          model.isWhereNumber = sortAsNumbers; //setting whereNotInValues as number type

          if (model.caseInsensitive) {
            model.whereNotInValues = self.helper.setOrderSettings(model.whereNotInValues, sortAsNumbers, model.isDesc);
          }

          return model;
        };

        //functions sets the filter for traversing
        model.filter = function (filterFunction) {
          model.hasFilter = true;
          if (typeof filterFunction !== 'function') {
            throw "A function must be given as parameter for filter";
          }
          model.filterFunction = filterFunction;
          return model;
        };

        //function sets the like string search setting
        model.like = function (likeString) {
          if (likeString === undefined) {
            throw "Invalid input given to like";
          }

          model.likeString = likeString.toString();
          return model;
        };

        //query builder for with relations
        model.withRelations = function (relations) {
          if (typeof relations !== 'object') {
            throw "WithRelation must be at type of object";
          }

          model.hasWith = true;
          model.originalWithRelation = relations; //keeping a record of original relation data
          model.withRelation = _setWithRelation(relations); //setting objects for using with relations

          return model;
        };

      }

      /**
       * Class : Definition for aggregation builder
       * @param {object} table [table/Object store of model]
       */
      function CreateAggregateBuilder(table) {
        CreateModelBuilder.call(this, table);
        var aggregate = this;

        //function sets the default state of aggregate builder
        function _defaultModelSettings() {
          aggregate.sums = [];
          aggregate.mins = [];
          aggregate.maxs = [];
          aggregate.averages = [];
          aggregate.customs = [];
        }

        _defaultModelSettings();

        //function registers a sum aggregate against the property
        aggregate.sum = function (property) {

          if (property === undefined) {
            property = (aggregate.index === null) ? table.fields.keyPathField : aggregate.index;
          }

          if (aggregate.sums.indexOf(property) === -1) {
            aggregate.sums.push(property);
          }

          return aggregate;
        };

        //function registers a min aggregate against the property
        aggregate.min = function (property) {

          if (property === undefined) {
            property = (aggregate.index === null) ? table.fields.keyPathField : aggregate.index;
          }

          if (aggregate.mins.indexOf(property) === -1) {
            aggregate.mins.push(property);
          }


          return aggregate;
        };

        //function registers a max aggregate against the property
        aggregate.max = function (property) {

          if (property === undefined) {
            property = (aggregate.index === null) ? table.fields.keyPathField : aggregate.index;
          }

          if (aggregate.maxs.indexOf(property) === -1) {
            aggregate.maxs.push(property);
          }

          return aggregate;
        };

        //function registers a average aggregate against the property
        aggregate.average = function (property) {

          if (property === undefined) {
            property = (aggregate.index === null) ? table.fields.keyPathField : aggregate.index;
          }

          if (aggregate.averages.indexOf(property) === -1) {
            aggregate.averages.push(property);
          }

          return aggregate;
        };

        //function registers a custom aggregate against the property
        aggregate.custom = function (name, callback, endCallback) {

          //checking various parameters before continuing
          if (typeof name !== 'string') {
            throw "Custom aggregate first parameter must be a string";
          }

          if (typeof callback !== 'function') {
            throw "Custom aggregate second parameter must be a function";
          }

          if (endCallback !== undefined) {
            if (typeof endCallback !== 'function') {
              throw "Custom aggregate third parameter must be a function";
            }
          }

          var customObject = {};
          customObject.callback = callback;
          customObject.endCallback = endCallback;
          customObject.name = name;

          var testDuplicate = aggregate.customs.filter(function (custom) {
            return (custom.name === name);
          });

          if (testDuplicate.length !== 0) {
            throw "Repeated Custom aggregate name given : " + name;
          }

          aggregate.customs.push(customObject);

          return aggregate;
        };
      }

      /**
       * Function defines query builder for other attributes not being searched by index
       * @param {object} table [table information]
       */
      function CreateOtherBuilder(table) {
        CreateAggregateBuilder.apply(this, [table]);

        var model = this;

        //function sets the default state of other builder
        function _defaultModelSettings() {
          model.andObject = null; //default andObject data
          model.orObject = null; //default orObject data
          model.inObject = null; //default inObject data
          model.notInObject = null; //default notInObject data
          model.likeObject = null; //default likeOther data
          model.gtObject = null; //default gtOther data
          model.gteObject = null; //default gteOther data
          model.ltObject = null; //default ltOther data
          model.lteObject = null; //default lteOther data
        }

        _defaultModelSettings();

        //and query builder
        model.whereOtherAnd = function (propertyName, propertyValue) {
          var andObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (model.andObject === null) {
            model.andObject = [];
          }

          andObject.propertyName = propertyName;
          andObject.propertyValue = propertyValue;

          model.andObject.push(andObject);

          return model;
        };

        //or query builder
        model.whereOtherOr = function (propertyName, propertyValue) {
          var orObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (model.orObject === null) {
            model.orObject = [];
          }

          orObject.propertyName = propertyName;
          orObject.propertyValue = propertyValue;

          model.orObject.push(orObject);

          return model;
        };

        //where in query builder
        model.whereOtherIn = function (propertyName, propertyValue) {
          var inObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (propertyValue.constructor !== Array) {
            throw "Invalid second argument. Property value must be an array";
          }

          if (model.inObject === null) {
            model.inObject = [];
          }

          inObject.propertyName = propertyName;
          inObject.propertyValue = propertyValue;

          model.inObject.push(inObject);

          return model;
        };

        //where not in query builder
        model.whereOtherNotIn = function (propertyName, propertyValue) {
          var notInObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (propertyValue.constructor !== Array) {
            throw "Invalid second argument. Property value must be an array";
          }

          if (model.notInObject === null) {
            model.notInObject = [];
          }

          notInObject.propertyName = propertyName;
          notInObject.propertyValue = propertyValue;

          model.notInObject.push(notInObject);

          return model;
        };

        //like query builder
        model.whereOtherLike = function (propertyName, propertyValue) {
          var likeObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (typeof propertyValue !== "string") {
            throw "Invalid second argument. Property value must be an string";
          }

          if (model.likeObject === null) {
            model.likeObject = [];
          }

          likeObject.propertyName = propertyName;
          likeObject.propertyValue = propertyValue;

          model.likeObject.push(likeObject);

          return model;
        };

        //greater then query builder
        model.whereOtherGt = function (propertyName, propertyValue) {
          var gtObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (propertyValue === undefined || propertyValue === '') {
            throw "Invalid second argument. Property value cannot be empty";
          }

          if (model.gtObject === null) {
            model.gtObject = [];
          }

          gtObject.propertyName = propertyName;
          gtObject.propertyValue = propertyValue;

          model.gtObject.push(gtObject);

          return model;
        };

        //greater than equal query builder
        model.whereOtherGte = function (propertyName, propertyValue) {
          var gteObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (propertyValue === undefined || propertyValue === '') {
            throw "Invalid second argument. Property value cannot be empty";
          }

          if (model.gteObject === null) {
            model.gteObject = [];
          }


          gteObject.propertyName = propertyName;
          gteObject.propertyValue = propertyValue;

          model.gteObject.push(gteObject);

          return model;
        };

        //less than equal query builder
        model.whereOtherLte = function (propertyName, propertyValue) {
          var lteObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (propertyValue === undefined || propertyValue === '') {
            throw "Invalid second argument. Property value cannot be empty";
          }

          if (model.lteObject === null) {
            model.lteObject = [];
          }

          lteObject.propertyName = propertyName;
          lteObject.propertyValue = propertyValue;

          model.lteObject.push(lteObject);

          return model;
        };

        //less than query builder
        model.whereOtherLt = function (propertyName, propertyValue) {
          var ltObject = {};
          if (typeof propertyName !== "string") {
            throw "Invalid first argument. Property name must be a string";
          }

          if (propertyValue === undefined || propertyValue === '') {
            throw "Invalid second argument. Property value cannot be empty";
          }

          if (model.ltObject === null) {
            model.ltObject = [];
          }

          ltObject.propertyName = propertyName;
          ltObject.propertyValue = propertyValue;

          model.ltObject.push(ltObject);

          return model;
        };
      }

      /**
       * Class : Final builder class that fires various action in promises
       * @param {object} table [table/object store of model]
       */
      function CreateModel(table) {
        CreateOtherBuilder.apply(this, [table]);

        var model = this;
        var transaction;
        var objectStore;
        var withRelationObject = {};
        var aggregateObject = {};

        /**
         * Function checks result against various model filters
         * @param  {IDBCursor} result [contains the IDBCursor value against the current record]
         * @return {boolean}        [true if passes all]
         */
        function _checkResult(result) {
          var i, propertyValue, andStatus, orStatus, hasAnd, property;
          andStatus = true;
          orStatus = false;
          hasAnd = false;

          //if model has filter
          if (model.hasFilter) {
            if (model.filterFunction(result.value) !== true) {
              return false;
            }
          }

          //checking for likeness in data
          if (model.likeString !== null) {
            if (self.helper.checkLikeString(result.key, model.likeString, model.caseInsensitive) === false) {
              return false;
            }
          }

          //first for whereIn model values then whereNotIn else default
          if (model.whereInValues !== null) {
            if (!self.helper.whereIn(result.key, model.whereInValues, model.caseInsensitive)) {
              return false;
            }

          }

          if (model.whereNotInValues !== null) {
            if (!self.helper.whereNotIn(result.key, model.whereNotInValues, model.caseInsensitive)) {
              return false;
            }

          }

          //checking other values as where not in conditions
          if (model.inObject !== null) {

            //for each condition set against the value
            for (i = model.inObject.length - 1; i >= 0; i--) {
              property = model.inObject[i];

              //fetching value at that propery in main result
              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              //if property value is undefined then returning false
              if (propertyValue === undefined) {
                return false;
              }

              if (!self.helper.whereIn(propertyValue, property.propertyValue, model.caseInsensitive)) {
                return false;
              }

            }
          }

          //checking other values as where in conditions
          if (model.notInObject !== null) {

            //for each condition set against the value
            for (i = model.notInObject.length - 1; i >= 0; i--) {
              property = model.notInObject[i];

              //fetching value at that propery in main result
              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              //if property value is undefined then returning false
              if (propertyValue === undefined) {
                continue;
              }

              if (!self.helper.whereNotIn(propertyValue, property.propertyValue, model.caseInsensitive)) {
                return false;
              }

            }
          }

          //checking other values as like condition
          if (model.likeObject !== null) {

            for (i = model.likeObject.length - 1; i >= 0; i--) {
              property = model.likeObject[i];

              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              if (propertyValue === undefined) {
                return false;
              }

              if (!self.helper.checkLikeString(propertyValue, property.propertyValue, model.caseInsensitive)) {
                return false;
              }
            }
          }

          //checking other values as greater than equal condition
          if (model.gteObject !== null) {

            for (i = model.gteObject.length - 1; i >= 0; i--) {
              property = model.gteObject[i];

              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              if (propertyValue === undefined) {
                return false;
              }

              if (property.propertyValue < propertyValue) {
                return false;
              }
            }
          }

          //checking other values as greater than condition
          if (model.gtObject !== null) {

            for (i = model.gtObject.length - 1; i >= 0; i--) {
              property = model.gtObject[i];

              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              if (propertyValue === undefined) {
                return false;
              }

              if (property.propertyValue <= propertyValue) {
                return false;
              }
            }
          }

          //checking other values as less than equal condition
          if (model.lteObject !== null) {

            for (i = model.lteObject.length - 1; i >= 0; i--) {
              property = model.lteObject[i];

              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              if (propertyValue === undefined) {
                return false;
              }

              if (property.propertyValue > propertyValue) {
                return false;
              }
            }
          }

          //checking other values as less than equal condition
          if (model.ltObject !== null) {

            for (i = model.ltObject.length - 1; i >= 0; i--) {
              property = model.ltObject[i];

              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              if (propertyValue === undefined) {
                return false;
              }

              if (property.propertyValue >= propertyValue) {
                return false;
              }
            }
          }

          //checking other values as and conditions
          if (model.andObject !== null) {

            hasAnd = true;

            for (i = model.andObject.length - 1; i >= 0; i--) {
              property = model.andObject[i];

              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              if (propertyValue === undefined || propertyValue !== property.propertyValue) {
                andStatus = false;
                break;
              }
            }
          }

          if (model.orObject !== null) {
            orStatus = false;

            if (!hasAnd) {
              andStatus = false;
              if (model.orObject.length === 0) {
                return true;
              }
            }


            for (i = model.orObject.length - 1; i >= 0; i--) {
              property = model.orObject[i];

              propertyValue = self.helper.getPropertyValue(property.propertyName, result.value);

              if (propertyValue !== undefined && propertyValue === property.propertyValue) {
                orStatus = true;
                break;
              }
            }
          }

          if (!(andStatus || orStatus)) {
            return false;
          }

          return true;
        }

        //function : withRelation action to retrieve all relational data in main outcome
        withRelationObject.getRelationData = function (outcome, isFind, propertyName) {
          var _id;
          if (isFind) {
            _id = angular.copy(outcome[propertyName]);

            //if _id is undefined then
            if (_id === undefined) {
              return false;
            }

            //_id is not an array then
            if (_id.constructor !== Array) {
              _id = [_id];
            }
            _id = _id.sort();

            return _id;
          }

          _id = [];

          outcome.forEach(function (value) {
            if (value[propertyName] !== undefined) {
              value[propertyName].forEach(function (propertyValue) {
                if (_id.indexOf(propertyValue) === -1) {
                  _id.push(propertyValue);
                }
              });
            }
          });

          _id = _id.sort();

          if (_id.length === 0) {
            return false;
          }

          return _id;

        };

        //function sets outcome value by setting with Relation property or relational table
        //and sets checks if the relation exists in main outcome
        withRelationObject.setOutcome = function (outcome, withTableName, propertyName, relationsData, isFind) {
          var tableSchema = self.tables.filter(function (tableObject) {
            return (tableObject.name === withTableName);
          })[0];

          if (isFind) {
            outcome.Relations = outcome.Relations || {};
            outcome.Relations[withTableName] = [];
            relationsData.forEach(function (relationData) {
              if (outcome[propertyName].indexOf(relationData[tableSchema.fields.keyPathField]) > 0) {
                outcome.Relations[withTableName].push(relationData);
              }
            });
            return outcome;
          }

          outcome.forEach(function (outcomeData) {
            outcomeData.Relations = outcomeData.Relations || {};
            outcomeData.Relations[withTableName] = [];

            relationsData.forEach(function (relationData) {

              if (outcomeData[propertyName] === undefined) {
                return false;
              }

              if (outcomeData[propertyName].indexOf(relationData[tableSchema.fields.keyPathField]) >= 0) {
                outcomeData.Relations[withTableName].push(relationData);
              }
            });
          });
          return outcome;
        };

        /**
         * private : function calls relation tables and fetches their data
         * @param  {[type]}  resolve           [description]
         * @param  {[type]}  reject            [description]
         * @param  {array/object}  outcome           [contains main table record(s)]
         * @param  {object}  objectStoreTables [with tables in transaction mode]
         * @param  {Boolean} isFind            [true for find condition]
         */
        withRelationObject.getWithAllData = function (resolve, reject, outcome, objectStoreTables, isFind) {
          //setting default value for isFind
          isFind = (isFind === undefined) ? false : isFind;

          var withTablesCount, relationNames;

          relationNames = Object.keys(objectStoreTables); //getting relational table names
          withTablesCount = relationNames.length;

          var currentCount = 0;

          //for each relational table
          relationNames.forEach(function (withTableName) {
            var _id;
            //retrieving relation values from main table
            _id = withRelationObject.getRelationData(outcome, isFind, model.originalWithRelation[withTableName].field);

            //if main table has no relation values then setting Relation status that relational table as empty array
            if (_id === false) {
              outcome = withRelationObject.setOutcome(outcome, withTableName, model.originalWithRelation[withTableName].field, [], isFind);
              currentCount = currentCount + 1;

              if (currentCount === withTablesCount) {
                resolve(outcome);
              }
              return false;
            }

            var currentOutcome = [];
            var hasFilter = false;

            //if filter was set in relation then setting hasFilter flag
            if (typeof model.originalWithRelation[withTableName].filter === 'function') {
              hasFilter = true;
            }

            //opening relational table and fetching data
            objectStoreTables[withTableName].openCursor(self.keyRange.bound(_id[0], _id[(_id.length - 1)])).onsuccess = function (event) {
              try {

                var cursor = event.target.result;
                if (cursor) {

                  //if relation has filter
                  if (hasFilter) {
                    if (model.originalWithRelation[withTableName].filter(cursor.value) !== true) {
                      cursor.continue();
                      return false;
                    }
                  }

                  if (!self.helper.whereIn(cursor.key, _id, false)) {
                    cursor.continue();
                    return false;
                  }

                  currentOutcome.push(cursor.value);
                  cursor.continue();

                } else {
                  //when traversing is done
                  outcome = withRelationObject.setOutcome(outcome, withTableName, model.originalWithRelation[withTableName].field, currentOutcome, isFind);

                  currentCount = currentCount + 1;

                  //when all of the relation tables have completed traversing then resolving
                  if (currentCount === withTablesCount) {
                    resolve(outcome);
                  }
                }
              } catch (exception) {
                transaction.abort();
                reject(exception);
              }
            };

            //case or error of in relation object store
            objectStoreTables[withTableName].openCursor(self.keyRange.bound(_id[0], _id[(_id.length - 1)])).onerror = function (e) {
              transaction.abort();
              reject(e);
            };
          });

        };

        //function : calculates aggregate of sum against all sum set
        aggregateObject.getSums = function (outcome, result) {
          if (model.sums.length === 0) {
            return outcome;
          }

          outcome.sums = outcome.sums || {};

          model.sums.forEach(function (property) {
            outcome.sums[property] = (outcome.sums[property] === undefined) ? 0 : outcome.sums[property];
            var value = self.helper.getPropertyValue(property, result);
            if (typeof value === 'number') {
              outcome.sums[property] = outcome.sums[property] + value;
            }
          });

          return outcome;
        };

        //function : calculates aggregate of min against all min set
        aggregateObject.getMins = function (outcome, result) {
          if (model.mins.length === 0) {
            return outcome;
          }

          outcome.mins = outcome.mins || {};

          model.mins.forEach(function (property) {
            var value = self.helper.getPropertyValue(property, result);

            if (value === undefined) {
              return false;
            }

            outcome.mins[property] = (outcome.mins[property] === undefined) ? value : outcome.mins[property];

            outcome.mins[property] = self.helper.minValue(outcome.mins[property], value);
          });

          return outcome;
        };

        //function : calculates aggregate of max against all max set
        aggregateObject.getMaxs = function (outcome, result) {
          if (model.mins.length === 0) {
            return outcome;
          }

          outcome.maxs = outcome.maxs || {};

          model.maxs.forEach(function (property) {
            var value = self.helper.getPropertyValue(property, result);

            if (value === undefined) {
              return false;
            }

            outcome.maxs[property] = (outcome.maxs[property] === undefined) ? value : outcome.maxs[property];

            outcome.maxs[property] = self.helper.maxValue(outcome.maxs[property], value);
          });

          return outcome;
        };

        //function : calculates aggregate of averages against all averages set
        aggregateObject.getAverages = function (outcome, resultOrCount, finalCalculation) {
          if (model.averages.length === 0) {
            return outcome;
          }

          outcome.averages = outcome.averages || {};

          model.averages.forEach(function (property) {
            if (finalCalculation === true) {
              outcome.averages[property] = outcome.averages[property] / resultOrCount;
              return false;
            }

            outcome.averages[property] = (outcome.averages[property] === undefined) ? 0 : outcome.averages[property];

            var value = self.helper.getPropertyValue(property, resultOrCount);

            if (typeof value === 'number') {
              outcome.averages[property] = outcome.averages[property] + value;
            }
          });

          return outcome;
        };

        //function : calculates aggregate of custom functions against all custom functions set
        aggregateObject.getCustoms = function (outcome, resultOrCount, finalCalculation) {
          if (model.customs.length === 0) {
            return outcome;
          }

          outcome.customs = outcome.customs || {};

          model.customs.forEach(function (customObject) {
            if (finalCalculation === true && customObject.endCallback !== undefined) {
              outcome.customs[customObject.name] = customObject.endCallback(outcome[customObject.name], resultOrCount);
              return false;
            }

            outcome.customs[customObject.name] = (outcome.customs[customObject.name] === undefined) ? 0 : outcome.customs[customObject.name];

            var value = self.helper.getPropertyValue(customObject.name, resultOrCount);

            outcome.customs[customObject.name] = customObject.callback(outcome.customs[customObject.name], value);
          });

          return outcome;
        };

        //private : function returns array of table names to perform transaction on
        function _getTransactionTables() {
          var transactionTables = [];
          //default pushing main table name
          transactionTables.push(table.name);

          if (model.hasWith) {
            //pushing relation table names
            var withTables = Object.keys(model.withTables);
            withTables.forEach(function (withTable) {
              transactionTables.push(withTable);
            });

          }

          return transactionTables;
        }

        //private : wrapper for calling default getAll with callback for success
        function _get(callback, readwrite) {
          //setting read write status flag of transaction
          var write = (readwrite === undefined || readwrite === false || readwrite === null) ? 'readonly' : 'readwrite';

          var transactionTables = [];
          var relations = {};

          return $q(function (resolve, reject) {
            self.openConnection.then(function (event) {
              try {
                var db = event.target.result;
                //opening transaction
                transactionTables = _getTransactionTables();
                transaction = db.transaction(transactionTables, write);

                //if model has with relation
                if (model.hasWith) {
                  transactionTables.splice(0, 1);
                  transactionTables.forEach(function (tableName) {
                    relations[tableName] = transaction.objectStore(tableName);
                  });

                }

                objectStore = transaction.objectStore(table.name);

                //if index is defined then adding index to object store
                if (model.index !== null) {
                  objectStore = objectStore.index(model.index);
                }

                objectStore = objectStore.openCursor(model.bound, model.traverse);

                //on success giving callback with promise and relation data
                objectStore.onsuccess = function (event) {
                  try {
                    callback(event, resolve, reject, relations);

                  } catch (exception) {
                    transaction.abort();
                    reject(exception);
                  }
                };

                objectStore.onerror = function (error) {
                  transaction.abort();
                  reject(error);
                };

                transaction.onerror = function (error) {
                  reject(error);
                };

              } catch (exception) {
                reject(exception);
              }

            }).catch(function (error) {
              reject(error);
            });
          });
        }

        //private : function returns new object value to be updated with timestamps
        function _updateValue(result, data, hasTimeStamp) {
          hasTimeStamp = (hasTimeStamp === undefined) ? false : hasTimeStamp;

          var newValue = angular.copy(result);

          var properties = Object.keys(data);
          properties.forEach(function (property) {
            newValue[property] = data[property];
          });

          if (table.hasTimeStamp && !hasTimeStamp) {
            newValue.updatedAt = Date.parse(Date());
          }

          if (hasTimeStamp) {
            newValue.updatedAt = Date.parse(Date());
          }

          return newValue;
        }

        //private : function updates the relations indexes by adding new values
        withRelationObject.update = function (record, data) {
          //retrieving properties to be updated
          var properties = Object.keys(data);

          properties.forEach(function (property) {
            //if property in main record is undefined
            if (record[property] === undefined) {
              record[property] = [];
            }
            data[property].forEach(function (relation) {
              //checking if relation already exists if not then adding

              //if relation is greater than or equal to zero then adding the relation
              if (relation >= 0) {
                if (record[property].indexOf(relation) === -1) {
                  record[property].push(relation);
                }
              } else {
                //else removing relation
                var index = record[property].indexOf(relation * (-1));
                if (index !== -1) {
                  record[property].splice(index, 1);
                }
              }
            });
          });

          return record;
        };

        /**
         * private : function adds relation id to related tables. If many relation is set then also adds the relation tables record ids to the main table for creating many to many
         * @param {resolve} resolve           [resolves the promise]
         * @param {reject} reject            [rejects the promise]
         * @param {integer} outcome           [contains newly created records key path value]
         * @param {object} objectStoreTables [with tables in transaction mode]
         * @param {IDBTransaction} transaction       [transaction instance]
         */
        withRelationObject.add = function (resolve, reject, outcome, objectStoreTables, transaction) {
          var withTablesCount, relationNames;

          relationNames = Object.keys(objectStoreTables); //getting relational table names
          withTablesCount = relationNames.length;

          var currentCount = 0;
          var manyOutcome = {};

          relationNames.forEach(function (withTableName) {
            var hasFilter = false; //setting if with table has filter
            var isMany = false; //if main table is in many to many relationship
            var many = [];

            //if filter was set in relation then setting hasFilter flag
            if (typeof model.originalWithRelation[withTableName].filter === 'function') {
              hasFilter = true;
            }

            //setting flag for many to many
            if (typeof model.originalWithRelation[withTableName].many === 'object') {
              if (model.originalWithRelation[withTableName].many.isMany === true) {
                isMany = true;
              }
            }

            //opening cursor on relation table
            objectStoreTables[withTableName].openCursor().onsuccess = function (event) {
              var cursor = event.target.result;

              if (cursor) {
                var newValue = _updateValue(cursor.value, {}, true);

                //if relation has filter
                if (hasFilter) {
                  if (model.originalWithRelation[withTableName].filter(angular.copy(cursor.value)) !== true) {
                    cursor.continue();
                    return;
                  }
                }

                //if property of relation is undefined then creating one as an array
                if (newValue[model.originalWithRelation[withTableName].field] === undefined) {
                  newValue[model.originalWithRelation[withTableName].field] = [];
                }

                //if relation does not have the index then adding it to list
                if (newValue[model.originalWithRelation[withTableName].field].indexOf(outcome._id) === -1) {
                  newValue[model.originalWithRelation[withTableName].field].push(outcome._id);

                  //case for many to many
                  if (isMany) {
                    many.push(cursor.value._id);
                  }
                }

                cursor.update(newValue);
                cursor.continue();

              } else {
                currentCount = currentCount + 1;

                //case for may then adding many relation to newly created object
                if (isMany === true) {
                  manyOutcome[model.originalWithRelation[withTableName].many.field] = many;
                }

                if (currentCount === withTablesCount) {

                  //if is many relationship then also updating current outcome value
                  if (isMany) {
                    outcome = _updateValue(outcome, manyOutcome);

                    var newObjectStore = transaction.objectStore(table.name);

                    newObjectStore.put(outcome).onsuccess = function () {
                      resolve(outcome);
                    };

                    newObjectStore.onerror = function (error) {
                      transaction.abort();
                      reject(error);
                    };

                  } else {
                    resolve(outcome);
                  }
                }
              }
            };

            objectStoreTables[withTableName].openCursor().onerror = function (error) {
              transaction.abort();
              reject(error);
            };
          });
        };

        /**
         * private : function delete the record relation to other tables
         * @param  {resolve}  resolve           [resolves the promise]
         * @param  {reject}  reject            [reject the promise]
         * @param  {array/integer}  value             [contains the id(s) of records delete]
         * @param  {object}  objectStoreTables [with tables in transaction mode]
         * @param  {Boolean} isDestroy         [for destroy mode]
         */
        withRelationObject.destroy = function (resolve, reject, value, objectStoreTables, isDestroy, count) {
          isDestroy = (isDestroy === undefined) ? false : isDestroy;
          var withTablesCount, relationNames;

          relationNames = Object.keys(objectStoreTables); //getting relational table names
          withTablesCount = relationNames.length;

          var currentCount = 0;
          var bound;

          //setting bound values for cursor location
          if (isDestroy) {
            value = value.sort();
            bound = self.keyRange.bound(value[0], value[(value.length - 1)]);
          } else {
            bound = self.keyRange.only(value);
          }

          relationNames.forEach(function (withTableName) {
            objectStoreTables[withTableName].index(model.originalWithRelation[withTableName].field).openCursor(bound).onsuccess = function (event) {
              try {
                var cursor = event.target.result;
                if (cursor) {
                  var newValue = _updateValue(cursor.value, {}, true);
                  if (newValue[model.originalWithRelation[withTableName].field] === undefined) {
                    cursor.continue();
                    return;
                  }

                  var index;
                  if (isDestroy) {
                    value.forEach(function (_id) {
                      index = newValue[model.originalWithRelation[withTableName].field].indexOf(_id);

                      if (index !== -1) {
                        newValue[model.originalWithRelation[withTableName].field].splice(index, 1);
                      }
                    });
                  } else {
                    index = newValue[model.originalWithRelation[withTableName].field].indexOf(value);

                    if (index === -1) {
                      cursor.continue();
                      return;
                    }

                    newValue[model.originalWithRelation[withTableName].field].splice(index, 1);
                  }


                  cursor.update(newValue);
                  cursor.continue();

                } else {

                  currentCount = currentCount + 1;

                  if (currentCount === withTablesCount) {
                    resolve(count);
                  }
                }
              } catch (exception) {
                transaction.abort();
                reject(exception);
              }

            };

            objectStoreTables[withTableName].onerror = function (error) {
              transaction.abort();
              reject(error);
            };
          });
        };

        //finds a single record according to value set (not case sensitive)
        model.find = function () {

          var getId = $q(function (resolve, reject) {
            self.openConnection.then(function (event) {
              var transactionTables = [];
              var relations = {};

              try {
                var db = event.target.result;

                transactionTables = _getTransactionTables();
                transaction = db.transaction(transactionTables);

                if (model.hasWith) {
                  transactionTables.splice(0, 1);
                  transactionTables.forEach(function (withTableName) {
                    relations[withTableName] = transaction.objectStore(withTableName);
                  });
                }

                objectStore = transaction.objectStore(table.name);

                //if index is set then searching on the index
                if (model.index !== null) {
                  objectStore = objectStore.index(model.index);
                }

                objectStore = objectStore.get(model.bound);
                objectStore.onsuccess = function (record) {
                  try {
                    //if no record was found then resolving
                    if (record === undefined) {
                      resolve(record);
                      return false;
                    }

                    //if with relationship was defined then
                    if (model.hasWith) {
                      withRelationObject.getWithAllData(resolve, reject, record.target.result, relations, true);
                      return false;
                    }

                    resolve(record.target.result);

                  } catch (exception) {
                    transaction.abort();
                    reject(exception);
                  }
                };

                objectStore.onerror = function (error) {
                  transaction.abort();
                  reject(error);
                };

                transaction.onerror = function (error) {
                  reject(error);
                };

              } catch (exception) {
                reject(exception);
              }


            }).catch(function (error) {
              reject(error);
            });

          });

          return getId;
        };

        //function adds single record
        model.add = function (data) {

          var add = $q(function (resolve, reject) {
            self.openConnection.then(function (event) {

              var transactionTables = [];
              var relations = {};

              try {
                var db = event.target.result;

                transactionTables = _getTransactionTables();
                transaction = db.transaction(transactionTables, "readwrite");

                if (model.hasWith) {
                  transactionTables.splice(0, 1);
                  transactionTables.forEach(function (withTableName) {
                    relations[withTableName] = transaction.objectStore(withTableName);
                  });
                }

                objectStore = transaction.objectStore(table.name);
                if (table.hasTimeStamp) {
                  data.updatedAt = Date.parse(Date());
                  data.createdAt = Date.parse(Date());
                }
                objectStore = objectStore.add(data);

                objectStore.onsuccess = function (event) {
                  try {
                    var result;
                    result = data;

                    //adding key path value to the data object after adding
                    result[table.fields.keyPathField] = event.target.result;

                    if (model.hasWith) {
                      withRelationObject.add(resolve, reject, result, relations, transaction);
                    } else {
                      resolve(result);

                    }

                  } catch (exception) {
                    transaction.abort();
                    reject(exception);
                  }

                };

                objectStore.onerror = function (error) {
                  transaction.abort();
                  reject(error);
                };

                transaction.onerror = function (event) {
                  reject(event.srcElement.error);
                };
              } catch (exception) {
                reject(exception);
              }

            }).catch(function (error) {
              reject(error);
            });
          });

          return add;
        };

        //add multiple data at once in single transaction
        model.addMultiple = function (data) {
          var outcome = [];
          var count = data.length; //total no of records to be inserted
          var inserted = 0; //no of records inserted

          var add = $q(function (resolve, reject) {

            self.openConnection.then(function (event) {
              try {

                var db = event.target.result;
                transaction = db.transaction([table.name], "readwrite");

                try {

                  objectStore = transaction.objectStore(table.name);
                  //for each record
                  data.forEach(function (toAddData) {

                    //adding time stamps if allowed
                    if (table.hasTimeStamp) {
                      toAddData.updatedAt = Date.parse(Date());
                      toAddData.createdAt = Date.parse(Date());
                    }

                    //single add instance
                    objectStore.add(toAddData).onsuccess = function (event) {
                      try {
                        var result;
                        result = data[inserted];

                        //adding newly inserted key path value to the object
                        result[table.fields.keyPathField] = event.target.result;

                        outcome.push(result);
                        inserted = inserted + 1;

                        //if inserted count is equal to total no of records then resolving
                        if (inserted === count) {
                          resolve(outcome);
                        }
                      } catch (exception) {
                        transaction.abort();
                        reject(exception);
                      }

                    };
                  });

                } catch (exception) {
                  transaction.abort();
                  reject(exception);
                  return;
                }


                transaction.onerror = function (event) {
                  reject(event.srcElement.error);
                };
              } catch (exception) {
                reject(exception);
              }

            }).catch(function (error) {
              reject(error);
            });

          });

          return add;
        };

        //function is default getAll function retrieves all data
        model.getAll = function () {
          var outcome = [];

          var getId = _get(function (event, resolve, reject, withTables) {

            var result = event.target.result;

            if (result) {
              if (!_checkResult(result)) {
                result.continue();
                return false;
              }

              outcome.push(result.value);
              result.continue();


            } else {
              if (outcome.length === 0) {
                resolve(outcome);
                return false;
              }

              //if model has relations then resolving when relation transactions are complete else resolving
              if (model.hasWith) {
                withRelationObject.getWithAllData(resolve, reject, outcome, withTables);
                return false;
              }

              resolve(outcome);

            }
          });
          return getId;
        };

        //wrapper function firing default put on the indexed db
        model.put = function (data) {
          var put = $q(function (resolve, reject) {
            self.openConnection.then(function (event) {
              try {
                var db = event.target.result;
                transaction = db.transaction([table.name], "readwrite");
                objectStore = transaction.objectStore(table.name);

                if (table.hasTimeStamp) {
                  data.updatedAt = Date.parse(Date());

                  if (data.createdAt === undefined) {
                    data.createdAt = Date.parse(Date());
                  }
                }

                if (data[table.fields.keyPathField] === undefined) {
                  transaction.abort();
                  reject(new Error("KeyPath field not provied for update"));
                }

                //firing put method
                objectStore = objectStore.put(data);

                objectStore.onsuccess = function (event) {
                  try {
                    //adding newly/existing key path value to the object
                    data[table.keyPathField] = event.target.result;
                    resolve(data);

                  } catch (exception) {
                    transaction.abort();
                    reject(exception);
                  }
                };

                objectStore.onerror = function (error) {
                  transaction.abort();
                  reject(error);
                };

                transaction.onerror = function (error) {
                  reject(error);
                };

              } catch (exception) {
                reject(exception);
              }

            }).catch(function (error) {
              reject(error);
            });

          });

          return put;
        };

        //function fires update method on the model
        model.update = function (data) {
          if (typeof data !== 'object') {
            throw "Data must be type of object";
          }

          var count = 0;
          var update = _get(function (event, resolve) {
            var result = event.target.result;
            var newValue;

            if (result) {


              if (!_checkResult(result)) {
                result.continue();
                return false;
              }

              newValue = _updateValue(result.value, data);

              //setting with relation data to the record as well
              if (model.hasWith) {
                newValue = withRelationObject.update(newValue, model.originalWithRelation);
              }

              result.update(newValue);
              count = count + 1;
              result.continue();


            } else {
              resolve(count);
            }
          }, true);

          return update;
        };

        //wrapper for default delete in indexeddb
        model.delete = function (value) {

          if (value === undefined) {
            throw "Empty value provided for deleting";
          }
          var objectStoreDelete;
          var deleteId = $q(function (resolve, reject) {
            self.openConnection.then(function (event) {
              try {

                var db = event.target.result;
                var relations = {};

                var transactionTables = _getTransactionTables();
                transaction = db.transaction(transactionTables, 'readwrite');

                if (model.hasWith) {
                  transactionTables.splice(0, 1);
                  transactionTables.forEach(function (withTableName) {
                    relations[withTableName] = transaction.objectStore(withTableName);
                  });
                }

                objectStore = transaction.objectStore(table.name);
                objectStoreDelete = transaction.objectStore(table.name);

                objectStore.get(value).onsuccess = function (record) {
                  if (record.target.result === undefined) {
                    resolve(0);
                    return false;
                  }
                  objectStoreDelete = objectStoreDelete.delete(value);

                  objectStoreDelete.onsuccess = function () {
                    try {
                      if (model.hasWith) {
                        withRelationObject.destroy(resolve, reject, value, relations, 1);
                      } else {
                        resolve(1);
                      }
                    } catch (exception) {
                      transaction.abort();
                      reject(exception);
                    }

                  };

                  objectStoreDelete.onerror = function (error) {
                    transaction.abort();
                    reject(error);
                  };
                };


                transaction.onerror = function (error) {
                  reject(error);
                };

              } catch (exception) {
                reject(exception);
              }

            }).catch(function (error) {
              reject(error);
            });
          });

          return deleteId;
        };

        //function to delete on cursor location
        model.destroy = function () {
          var count = 0;
          var deletedIds = [];

          var del = _get(function (event, resolve, reject, relations) {
            var result = event.target.result;

            if (result) {
              if (!_checkResult(result)) {
                result.continue();
                return false;
              }

              deletedIds.push(result.value[table.fields.keyPathField]);
              result.delete();

              count = count + 1;
              result.continue();

            } else {

              if (model.hasWith) {
                withRelationObject.destroy(resolve, reject, deletedIds, relations, true, count);
              } else {
                resolve(count);
              }
            }
          }, true);

          return del;
        };


        /**
         * Class : Function contains definition for aggregation
         */
        function CreateAggregate() {
          var aggregate = this;

          //function counts the number of records
          aggregate.count = function () {
            var count = 0;

            var c = _get(function (event, resolve) {
              var result = event.target.result;

              //if record exists
              if (result) {

                //passing result through filter
                if (!_checkResult(result)) {
                  result.continue();
                  return false;
                }

                count = count + 1;
                result.continue();
              } else {
                resolve(count);
              }

            });

            return c;
          };

          //function calculates sum of records against the property if its value is numeric
          aggregate.sum = function (property) {
            var value;
            var sum = 0;

            //if property is undefined then taking model index or the keyPath field
            if (property === undefined) {
              property = (model.index === null) ? table.fields.keyPathField : model.index;
            }

            var c = _get(function (event, resolve) {
              var result = event.target.result;

              //if record exists
              if (result) {

                //passing result through filter
                if (!_checkResult(result)) {
                  result.continue();
                  return false;
                }

                //getting the value at the property
                value = self.helper.getPropertyValue(property, result.value);

                if (typeof value === 'number') {
                  sum = sum + value;
                }
                result.continue();

              } else {
                resolve(sum);
              }

            });

            return c;
          };

          //function retrieves the max value at the property
          aggregate.max = function (property) {
            var value;
            var max = null;

            //if property is undefined then taking model index or the keyPath field
            if (property === undefined) {
              property = (model.index === null) ? table.fields.keyPathField : model.index;
            }

            var m = _get(function (event, resolve) {
              var result = event.target.result;

              //if record exists
              if (result) {

                //passing result through filter
                if (!_checkResult(result)) {
                  result.continue();
                  return false;
                }

                value = self.helper.getPropertyValue(property, result.value);

                //if pointer is at first record then setting the value of max as that else checking
                if (value !== undefined) {
                  max = (max === null) ? value : self.helper.maxValue(max, value);
                }
                result.continue();

              } else {
                resolve(max);
              }

            });

            return m;
          };

          //function calculates the min value of property
          aggregate.min = function (property) {
            var value;
            var min = null;

            //if property is undefined then taking model index or the keyPath field
            if (property === undefined) {
              property = (model.index === null) ? table.fields.keyPathField : model.index;
            }

            var m = _get(function (event, resolve) {
              var result = event.target.result;

              //if record exists
              if (result) {

                //passing result through filter
                if (!_checkResult(result)) {
                  result.continue();
                  return false;
                }

                value = self.helper.getPropertyValue(property, result.value);

                //if pointer is at first record then setting the value of min as that else checking
                if (value !== undefined) {
                  min = (min === null) ? value : self.helper.minValue(min, value);
                }
                result.continue();

              } else {
                resolve(min);
              }

            });

            return m;
          };

          aggregate.average = function (property) {
            var value;
            var average = 0,
              sum = 0,
              count = 0;

            if (property === undefined) {
              property = (model.index === null) ? table.fields.keyPathField : model.index;
            }

            var a = _get(function (event, resolve) {
              var result = event.target.result;

              //if record exists
              if (result) {

                //passing result through filter
                if (!_checkResult(result)) {
                  result.continue();
                  return false;
                }

                count++;

                value = self.helper.getPropertyValue(property, result.value);
                if (typeof value === 'number') {
                  sum = sum + value;
                }

                result.continue();

              } else {
                average = (sum === 0 && count === 0) ? 0 : sum / count;
                resolve(average);
              }

            });

            return a;
          };

          aggregate.custom = function (callback, endCallback) {
            if (typeof callback !== 'function') {
              throw "Parameter passed to custom aggregate must be of function type";
            }

            var outcome = 0;

            var cust = _get(function (event, resolve, reject) {
              var result = event.target.result;

              if (result) {
                //passing result through filter
                if (!_checkResult(result)) {
                  result.continue();
                  return false;
                }

                try {
                  outcome = callback(outcome, angular.copy(result.value));
                } catch (exception) {
                  transaction.abort();
                  reject(exception);
                  return false;
                }

                result.continue();

              } else {
                if (typeof endCallback === 'function') {
                  outcome = endCallback(outcome);
                }

                resolve(outcome);
              }
            });

            return cust;
          };
        }

        model.getAggregate = function () {
          var count = 0;
          var outcome = {};

          var ag = _get(function (event, resolve, reject) {
            var result = event.target.result;

            if (result) {
              //passing result through filter
              if (!_checkResult(result)) {
                result.continue();
                return false;
              }

              count = count + 1;

              try {
                outcome = aggregateObject.getSums(outcome, result.value);
                outcome = aggregateObject.getAverages(outcome, result.value, false);
                outcome = aggregateObject.getMins(outcome, result.value);
                outcome = aggregateObject.getMaxs(outcome, result.value);
                outcome = aggregateObject.getCustoms(outcome, result.value, false);

              } catch (exception) {
                reject(exception);
              }


              result.continue();
            } else {
              outcome = aggregateObject.getAverages(outcome, count, true);
              outcome = aggregateObject.getCustoms(outcome, count, true);
              resolve(outcome);
            }
          });

          return ag;
        };

        model.aggregate = new CreateAggregate();

      }


      //function sets the index configure values(unique/multientry)
      function _getFieldConfig(field) {
        var config = {};
        if (field.hasOwnProperty('unique')) {
          if (field.unique) {
            config.unique = true;
          }
        }

        if (field.hasOwnProperty('multiEntry')) {
          if (field.multiEntry) {
            config.multiEntry = true;
          }
        }
        return config;
      }

      //function sets keyPathValue if not provided
      function _getIndexValue(field) {
        if (field.keyPathValue === undefined) {
          return field.name;
        }

        return field.keyPathValue;
      }

      function _createModelInstance(db, table) {
        var objectStore;
        if (db.objectStoreNames.contains(table.name)) {
          objectStore = db.transaction([table.name]).objectStore(table.name);

          //checking if table given exists in indexeddb
          if (objectStore.keyPath !== table.fields.keyPathField) {
            table.fields.keyPathField = objectStore.keyPath;
          }

          self.models[table.name] = {};
          //setting getter instance of object as new CreateModel instance
          Object.defineProperty(self.models, table.name, {
            get: function () {
              return new CreateModel(table);
            }
          });
        }
      }

      /**
       * Private : function creates tables when upgrade function is fired
       * @param  {event.target.result} db [it of result of event of upgradedneeded]
       */
      function _createTables(target) {
        var config, db, transaction;
        db = target.result;
        transaction = target.transaction;

        self.tables.forEach(function (table) {
          var objectStore;

          //if table does not exist then creating it
          if (!db.objectStoreNames.contains(table.name)) {

            //setting auto increment to keyPath
            objectStore = db.createObjectStore(table.name, {
              keyPath: table.fields.keyPathField,
              autoIncrement: true
            });

            //creating other fields/indexes
            table.fields.other.forEach(function (field) {
              var indexValue = _getIndexValue(field);
              config = _getFieldConfig(field); //fetching configuration against the index
              objectStore.createIndex(field.name, indexValue, config);
            });

          } else {
            objectStore = transaction.objectStore(table.name);

            //creating new fields/indexes
            table.fields.other.forEach(function (field) {
              var indexValue = _getIndexValue(field);
              config = _getFieldConfig(field); //fetching configuration against the index
              if (!objectStore.indexNames.contains(field.name)) {
                objectStore.createIndex(field.name, indexValue, config);
              }
            });
          }

          self.models[table.name] = {};
          //setting getter instance of object as new CreateModel instance
          Object.defineProperty(self.models, table.name, {
            get: function () {
              return new CreateModel(table);
            }
          });
        });
      }

      //private : function sets the fields(indexes) and keyPath field value of table
      function _setFields(fields, tableName) {
        var j, field, keyPath, newFields, fieldNames;
        keyPath = false;
        newFields = {};
        newFields.other = [];
        fieldNames = [];

        //setting other fields and keyPath Field
        for (j = fields.length - 1; j >= 0; j--) {
          field = fields[j];

          //validating field properties
          if (typeof field.name !== 'string') {
            throw "Field/Index name must be of string type";
          }

          if (fieldNames.indexOf(field.name) !== -1) {
            throw "Field/Index name already exists";
          }

          //pushing to feildNames to check further fields of tables
          fieldNames.push(field.name);

          //checking field for keyPath property
          if (field.hasOwnProperty('keyPath')) {
            if (field.keyPath === true) {

              //checking if keyPath has already being set
              if (keyPath === true) {
                throw "Error multiple keyPath defined in table " + tableName;
              }
              //setting keyPath as this field
              newFields.keyPathField = field.name;
              keyPath = true; //setting keyPath flag as keyPath has been defined

            } else {
              //adding field to other array stating them as indexes
              newFields.other.push(field);
            }
          } else {
            //adding field to other array stating them as indexes
            newFields.other.push(field);
          }
        }

        //if no keyPath field was set then setting default as '_id'
        if (!keyPath) {
          newFields.keyPathField = '_id';
        }

        return newFields;
      }

      //private : function prepares tables for creating them db and to create models against them
      function _setTables() {
        var i, table, fields, tableNames;
        tableNames = [];
        //for each table
        for (i = self.tables.length - 1; i >= 0; i--) {

          table = self.tables[i];

          //validating table name type
          if (typeof table.name !== 'string') {
            throw "Table/ObjectStore name must be of string type";
          }

          if (tableNames.indexOf(table.name) !== -1) {
            throw "Repeated Table/ObjectStore name " + table.name;
          }

          //pushing to array to check further table names
          tableNames.push(table.name);

          table.hasTimeStamp = false; //default timestamps value as false

          //fetching fields data
          fields = _setFields(table.fields, table.name);
          table.fields = fields;

          //checking if timestamps property is set
          if (table.timeStamps === true) {
            table.hasTimeStamp = true; //setting timestamps to be true

            //checking if indexing on timestamps needs to be done
            if (table.indexOnTimeStamps === true) {

              //creating indexing on timestamps with multientry as configuration
              table.fields.other.push({
                name: 'updatedAt',
                keyPathValue: 'updatedAt',
                multiEntry: true
              });
              table.fields.other.push({
                name: 'createdAt',
                keyPathValue: 'createdAt',
                multiEntry: true
              });
            }
          }
        }
      }

      _setTables();

      self.open.then(function (event) {
        try {
          var l, table;
          //when database is being upgraded
          if (event.type === "upgradeneeded") {
            _createTables(event.target);
          } else {
            for (l = self.tables.length - 1; l >= 0; l--) {
              table = self.tables[l];
              _createModelInstance(event.target.result, table);

            }
          }

        } catch (exception) {
          qRej(exception);
        }
        qRes(self);

      }).catch(function (event) {
        qRej(event);
      });

    }

    return $q(function (res, rej) {
      var a = new CreateTables(dbName, dbVersion, dbTables, res, rej);
      return a;
    });
  }

  initialize.$inject = ['$q'];

  function setDbName(name) {
    dbName = name;
  }

  function setDbTables(tables) {
    dbTables = tables;
  }

  function setDbVersion(version) {
    dbVersion = version;
  }


  return {
    setDbName: setDbName,
    setDbVersion: setDbVersion,
    setDbTables: setDbTables,
    $get: initialize
  };


}

indexeddbProvider.$inject = ['$windowProvider'];
angular.module('indexed-db', []);
angular.module('indexed-db').provider('indexeddb', indexeddbProvider);
