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
                    reject(event.srcElement.error);
                };

                connection.onsuccess = function (event) {
                    resolve(event);
                };
            });

        }

        /**
         * Class : class for maintaining and creating tables
         * @param {string} name    [database name]
         * @param {integer} version [version of database]
         * @param {array} tables  [contains tables to be created]
         */
        function CreateTables(name, version, tables, qRes, qRej) {
            CreateDB.apply(this, [name, version]);
            var self = this;
            self.tables = tables || [];
            self.models = {};

            function CreateModel(table) {
                var model = this;
                var connection;
                var transaction;
                var objectStore;

                function _resetModel() {
                    model.bound = null; //default bound value
                    model.index = null; //default index value
                    model.caseInsensitive = false; //default caseInsensitive value
                    model.hasFilter = false; //default if model has filter
                    model.filterFunction = null; //default filter function
                    model.whereInValues = null; //default whereInValues for whereIn
                    model.whereNotInValues = null; //default whereNotInValues for whereNotIn
                    model.withTables = {}; //with tables structure
                    model.hasWith = false; //default has with relation status
                    model.isDesc = false;
                    model.traverse = 'next';
                    model.isWhereNumber = false;
                }

                _resetModel();

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
                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {

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
                                callback(event, resolve, reject, relations);
                            };

                            objectStore.onerror = function (event) {
                                _resetModel();
                                reject(event.srcElement.error);
                            };

                            transaction.onerror = function (err) {
                                _resetModel();
                                reject(err.srcElement.error);
                            };
                        };

                        connection.onerror = function (err) {
                            _resetModel();
                            reject(err.srcElement.error);
                        };
                    });
                }

                //private : function changes case of value if string type to lower or upper
                function _changeCase(value, toUpper) {
                    toUpper = (toUpper === undefined) ? false : toUpper;
                    if (model.caseInsensitive) {
                        if (typeof value === 'string') {
                            value = (toUpper === true) ? value.toUpperCase() : value.toLowerCase();
                        }
                    }

                    return value;
                }

                //private : function for where not in logic
                function _whereNotIn(result, outcome, notInCaseInsensitiveArray) {
                    //case sensitive
                    if (model.caseInsensitive) {
                        var resultKey = _changeCase(result.key);
                        model.whereNotInValues.forEach(function (value) {
                            var lowerValue = _changeCase(angular.copy(value));
                            if (lowerValue === resultKey && notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                                notInCaseInsensitiveArray.push(resultKey);
                            }
                        });

                        if (notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                            outcome.push(result.value);
                        }

                    } else {
                        if (model.whereNotInValues.indexOf(result.key) === -1) {
                            outcome.push(result.value);
                        }
                    }

                    result.continue(null, model.traverse);
                }

                /**
                 * The where in logic for the object store
                 * @param  {IDBCursor} result             [contains current cursor value]
                 * @param  {array} outcome            [contains final result where if condition passed data will be pushed]
                 * @param  {integer} count              [current count of where in values iteration]
                 * @param  {array} whereInValues      [whereIn values to search for]
                 * @param  {boolean} useCaseInsensitive [override case sensitive search]
                 * @return {integer}                    [returns new count value of next cursor]
                 */
                function _whereIn(result, outcome, count, whereInValues, useCaseInsensitive) {

                    useCaseInsensitive = (useCaseInsensitive === undefined) ? true : useCaseInsensitive;

                    //if case sensitive then checking throughout th database
                    if (model.caseInsensitive && useCaseInsensitive) {
                        var resultKey;
                        resultKey = _changeCase(result.key);

                        whereInValues.forEach(function (value) {
                            var lowerValue = _changeCase(angular.copy(value));
                            if (lowerValue === resultKey) {
                                outcome.push(result.value);
                            }
                        });

                        result.continue();
                        return 0;
                    }

                    //case for case sensitive
                    //case when where is is desc
                    if (model.isDesc) {
                        //if key less than current value
                        if (result.key < whereInValues[count]) {
                            count = count + 1;
                            result.continue();
                            return count;
                        }
                    } else {
                        //case for ascending
                        //if key greater than current value
                        if (result.key > whereInValues[count]) {
                            count = count + 1;
                            result.continue();
                            return count;
                        }
                    }

                    //if key not equal to current value then jumping to next
                    if (result.key !== whereInValues[count]) {
                        result.continue(whereInValues[count], model.traverse);
                        return count;
                    }


                    //pushing to outcome array
                    outcome.push(result.value);
                    count = count + 1;
                    result.continue(whereInValues[count], model.traverse);
                    return count;
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

                //private : where in logic for update condition. When condition passes the system updates the object in current location
                function _whereInUpdate(result, count, data) {
                    var toUpdate = false;
                    var newValue = _updateValue(result.value, data);

                    //if case sensitive then checking throughout th database
                    if (model.caseInsensitive) {
                        var resultKey;
                        resultKey = _changeCase(result.key);
                        model.whereInValues.forEach(function (value) {
                            var lowerValue = _changeCase(angular.copy(value));
                            if (lowerValue === resultKey) {
                                toUpdate = true;
                            }
                        });


                        if (toUpdate) {
                            result.update(newValue);
                        }

                        result.continue();
                        return 0;
                    }
                    //case for case sensitive
                    //case when where is is desc
                    if (model.isDesc) {
                        //if key less than current value
                        if (result.key < model.whereInValues[count]) {
                            count = count + 1;
                            result.continue();
                            return count;
                        }
                    } else {
                        //case for ascending
                        //if key greater than current value
                        if (result.key > model.whereInValues[count]) {
                            count = count + 1;
                            result.continue();
                            return count;
                        }
                    }

                    //if key not equal to current value then jumping to next
                    if (result.key !== model.whereInValues[count]) {
                        result.continue(model.whereInValues[count]);
                        return count;

                    }
                    //pushing to outcome array
                    result.update(newValue);
                    count = count + 1;
                    result.continue(model.whereInValues[count]);
                    return count;
                }

                //private : function for where not in logic for update scenario
                function _whereNotInUpdate(result, notInCaseInsensitiveArray, data) {

                    var newValue = _updateValue(result.value, data); //data to be updated

                    //case sensitive
                    if (model.caseInsensitive) {
                        var resultKey = _changeCase(result.key);
                        model.whereNotInValues.forEach(function (value) {
                            var lowerValue = _changeCase(angular.copy(value));
                            if (lowerValue === resultKey && notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                                notInCaseInsensitiveArray.push(resultKey);
                            }
                        });

                        if (notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                            result.update(newValue);
                        }

                    } else {
                        if (model.whereNotInValues.indexOf(result.key) === -1) {
                            result.update(newValue);
                        }
                    }

                    result.continue();
                }


                //private : where in logic for deleting object
                function _whereInDestroy(result, count, deletedIds) {
                    var toDelete = false;

                    //if case sensitive then checking throughout th database
                    if (model.caseInsensitive) {
                        var resultKey;
                        resultKey = _changeCase(result.key);
                        model.whereInValues.forEach(function (value) {
                            var lowerValue = _changeCase(angular.copy(value));
                            if (lowerValue === resultKey) {
                                toDelete = true;
                            }
                        });

                        //if to delete is set then deleting
                        if (toDelete) {
                            deletedIds.push(result.value[table.fields.keyPathField]);
                            result.delete();
                        }
                        result.continue();
                        return 0;
                    }

                    //case for case sensitive
                    //case when where is is desc
                    if (model.isDesc) {
                        //if key less than current value
                        if (result.key < model.whereInValues[count]) {
                            count = count + 1;
                            result.continue();
                            return count;
                        }
                    } else {
                        //case for ascending
                        //if key greater than current value
                        if (result.key > model.whereInValues[count]) {
                            count = count + 1;
                            result.continue();
                            return count;
                        }
                    }

                    //if key not equal to current value then jumping to next
                    if (result.key !== model.whereInValues[count]) {
                        result.continue(model.whereInValues[count]);
                        return count;
                    }

                    deletedIds.push(result.value[table.fields.keyPathField]);

                    //pushing to outcome array
                    result.delete();
                    count = count + 1;
                    result.continue(model.whereInValues[count]);
                    return count;
                }

                //private : where not in logic for deleting
                function _wherNotInDestroy(result, notInCaseInsensitiveArray, deletedIds) {
                    //case sensitive
                    if (model.caseInsensitive) {
                        var resultKey = _changeCase(result.key);
                        model.whereNotInValues.forEach(function (value) {
                            var lowerValue = _changeCase(angular.copy(value));
                            if (lowerValue === resultKey && notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                                notInCaseInsensitiveArray.push(resultKey);
                            }
                        });

                        if (notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                            deletedIds.push(result.value[table.fields.keyPathField]);
                            result.delete();
                        }

                    } else {
                        if (model.whereNotInValues.indexOf(result.key) === -1) {
                            deletedIds.push(result.value[table.fields.keyPathField]);
                            result.delete();
                        }
                    }

                    result.continue();
                }


                //private : function calls relation tables and fetches their data
                /**
                 * private : function calls relation tables and fetches their data
                 * @param  {[type]}  resolve           [description]
                 * @param  {[type]}  reject            [description]
                 * @param  {array/object}  outcome           [contains main table record(s)]
                 * @param  {object}  objectStoreTables [with tables in transaction mode]
                 * @param  {Boolean} isFind            [true for find condition]
                 */
                function _getWithAllData(resolve, reject, outcome, objectStoreTables, isFind) {

                    //setting default value for isFind
                    isFind = (isFind === undefined) ? false : isFind;

                    //checking if outcome is not empty
                    if (isFind) {
                        if (outcome === undefined) {

                            _resetModel();
                            resolve(outcome);
                            return;
                        }

                    } else {
                        if (outcome.length === 0) {
                            _resetModel();
                            resolve(outcome);
                            return;
                        }
                    }
                    var _id, withTablesCount, relationNames, Relations;

                    Relations = {};

                    relationNames = Object.keys(objectStoreTables); //getting relational table names
                    withTablesCount = relationNames.length;

                    var currentCount = 0;

                    _id = [];

                    //for each relational table
                    relationNames.forEach(function (withTableName) {

                        //retrieving main relationship join data
                        if (isFind) {
                            _id = angular.copy(outcome[model.originalWithRelation[withTableName].field]);

                        } else {
                            outcome.forEach(function (record) {
                                var d = angular.copy(record[model.originalWithRelation[withTableName].field]);
                                if (d !== undefined && d.constructor === Array) {
                                    d.forEach(function (id) {
                                        if (_id.indexOf(id) === -1) {
                                            _id.push(id);
                                        }
                                    });
                                }
                            });
                            Relations[withTableName] = [];
                        }

                        var count = 0;
                        var currentOutcome = [];
                        var hasFilter = false;

                        //if filter was set in relation then setting hasFilter flag
                        if (typeof model.originalWithRelation[withTableName].filter === 'function') {
                            hasFilter = true;
                        }

                        _id = _id.sort();

                        if (_id.length === 0) {

                            if (isFind) {
                                outcome.Relations = Relations;
                            } else {
                                outcome.forEach(function (record) {
                                    record.Relations = Relations;
                                });
                            }
                            resolve(outcome);
                            return;
                        }
                        //opening relational table and fetching data
                        objectStoreTables[withTableName].openCursor(self.keyRange.bound(_id[0], _id[(_id.length - 1)])).onsuccess = function (event) {
                            var cursor = event.target.result;
                            if (cursor) {

                                //if relation has filter
                                if (hasFilter) {

                                    if (model.originalWithRelation[withTableName].filter(cursor.value) !== true) {
                                        count = count + 1;
                                        cursor.continue(_id[count]);
                                        return;
                                    }
                                }

                                count = _whereIn(cursor, currentOutcome, count, _id, false);

                            } else {
                                //when traversing is done

                                if (isFind) {
                                    //setting relation object to main outcome
                                    outcome.Relations = outcome.Relations || {};
                                    outcome.Relations[withTableName] = [];

                                    //adding those with relation records which have relation with current record
                                    currentOutcome.forEach(function (currentRecord) {
                                        //adding the records to the main table
                                        if (outcome[model.originalWithRelation[withTableName].field].indexOf(currentRecord._id) !== -1) {
                                            outcome.Relations[withTableName].push(currentRecord);
                                        }
                                    });


                                } else {
                                    outcome.forEach(function (record) {
                                        //setting relation object to main outcome
                                        record.Relations = record.Relations || {};
                                        record.Relations[withTableName] = [];

                                        //adding those with relation records which have relation with current record
                                        currentOutcome.forEach(function (currentRecord) {
                                            //adding the records to the main table
                                            if (record[model.originalWithRelation[withTableName].field] !== undefined) {
                                                if (record[model.originalWithRelation[withTableName].field].indexOf(currentRecord._id) !== -1) {
                                                    record.Relations[withTableName].push(currentRecord);
                                                }
                                            }
                                        });
                                    });
                                }

                                currentCount = currentCount + 1;

                                //when all of the relation tables have completed traversing then resolving
                                if (currentCount === withTablesCount) {
                                    _resetModel();
                                    resolve(outcome);
                                }
                            }
                        };

                        //case or error of in relation object store
                        objectStoreTables[withTableName].openCursor(self.keyRange.bound(_id[0], _id[(_id.length - 1)])).onerror = function (e) {
                            _resetModel();
                            reject(e);
                        };
                    });

                }

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
                                if (isMany) {
                                    manyOutcome[model.originalWithRelation[withTableName].many.field] = many;
                                }

                                if (currentCount === withTablesCount) {

                                    //if is many relationship then also updating current outcome value
                                    if (isMany) {
                                        outcome = _updateValue(outcome, manyOutcome);

                                        var newObjectStore = transaction.objectStore(table.name);

                                        newObjectStore.put(outcome).onsuccess = function () {
                                            _resetModel();
                                            resolve(outcome);
                                        };

                                        newObjectStore.onerror = function (error) {
                                            _resetModel();
                                            reject(error);
                                        };

                                    } else {
                                        _resetModel();
                                        resolve(outcome);
                                    }
                                }
                            }
                        };

                        objectStoreTables[withTableName].openCursor().onerror = function (error) {
                            _resetModel();
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
                                    _resetModel();
                                    resolve();
                                }
                            }
                        };

                        objectStoreTables[withTableName].onerror = function (error) {
                            _resetModel();
                            reject(error);
                        };
                    });
                }


                /**
                 * Function sets the with relations by creating new model instances
                 * @param {object} relations [contains with relations data]
                 */
                function _setWithRelation(relations) {
                    var withTables = Object.keys(relations);

                    withTables.forEach(function (tableName) {
                        //creating model for each instance
                        model.withTables[tableName] = new CreateModel(tableName);
                    });
                }

                //sorting where in/ where not in as number
                function _sortAsNumbers(a, b) {

                    //if desc then returning b-a for descesding values
                    if (model.isDesc) {
                        return (b - a);
                    }

                    //returinng ascending values
                    return (a - b);
                }

                function _setOrderSettings() {
                    //setting wherein, wherenot in as values of is desc for sorting
                    if (model.isDesc) {
                        //case for descending order
                        //if whereInValues are defined
                        if (model.whereInValues !== null) {
                            if (model.isWhereNumber) {
                                model.whereInValues = model.whereInValues.sort(_sortAsNumbers);
                                return;
                            }

                            model.whereInValues = model.whereInValues.reverse();
                        }
                        //if whereNotInValues are defined
                        if (model.whereNotInValues !== null) {
                            if (model.isWhereNumber) {
                                model.whereNotInValues = model.whereNotInValues.sort(_sortAsNumbers);
                                return;
                            }

                            model.whereNotInValues = model.whereNotInValues.reverse();
                        }
                    } else {
                        //case for ascending order
                        //if whereInValues are defined
                        if (model.whereInValues !== null) {
                            if (model.isWhereNumber) {
                                model.whereInValues = model.whereInValues.sort(_sortAsNumbers);
                                return;
                            }

                            model.whereInValues = model.whereInValues.sort();
                        }
                        //if whereNotInValues are defined
                        if (model.whereNotInValues !== null) {
                            if (model.isWhereNumber) {
                                model.whereNotInValues = model.whereNotInValues.sort(_sortAsNumbers);
                                return;
                            }

                            model.whereNotInValues = model.whereNotInValues.sort();

                        }
                    }
                }

                model.orderDesc = function (isDesc) {
                    if (isDesc === true) {
                        model.isDesc = true;
                        model.traverse = 'prev';
                        _setOrderSettings();

                    } else {
                        model.isDesc = false;
                        model.traverse = 'next';
                        _setOrderSettings();
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
                            lower = _changeCase(angular.copy(model.bound.lower), true);
                            incLower = (model.bound.lowerOpen === undefined) ? false : angular.copy(model.bound.lowerOpen);
                            upper = _changeCase(angular.copy(model.bound.upper));
                            incUpper = (model.bound.upper === undefined) ? false : angular.copy(model.bound.upper);

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

                //finds a single record according to value set (not case sensitive)
                model.find = function () {

                    var getId = $q(function (resolve, reject) {
                        var transactionTables = [];
                        var relations = {};

                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {
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
                            objectStore.get(model.bound).onsuccess = function (record) {

                                if (model.hasWith) {
                                    _getWithAllData(resolve, reject, record.target.result, relations, true);

                                } else {
                                    _resetModel();
                                    resolve(record.target.result);
                                }
                            };


                            transaction.onerror = function (err) {
                                _resetModel();
                                reject(err.srcElement.error);
                            };
                        };

                        connection.onerror = function (err) {
                            _resetModel();
                            reject(err.srcElement.error);
                        };
                    });

                    return getId;
                };

                //function adds single record
                model.add = function (data) {

                    var add = $q(function (resolve, reject) {
                        var transactionTables = [];
                        var relations = {};

                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {

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
                                var result;
                                result = data;

                                //adding key path value to the data object after adding
                                result[table.fields.keyPathField] = event.target.result;

                                if (model.hasWith) {
                                    _addWithData(resolve, reject, result, relations, transaction);
                                } else {
                                    _resetModel();
                                    resolve(result);

                                }
                            };

                            transaction.onerror = function (event) {
                                _resetModel();
                                reject(event.srcElement.error);
                            };

                        };

                        connection.onerror = function (event) {
                            _resetModel();
                            reject(event.srcElement.error);
                        };
                    });

                    return add;
                };

                //add multiple data at once in single transaction
                model.addMultiple = function (data) {
                    var outcome = [];
                    var count = data.length; //total no of records to be inserted
                    var inserted = 0; //no of records inserted

                    var add = $q(function (resolve, reject) {

                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {

                            var db = event.target.result;
                            transaction = db.transaction([table.name], "readwrite");
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
                                    var result;
                                    result = data[inserted];

                                    //adding newly inserted key path value to the object
                                    result[table.fields.keyPathField] = event.target.result;

                                    outcome.push(result);
                                    inserted = inserted + 1;

                                    //if inserted count is equal to total no of records then resolving
                                    if (inserted === count) {
                                        _resetModel();
                                        resolve(outcome);
                                    }
                                };
                            });

                            transaction.onerror = function (event) {
                                _resetModel();
                                reject(event.srcElement.error);
                            };

                        };

                        connection.onerror = function (event) {
                            _resetModel();
                            reject(event.srcElement.error);
                        };
                    });

                    return add;
                };

                //between function(not case sensitive)
                model.between = function (lower, upper, incLower, incUpper) {
                    incLower = (incLower !== undefined) ? false : incLower;
                    incUpper = (incUpper !== undefined) ? false : incUpper;
                    model.bound = self.keyRange.bound(lower, upper, incLower, incUpper);
                    return model;
                };

                //where in model function for setting whereInValues
                model.whereIn = function (inValues, sortAsNumbers) {

                    sortAsNumbers = (sortAsNumbers === true) ? true : false;
                    model.whereInValues = inValues;

                    model.isWhereNumber = sortAsNumbers; //setting whereIn as number type

                    _setOrderSettings(); //sorting whereInValues as order type

                    return model;
                };

                //function sets greater than value for index
                model.gt = function (lower) {
                    lower = _changeCase(lower, true);
                    model.bound = self.keyRange.lowerBound(lower, true);
                    return model;
                };

                //function sets greater than value for index including the value
                model.gte = function (lower) {
                    lower = _changeCase(lower, true);
                    model.bound = self.keyRange.lowerBound(lower);
                    return model;
                };

                //function sets less than value for index including the value
                model.lte = function (upper) {
                    upper = _changeCase(upper);
                    model.bound = self.keyRange.upperBound(upper);
                    return model;
                };

                //function sets less than value for index
                model.lt = function (upper) {
                    upper = _changeCase(upper);
                    model.bound = self.keyRange.upperBound(upper, true);
                    return model;
                };

                //function is default getAll function retrieves all data
                model.getAll = function () {
                    var outcome = [];
                    var count = 0;
                    var notInCaseInsensitiveArray = [];

                    var getId = _get(function (event, resolve, reject, withTables) {
                        var result = event.target.result;

                        if (result) {

                            //if model has filter
                            if (model.hasFilter) {
                                if (model.filterFunction(result.value) !== true) {
                                    result.continue();
                                    return;
                                }
                            }

                            //first checking if model has whereInValues then where not else default getAll
                            if (model.whereInValues !== null) {
                                count = _whereIn(result, outcome, count, model.whereInValues);

                            } else if (model.whereNotInValues !== null) {
                                _whereNotIn(result, outcome, notInCaseInsensitiveArray);

                            } else {
                                outcome.push(result.value);
                                result.continue();
                            }

                        } else {

                            //if model has relations then resolving when relation transactions are complete else resolving
                            if (model.hasWith) {
                                _getWithAllData(resolve, reject, outcome, withTables);

                            } else {
                                _resetModel();
                                resolve(outcome);
                            }
                        }
                    });
                    return getId;
                };

                //function sets where not in values for model
                model.whereNotIn = function (notInValues, sortAsNumbers) {

                    sortAsNumbers = (sortAsNumbers === true) ? true : false;
                    model.whereNotInValues = notInValues;

                    model.isWhereNumber = sortAsNumbers; //setting whereNotInValues as number type

                    _setOrderSettings(); //setting whereNotInValues as asc or desc type
                    return model;
                };

                //wrapper function firing default put on the indexed db
                model.put = function (data) {
                    var put = $q(function (resolve, reject) {

                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {

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
                                //adding newly/existing key path value to the object
                                data[table.keyPathField] = event.target.result;
                                _resetModel();
                                resolve(data);
                            };

                            transaction.onerror = function (event) {
                                _resetModel();
                                reject(event.srcElement.error);
                            };

                        };

                        connection.onerror = function (event) {
                            _resetModel();
                            reject(event.srcElement.error);
                        };
                    });

                    return put;
                };

                //function fires update method on the model
                model.update = function (data) {
                    if (typeof data !== 'object') {
                        throw "Data must be type of object";
                    }

                    var count = 0;
                    var notInCaseInsensitiveArray = [];

                    var update = _get(function (event, resolve) {
                        var result = event.target.result;
                        var newValue;

                        if (result) {

                            //if model has filter
                            if (model.hasFilter) {
                                if (model.filterFunction(result.value) !== true) {
                                    result.continue();
                                    return;
                                }
                            }

                            //first for whereIn model values then whereNotIn else default
                            if (model.whereInValues !== null) {
                                count = _whereInUpdate(result, count, data);

                            } else if (model.whereNotInValues !== null) {
                                _whereNotInUpdate(result, notInCaseInsensitiveArray, data);

                            } else {
                                newValue = _updateValue(result, data);
                                result.update(newValue);
                                result.continue();
                            }

                        } else {
                            _resetModel();
                            resolve();
                        }
                    }, true);

                    return update;
                };

                //functions sets the filter for traversing
                model.filter = function (filterFunction) {
                    model.hasFilter = true;
                    model.filterFunction = filterFunction;
                    return model;
                };

                //wrapper for default delete in indexeddb
                model.delete = function (value) {

                    if (value === undefined) {
                        throw "Empty value provided for deleting";
                    }

                    var deleteId = $q(function (resolve, reject) {
                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {

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

                                if (model.hasWith) {
                                    _deleteWith(resolve, reject, value, relations);
                                } else {
                                    _resetModel();
                                    resolve();
                                }
                            };

                            transaction.onerror = function (err) {
                                _resetModel();
                                reject(err.srcElement.error);
                            };
                        };

                        connection.onerror = function (err) {
                            _resetModel();
                            reject(err.srcElement.error);
                        };
                    });

                    return deleteId;
                };

                //function to delete on cursor location
                model.destroy = function () {
                    var count = 0;
                    var notInCaseInsensitiveArray = [];
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

                            //first whereIn then whereNotIn else default destroy
                            if (model.whereInValues !== null) {
                                count = _whereInDestroy(result, count, deletedIds);

                            } else if (model.whereNotInValues !== null) {
                                _wherNotInDestroy(result, notInCaseInsensitiveArray, deletedIds);

                            } else {
                                deletedIds.push(result.value[table.fields.keyPathField]);
                                result.delete();
                                result.continue();
                            }
                        } else {

                            if (model.hasWith) {
                                _deleteWith(resolve, reject, deletedIds, relations, true);
                            } else {
                                _resetModel();
                                resolve();
                            }
                        }
                    }, true);

                    return del;
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

                    self.models[table.name] = new CreateModel(table);
                });
            }

            //private : function sets the fields(indexes) and keyPath field value of table
            function _setFields(fields, tableName) {
                var j, field, keyPath, newFields;
                keyPath = false;
                newFields = {};
                newFields.other = [];

                //setting other fields and keyPath Field
                for (j = fields.length - 1; j >= 0; j--) {
                    field = fields[j];

                    if (field.hasOwnProperty('keyPath')) {
                        if (field.keyPath === true) {
                            if (keyPath === true) {
                                throw "Error multiple keyPath defined in table " + tableName;
                            }

                            newFields.keyPathField = field.name;
                            keyPath = true;
                        } else {
                            newFields.other.push(field);
                        }
                    } else {
                        newFields.other.push(field);
                    }
                }

                //if no keyPath field was set then setting default as 'id'
                if (!keyPath) {
                    newFields.keyPathField = 'id';
                }

                return newFields;
            }

            //private : function prepares tables for creating them db and to create models against them
            function _setTables() {
                var i, table, fields;

                //for each table
                for (i = self.tables.length - 1; i >= 0; i--) {

                    table = self.tables[i];
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
                //when database is being upgraded
                if (event.type === "upgradeneeded") {
                    _createTables(event.target.result);

                } else {
                    self.tables.forEach(function (table) {
                        self.models[table.name] = new CreateModel(table);
                    });
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
