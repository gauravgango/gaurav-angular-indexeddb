'use strict';

var gulp = require('gulp'),
    gutil = require("gulp-util"),
    del = require('del'),
    sourcemaps = require('gulp-sourcemaps'),
    uglify = require("gulp-uglify"),
    jshint = require("gulp-jshint"),
    jshintStylish = require('jshint-stylish'),
    rename = require("gulp-rename");


var paths = {
    src: ['./src/*.js'],
    dist: './dist'
};

gulp.task('dist:clean', function (cb) {
    del(paths.dist, {force: true}).then(cb(null))
});


gulp.task('dist:script', ['dist:clean'], function () {
    return gulp.src(paths.src)
        .pipe(jshint('.jshintrc'))
        .pipe(jshint.reporter(jshintStylish))
        .pipe(sourcemaps.init())
        .pipe(uglify())
        .pipe(rename('angular-indexeddb.min.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(paths.dist))
        .on('error', gutil.log)
});


gulp.task('dist', ['dist:clean', 'dist:script'], function (cb) {
    cb(null)
});
