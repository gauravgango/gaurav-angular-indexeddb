/*jslint browser: true*/
/*global $q */
function indexeddbProvider($windowProvider) {
    'use strict';
    var $window = $windowProvider.$get();

    $window.indexedDB.deleteDatabase('test');
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
         * Class : class for mainting and creating tables
         * @param {string} name    [database name]
         * @param {integer} version [version of database]
         * @param {array} tables  [contains tables to be created]
         */
        function CreateTables(name, version, tables) {
            CreateDB.apply(this, [name, version]);
            var self = this;
            self.tables = tables || [];
            self.models = {};

            function CreateModel(table) {
                var model = this;
                var connection;
                var transaction;
                var objectStore;

                model.bound = null; //default bound value
                model.index = null; //default index value
                model.caseInsensitive = false; //default caseInsensitive value
                model.hasFilter = false;
                model.filterFunction = null;

                //wrapper for calling default getAll with callback for success
                function _get(callback, readwrite) {
                    var write = (readwrite === undefined || readwrite === false || readwrite === null) ? 'readonly' : 'readwrite';

                    return $q(function (resolve, reject) {
                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {

                            var db = event.target.result;
                            transaction = db.transaction([table.name], write);
                            objectStore = transaction.objectStore(table.name);

                            if (model.index !== null) {
                                objectStore = objectStore.index(model.index);
                            }
                            objectStore = objectStore.openCursor(model.bound);

                            objectStore.onsuccess = function (event) {
                                callback(event, resolve);
                            };

                            objectStore.onerror = function (event) {
                                reject(event.srcElement.error);
                            };

                            transaction.onerror = function (err) {
                                reject(err.srcElement.error);
                            };
                        };

                        connection.onerror = function (err) {
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
                    value = (value === undefined || value === true) ? true : false;
                    model.caseInsensitive = value;
                    return model;
                };

                //finds a single record according to value set (not case sensitive)
                model.find = function () {

                    var getId = $q(function (resolve, reject) {
                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {
                            var db = event.target.result;
                            transaction = db.transaction([table.name]);
                            objectStore = transaction.objectStore(table.name);

                            if (model.index !== null) {
                                objectStore = objectStore.index(model.index);
                            }
                            objectStore.get(model.bound).onsuccess = function (record) {
                                console.log(record);
                                resolve(record.target.result);
                            };


                            transaction.onerror = function (err) {
                                reject(err.srcElement.error);
                            };
                        };

                        connection.onerror = function (err) {
                            reject(err.srcElement.error);
                        };
                    });

                    return getId;
                };

                //function adds single record
                model.add = function (data) {

                    var add = $q(function (resolve, reject) {

                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {
                            var db = event.target.result;
                            transaction = db.transaction([table.name], "readwrite");
                            objectStore = transaction.objectStore(table.name);
                            if (table.hasTimeStamp) {
                                data.updatedAt = Date.parse(Date());
                                data.createdAt = Date.parse(Date());
                            }
                            objectStore = objectStore.add(data);

                            objectStore.onsuccess = function (event) {
                                var result;
                                result = data;
                                result[table.fields.keyPathField] = event.target.result;
                                resolve(result);
                            };

                            transaction.onerror = function (event) {
                                reject(event.srcElement.error);
                            };

                        };

                        connection.onerror = function (event) {
                            reject(event.srcElement.error);
                        };
                    });

                    return add;
                };

                //add multiple data at once in single transaction
                model.addMultiple = function (data) {
                    var outcome = [];
                    var count = data.length;
                    var inserted = 0;

                    var add = $q(function (resolve, reject) {

                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {
                            var db = event.target.result;
                            transaction = db.transaction([table.name], "readwrite");
                            objectStore = transaction.objectStore(table.name);
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
                                    result[table.fields.keyPathField] = event.target.result;
                                    outcome.push(result);
                                    inserted = inserted + 1;
                                    if (inserted === count) {
                                        resolve(outcome);
                                    }
                                };
                            });

                            transaction.onerror = function (event) {
                                reject(event.srcElement.error);
                            };

                        };

                        connection.onerror = function (event) {
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

                //where in function
                model.whereIn = function (inValues) {
                    var count = 0;
                    inValues = inValues.sort();

                    model.getAll = function () {
                        var outcome = [];
                        var getId = _get(function (event, resolve) {
                            var result = event.target.result;

                            if (result) {
                                //if model has filter
                                if (model.hasFilter) {
                                    if (model.filterFunction(result.value) !== true) {
                                        result.continue();
                                        return;
                                    }
                                }

                                //if case sensitive then checking throughout th database
                                if (model.caseInsensitive) {
                                    var resultKey;
                                    resultKey = _changeCase(result.key);
                                    inValues.forEach(function (value) {
                                        var lowerValue = _changeCase(angular.copy(value));
                                        if (lowerValue === resultKey) {
                                            outcome.push(result.value);
                                        }
                                    });

                                    result.continue();
                                } else {
                                    //case for string sensitive
                                    //if key greater than current value
                                    if (result.key > inValues[count]) {
                                        result.continue();
                                    } else {

                                        //if key not equal to current value then jumping to next
                                        if (result.key !== inValues[count]) {
                                            result.continue(inValues[count]);

                                        } else {
                                            //pushing to outcome array
                                            outcome.push(result.value);
                                            count = count + 1;
                                            result.continue(inValues[count]);
                                        }
                                    }

                                }

                            } else {
                                resolve(outcome);
                            }
                        });

                        return getId;
                    };

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

                    var getId = _get(function (event, resolve) {
                        var result = event.target.result;
                        if (result) {
                            //if model has filter
                            if (model.hasFilter) {
                                if (model.filterFunction(result.value) !== true) {
                                    result.continue();
                                    return;
                                }
                            }

                            outcome.push(result.value);
                            result.continue();
                        } else {
                            resolve(outcome);
                        }
                    });
                    return getId;
                };

                //function fires where not in equivalent
                model.whereNotIn = function (notInValues) {

                    model.getAll = function () {
                        var outcome = [];
                        var notInCaseInsensitiveArray = [];

                        var getId = _get(function (event, resolve) {
                            var result = event.target.result;
                            if (result) {

                                //if model has filter
                                if (model.hasFilter) {
                                    if (model.filterFunction(result.value) !== true) {
                                        result.continue();
                                        return;
                                    }
                                }

                                //case sensitive 
                                if (model.caseInsensitive) {
                                    var resultKey = _changeCase(result.key);
                                    notInValues.forEach(function (value) {
                                        var lowerValue = _changeCase(angular.copy(value));
                                        if (lowerValue === resultKey && notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                                            notInCaseInsensitiveArray.push(resultKey);
                                        }
                                    });

                                    if (notInCaseInsensitiveArray.indexOf(resultKey) === -1) {
                                        outcome.push(result.value);
                                    }

                                } else {
                                    if (notInValues.indexOf(result.key) === -1) {
                                        outcome.push(result.value);
                                    }
                                }

                                result.continue();
                            } else {
                                resolve(outcome);
                            }
                        });

                        return getId;
                    };
                    return model;
                };

                model.put = function (data) {
                    var put = $q(function (resolve, reject) {

                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {
                            var db = event.target.result;
                            transaction = db.transaction([table.name], "readwrite");
                            objectStore = transaction.objectStore(table.name);
                            if (table.hasTimeStamp) {
                                data.updatedAt = Date.parse(Date());
                            }
                            objectStore = objectStore.put(data);

                            objectStore.onsuccess = function (event) {
                                data[table.keyPathField] = event.target.result;
                                resolve(data);
                            };

                            transaction.onerror = function (event) {
                                reject(event.srcElement.error);
                            };

                        };

                        connection.onerror = function (event) {
                            reject(event.srcElement.error);
                        };
                    });

                    return put;
                };

                model.update = function (data) {
                    if (typeof data !== 'object') {
                        throw "Data must be type of object";
                    }

                    var update = _get(function (event, resolve) {
                        var property;
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
                            newValue = angular.copy(result.value);

                            for (property in data) {
                                newValue[property] = data[property];
                            }

                            if (table.hasTimeStamp) {
                                newValue.updatedAt = Date.parse(Date());
                            }

                            result.update(newValue);
                            result.continue();

                        } else {
                            resolve();
                        }
                    }, true);

                    return update;
                };

                model.filter = function (filterFunction) {
                    model.hasFilter = true;
                    model.filterFunction = filterFunction;
                    return model;
                };

                model.delete = function () {

                    var deleteId = $q(function (resolve, reject) {
                        connection = self.indexdb.open(self.name);
                        connection.onsuccess = function (event) {
                            var db = event.target.result;
                            transaction = db.transaction([table.name]);
                            objectStore = transaction.objectStore(table.name);
                            if (model.index !== null) {
                                objectStore.index(model.index);
                            }

                            if (model.bound === null) {
                                throw "Invalid query supplied. Cannot delete complete database";
                            }


                            objectStore.delete(model.bound).onsuccess = function () {
                                resolve();
                            };

                            transaction.oncomplete = function () {
                                resolve();
                            };

                            transaction.onerror = function (err) {
                                reject(err.srcElement.error);
                            };
                        };

                        connection.onerror = function (err) {
                            reject(err.srcElement.error);
                        };
                    });

                    return deleteId;
                };

                model.destroy = function () {
                    var del = _get(function (event, resolve) {
                        var result = event.target.result;

                        if (result) {
                            //if model has filter
                            if (model.hasFilter) {
                                if (model.filterFunction(result.value) !== true) {
                                    result.continue();
                                    return;
                                }
                            }

                            result.delete();
                            result.continue();
                        } else {
                            resolve();
                        }
                    }, true);

                    return del;
                };
            }

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


            /**
             * Private : function creates tables when updgrade function is fired
             * @param  {event.target.result} db [it of result of event of upgradedneeded]
             */
            function _createTables(db) {
                var objectStore, config;
                self.tables.forEach(function (table) {

                    //if table does not exist then creating it
                    if (!db.objectStoreNames.contains(table.name)) {

                        //setting autoincrement to keyPath
                        objectStore = db.createObjectStore(table.name, {
                            keyPath: table.fields.keyPathField,
                            autoIncrement: true
                        });

                        //creating other fields/indexes
                        table.fields.other.forEach(function (field) {
                            config = _getFieldConfig(field);
                            objectStore.createIndex(field.name, field.keyPathValue, config);
                        });
                    }

                    self.models[table.name] = new CreateModel(table);
                });
            }

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

            function _setTables() {
                var i, table, fields;
                for (i = self.tables.length - 1; i >= 0; i--) {
                    table = self.tables[i];
                    table.hasTimeStamp = false;
                    fields = _setFields(table.fields, table.name);
                    table.fields = fields;
                    if (table.hasOwnProperty('timeStamps')) {
                        if (table.timeStamps) {
                            table.hasTimeStamp = true;
                            if (table.indexOnTimeStamps === true) {
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
            }

            _setTables();

            self.open.then(function (event) {
                //when database is being upgraded
                if (event.type === "upgradeneeded") {
                    _createTables(event.target.result);

                } else {

                    this.tables.forEach(function (table) {
                        self.models[table.name] = new CreateModel(table);
                    });
                }

            }).catch(function (event) {
                console.log(event);
            });

        }

        return new CreateTables(dbName, dbVersion, dbTables);
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
