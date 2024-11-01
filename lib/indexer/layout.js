/*!
 * layout.js - indexer layout for bcoin
 * Copyright (c) 2018, the bcoin developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const bdb = require('bdb');

/*
 * Index database layout:
 * To be extended by indexer implementations.
 *
 *  V -> db version
 *  O -> flags
 *  h[height] -> block hash
 *  R -> index sync height
 */

const layout = {
  V: bdb.key('V'),
  O: bdb.key('O'),
  h: bdb.key('h', ['uint32']),
  R: bdb.key('R')
};

// add txindex layout
Object.assign(layout, {
  t: bdb.key('t', ['hash256']),
  b: bdb.key('b', ['uint32'])
});

// add slpindex layout
Object.assign(layout, {
  S: bdb.key('S', ['uint32']),
  s: bdb.key('s', ['uint32', 'uint32']),
  i: bdb.key('i', ['hash256']),
  b: bdb.key('b', ['uint32']),
  t: bdb.key('t', ['hash256'])
});


module.exports = layout;
