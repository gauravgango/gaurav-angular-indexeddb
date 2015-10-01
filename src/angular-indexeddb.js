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
             * @return {boolen}                    [true if exists in list]
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
                //setting wherein, wherenot in as values of is desc for sorting
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

                //if desc then returning b-a for descesding values
                if (helperObject.isDesc) {
                    return (b - a);
                }

                //returinng ascending values
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

                        //checking if current value doesnt exist in inValues while caseInsensitive
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
             * @param {array} table [table to act against]
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
                    model.isDesc = false; //default descending travers set to false
                    model.traverse = 'next'; //default travering set to ascending
                    model.isWhereNumber = false; //default where claues not containing number
                    model.originalWithRelation = null; //default original with relation data
                    model.likeString = null; //default likeString data
                }

                function _setWithRelation(relations) {
                    var withTables = Object.keys(relations);

                    withTables.forEach(function (tableName) {
                        //creating model for each instance
                        var withTable = self.tables.find(function (exisitingTable) {
                            return (exisitingTable.name === tableName);
                        });

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

                    value = (value === undefined || value === true) ? true : false;
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

                    sortAsNumbers = (sortAsNumbers === true) ? true : false;
                    model.whereInValues = inValues;

                    model.isWhereNumber = sortAsNumbers; //setting whereIn as number type

                    if (model.caseInsensitive) {
                        model.whereInValues = self.helper.setOrderSettings(model.whereInValues, sortAsNumbers, model.isDesc);
                    }

                    return model;
                };

                //function sets where not in values for model
                model.whereNotIn = function (notInValues, sortAsNumbers) {

                    sortAsNumbers = (sortAsNumbers === true) ? true : false;
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

            function CreateModel(table) {
                CreateModelBuilder.apply(this, [table]);

                var model = this;
                var transaction;
                var objectStore;
                var withRealtionObject = {};

                withRealtionObject.getRelationData = function (outcome, isFind, propertyName) {
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

                withRealtionObject.setOutcome = function (outcome, withTableName, propertyName, relationsData, isFind) {
                    var tableSchema = self.tables.find(function (tableObject) {
                        return (tableObject.name === withTableName);
                    });

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
                withRealtionObject.getWithAllData = function (resolve, reject, outcome, objectStoreTables, isFind) {
                    //setting default value for isFind
                    isFind = (isFind === undefined) ? false : isFind;

                    var _id, withTablesCount, relationNames;

                    relationNames = Object.keys(objectStoreTables); //getting relational table names
                    withTablesCount = relationNames.length;

                    var currentCount = 0;

                    //for each relational table
                    relationNames.forEach(function (withTableName) {

                        //retrieving realtion values from main table
                        _id = withRealtionObject.getRelationData(outcome, isFind, model.originalWithRelation[withTableName].field);

                        //if main table has no relation values then setting Relation status that relational table as empty array
                        if (_id === false) {
                            outcome = withRealtionObject.setOutcome(outcome, withTableName, model.originalWithRelation[withTableName].field, [], isFind);
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
                                    outcome = withRealtionObject.setOutcome(outcome, withTableName, model.originalWithRelation[withTableName].field, currentOutcome, isFind);

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
                        self.open.then(function (event) {
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
                withRealtionObject.update = function (record, data) {
                    //retrievinging properties to be updated
                    var properties = Object.keys(data);

                    properties.forEach(function (property) {
                        //if property in main record is undefined
                        if (record[property] === undefined) {
                            record[property] = [];
                        }
                        data[property].forEach(function (relation) {
                            //checking if relation already exists if not then adding

                            //if relation is greter than or equla to zero then adding the relation
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
                function _addWithData(resolve, reject, outcome, objectStoreTables, transaction) {
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
                }

                /**
                 * private : function delete the record relation to other tables
                 * @param  {resolve}  resolve           [resolves the promise]
                 * @param  {reject}  reject            [reject the promise]
                 * @param  {array/integer}  value             [contains the id(s) of records delete]
                 * @param  {object}  objectStoreTables [with tables in transaction mode]
                 * @param  {Boolean} isDestroy         [for destroy mode]
                 */
                function _deleteWith(resolve, reject, value, objectStoreTables, isDestroy) {
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
                                        resolve();
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
                }

                //finds a single record according to value set (not case sensitive)
                model.find = function () {

                    var getId = $q(function (resolve, reject) {
                        self.open.then(function (event) {
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
                                            withRealtionObject.getWithAllData(resolve, reject, record.target.result, relations, true);
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
                        self.open.then(function (event) {
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
                                            _addWithData(resolve, reject, result, relations, transaction);
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

                        self.open.then(function (event) {
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
                            //if model has filter
                            if (model.hasFilter) {
                                if (model.filterFunction(result.value) !== true) {
                                    result.continue();
                                    return false;
                                }
                            }

                            //checking for likeness in data
                            if (model.likeString !== null) {
                                if (self.helper.checkLikeString(result.key, model.likeString, model.caseInsensitive) === false) {
                                    result.continue();
                                    return false;
                                }
                            }

                            //first checking if model has whereInValues then where not else default getAll
                            if (model.whereInValues !== null) {
                                if (!self.helper.whereIn(result.key, model.whereInValues, model.caseInsensitive)) {
                                    result.continue();
                                    return false;
                                }
                            }

                            if (model.whereNotInValues !== null) {
                                if (!self.helper.whereNotIn(result.key, model.whereNotInValues, model.caseInsensitive)) {
                                    result.continue();
                                    return false;
                                }
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
                                withRealtionObject.getWithAllData(resolve, reject, outcome, withTables);
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
                        self.open.then(function (event) {
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

                    var update = _get(function (event, resolve) {
                        var count = 0;
                        var result = event.target.result;
                        var newValue;

                        if (result) {

                            newValue = _updateValue(result.value, data);

                            //if model has filter
                            if (model.hasFilter) {
                                if (model.filterFunction(result.value) !== true) {
                                    result.continue();
                                    return false;
                                }
                            }

                            //checking for likeness in data
                            if (model.likeString !== null) {
                                if (self.helper.checkLikeString(result.key, model.likeString, model.caseInsensitive) === false) {
                                    result.continue();
                                    return false;
                                }
                            }

                            //first for whereIn model values then whereNotIn else default
                            if (model.whereInValues !== null) {
                                if (!self.helper.whereIn(result.key, model.whereInValues, model.caseInsensitive)) {
                                    result.continue();
                                    return false;
                                }

                            }

                            if (model.whereNotInValues !== null) {
                                if (!self.helper.whereNotIn(result.key, model.whereNotInValues, model.caseInsensitive)) {
                                    result.continue();
                                    return false;
                                }

                            }

                            //setting with relation data to the record as well
                            if (model.hasWith) {
                                newValue = withRealtionObject.updateWithRelation(newValue, model.originalWithRelation);
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

                    var deleteId = $q(function (resolve, reject) {
                        self.open.then(function (event) {
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

                                objectStore = objectStore.delete(value); //firing default delete

                                objectStore.onsuccess = function () {
                                    try {
                                        if (model.hasWith) {
                                            _deleteWith(resolve, reject, value, relations);
                                        } else {
                                            resolve();
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
                            //if model has filter
                            if (model.hasFilter) {
                                if (model.filterFunction(result.value) !== true) {
                                    result.continue();
                                    return;
                                }
                            }

                            //checking for likeness in data
                            if (model.likeString !== null) {
                                if (self.helper.checkLikeString(result.key, model.likeString, model.caseInsensitive) === false) {
                                    result.continue();
                                    return false;
                                }
                            }

                            //first whereIn then whereNotIn else default destroy
                            if (model.whereInValues !== null) {
                                if (!self.helper.whereIn(result.key, model.whereInValues, model.caseInsensitive)) {
                                    result.continue();
                                    return false;
                                }
                            }

                            if (model.whereNotInValues !== null) {
                                if (!self.helper.wherNotIn(result.key, model.whereNotInValues, model.caseInsensitive)) {
                                    result.continue();
                                    return false;
                                }
                            }

                            deletedIds.push(result.value[table.fields.keyPathField]);
                            result.delete();

                            count = count + 1;
                            result.continue();

                        } else {

                            if (model.hasWith) {
                                _deleteWith(resolve, reject, deletedIds, relations, true);
                            } else {
                                resolve(count);
                            }
                        }
                    }, true);

                    return del;
                };

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
            function _createTables(db) {
                var objectStore, config;
                self.tables.forEach(function (table) {

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

                    //pusghing to feildNames to check further fields of tables
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

                    //pusing to array to check further table names
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
                var l, table;
                //when database is being upgraded
                if (event.type === "upgradeneeded") {
                    _createTables(event.target.result);

                } else {
                    for (l = self.tables.length - 1; l >= 0; l--) {
                        table = self.tables[l];
                        _createModelInstance(event.target.result, table);

                    }
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
