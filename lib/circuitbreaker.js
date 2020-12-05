'use strict'
const Firestore = require('@google-cloud/firestore');
const db = new Firestore({
  projectId: 'develop-circuitbreaker-ch-com',
  keyFilename: 'develop-circuitbreaker-ch-com-6ebc07f29eab.json',
});
// circuitBreakerTable value is the name of the GCP Firestore DB
// TODO replace these with the env variables that were originally present.
const circuitBreakerTable = 'circuits'
//'develop-circuitbreaker-ch-com.appspot.com'
// cloudFunctionName is the name of the GCP Cloud Function
const cloudFunctionName = 'circuitbreaker-test-fn'
//process.env.GCP_CLOUD_FUNCTION_NAME

var CircuitBreaker = (function () {
  function CircuitBreaker (request, options) {
    if (options === undefined) {
      options = {}
    }
    const defaults = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 10000,
      fallback: null
    }
    Object.assign(this, defaults, options, {
      request: request,
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      nextAttempt: Date.now()
    })

  }


  var _proto = CircuitBreaker.prototype

  _proto.fire = async function fire () {
    const data = await this.getState()
    // can we console.log to get the state here?  It's a little wonky that it doesn't really handle 
    // an undefined state value 
    console.log('getState():', JSON.stringify(data, Object.keys(data).sort()))
    if (data.st !== undefined) {
      this.state = data.st // circuitState
      this.failureCount = data.fc  // failureCount
      this.successCount = data.sc // successCount
      this.nextAttempt = data.na // nextAttempt
    }
    if (this.state === 'OPEN') {
      if (this.nextAttempt <= Date.now()) {
        this.half()
      } else {
        if (this.fallback) {
          return this.tryFallback()
        }
        throw new Error('CircuitBreaker state: OPEN')
      }
    }
    try {
      const response = await this.request()
      return this.success(response)
    } catch (err) {
      return this.fail(err)
    }
  }

  _proto.success = async function success (response) {
    if (this.state === 'HALF') {
      this.successCount++
      if (this.successCount > this.successThreshold) {
        this.close()
      }
    }
    this.failureCount = 0
    await this.updateState()
    return response
  }

  _proto.fail = async function fail (err) {
    this.failureCount++
    if (this.failureCount >= this.failureThreshold) {
      this.open()
    }
    await this.updateState()
    if (this.fallback) return this.tryFallback()
    return err
  }

  _proto.open = function open () {
    console.log('CircuitBreaker state: OPEN')
    this.state = 'OPEN'
    this.nextAttempt = Date.now() + this.timeout
  }

  _proto.close = function close () {
    console.log('CircuitBreaker state: CLOSED')
    this.successCount = 0
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  _proto.half = function half () {
    console.log('CircuitBreaker state: HALF')
    this.state = 'HALF'
  }

  _proto.tryFallback = async function tryFallback () {
    console.log('CircuitBreaker Fallback request')
    try {
      const response = await this.fallback()
      return response
    } catch (err) {
      return err
    }
  }

  _proto.getState = async function getState () {
    try {
      const data = await db.collection(circuitBreakerTable).doc(cloudFunctionName).get()
      
      // .get(ddbParams).promise()
      return data.data()
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  _proto.updateState = async function updateState () {
    try {
      const params = {
          'st': this.state,
          'fc': this.failureCount,
          'sc': this.successCount,
          'na': this.nextAttempt,
          'ts': Date.now()
        }
      const data = await db.collection(circuitBreakerTable).doc(cloudFunctionName).set(params)

      return data
    } catch (err) {
      console.log(err)
      return err
    }
  }
  return CircuitBreaker
})()

module.exports = CircuitBreaker
