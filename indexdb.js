/*jslint browser: true*/
/*global Promise */
(function (window, Promise) {
    'use strict';

    window.indexedDB.deleteDatabase('test');

    /**
     * Class : Function creates database and provides promise when database connection is resolved
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
            self.indexdb = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
            if (typeof self.indexdb !== "object") {
                throw "IndexedDB not supported";
            }
            self.keyRange = window.IDBKeyRange || window.mozIDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
        }

        _check();

        self.open = new Promise(function (resolve, reject) {

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
            model.bound = null;
            model.index = null;

            function _get(callback) {

                return new Promise(function (resolve, reject) {
                    connection = self.indexdb.open(self.name);
                    connection.onsuccess = function (event) {

                        var db = event.target.result;
                        transaction = db.transaction([table.name]);
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

            model.select = function (index) {
                model.index = index;
                return model;
            };

            model.equal = function (where) {
                model.bound = self.keyRange.only(where);
                return model;
            };

            model.find = function () {
                var outcome;

                var getId = new Promise(function (resolve, reject) {
                    connection = self.indexdb.open(self.name);
                    connection.onsuccess = function (event) {
                        var db = event.target.result;
                        transaction = db.transaction([table.name]);
                        objectStore = transaction.objectStore(table.name);
                        if (model.index !== null) {
                            objectStore.index(model.index);
                        }
                        objectStore.get(model.bound).onsuccess = function (record) {
                            outcome = record.target.result;
                        };

                        transaction.oncomplete = function () {
                            resolve(outcome);
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

            model.add = function (data) {

                var add = new Promise(function (resolve, reject) {

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

            model.addMultiple = function (data) {
                var outcome = [];
                var count = data.length;
                var inserted = 0;

                var add = new Promise(function (resolve, reject) {

                    connection = self.indexdb.open(self.name);
                    connection.onsuccess = function (event) {
                        var db = event.target.result;
                        transaction = db.transaction([table.name], "readwrite");
                        objectStore = transaction.objectStore(table.name);
                        data.forEach(function (toAddData) {

                            if (table.hasTimeStamp) {
                                toAddData.updatedAt = Date.parse(Date());
                                toAddData.createdAt = Date.parse(Date());
                            }

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

            model.between = function (lower, upper, incLower, incUpper) {
                incLower = (incLower !== undefined) ? false : incLower;
                incUpper = (incUpper !== undefined) ? false : incUpper;
                model.bound = self.keyRange.bound(lower, upper, incLower, incUpper);
                return model;
            };

            model.whereIn = function (inValues) {
                var count = 0;
                inValues = inValues.sort();

                model.getAll = function () {
                    var outcome = [];
                    var getId = _get(function (event, resolve) {
                        var result = event.target.result;
                        if (result) {
                            if (result.key > inValues[count]) {
                                result.continue();
                            } else {

                                if (result.key !== inValues[count]) {
                                    result.continue(inValues[count]);
                                } else {
                                    outcome.push(result.value);
                                    count = count + 1;
                                    result.continue(inValues[count]);
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

            model.gt = function (lower) {
                model.bound = self.keyRange.lowerBound(lower, true);
                return model;
            };

            model.gte = function (lower) {
                model.bound = self.keyRange.lowerBound(lower);
                return model;
            };

            model.lte = function (upper) {
                model.bound = self.keyRange.upperBound(upper);
                return model;
            };

            model.lt = function (upper) {
                model.bound = self.keyRange.upperBound(upper, true);
                return model;
            };

            model.getAll = function () {
                var outcome = [];

                var getId = _get(function (event, resolve) {
                    var result = event.target.result;
                    if (result) {
                        outcome.push(result.value);
                        result.continue();
                    } else {
                        resolve(outcome);
                    }
                });
                return getId;
            };

            model.whereNotIn = function (notInValues) {
                model.getAll = function () {
                    var outcome = [];

                    var getId = _get(function (event, resolve) {
                        var result = event.target.result;
                        if (result) {
                            if (notInValues.indexOf(result.key) === -1) {
                                outcome.push(result.value);
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
                var put = new Promise(function (resolve, reject) {

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

    var tables = [{
        name: 'users',
        timeStamps: true,
        indexOnTimeStamps: false,
        fields: [{
            name: '_id',
            keyPathValue: '_id',
            keyPath: true
        }, {
            name: 'email',
            keyPathValue: 'email',
            multiEntry: true
        }, {
            name: 'addresses',
            keyPathValue: 'addresses',
            multiEntry: true
        }, {
            name: 'firstName',
            keyPathValue: 'name.firstName',
            multiEntry: true
        }, {
            name: 'lastName',
            keyPathValue: 'name.lastName',
            multiEntry: true
        }]
    }, {
        name: 'address',
        timeStamps: true,
        indexOnTimeStamps: false,
        fields: [{
            name: '_id',
            keyPath: true,
            keyPathValue: '_id'
        }, {
            name: 'userId',
            keyPathValue: 'userId'
        }]
    }];
    var a = new CreateTables('test', 1, tables);

    setTimeout(function () {
        a.models.users.addMultiple([{
            email: 'test1',
            addresses: [1, 3],
            name: {
                firstName: 'Test',
                lastName: 'LastTest'
            }
        }, {
            email: 'test2',
            addresses: [2]
        }, {
            email: 'test3',
            addresses: ['1', '5']
        }, {
            email: 'test4',
            addresses: [3, 8]
        }]).then(function (records) {

            var result = records[1];
            result.name = {};
            result.name.firstName = 'Test';
            result.name.middleName = 'MiddleName';
            result.name.lastName = 'lasttesting';

            a.models.users.put(result).then(function () {
                a.models.users.select('firstName').equal('Test').getAll().then(function (records) {
                    console.log(records);
                });
            });
        }).catch(function (error) {
            console.log(error);
        });
    }, 2000);

}(window, Promise));
