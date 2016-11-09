const $ = require('sanctuary-def');
const {env, create} = require('sanctuary');
const Future = require('fluture');


const FutureType = $.BinaryType(
  Future.name,
  Future.isFuture,
  Future.extractLeft,
  Future.extractRight
);

module.exports = create({
  checkTypes: true,
  env: env.concat([FutureType])
});
